const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { createTestTempDir, removeDirSafe, trailingSlash } = require('../../_helpers/testRuntime');

jest.mock('fluent-ffmpeg', () => {
  const fs = require('fs');
  const path = require('path');

  let shouldFail = false;
  const chain = () => {
    const handlers = {};
    let outputPath = null;
    const api = {
      seekInput: () => api,
      outputOptions: () => api,
      output: (dest) => {
        outputPath = dest;
        return api;
      },
      audioCodec: () => api,
      audioBitrate: () => api,
      on: (event, handler) => {
        handlers[event] = handler;
        return api;
      },
      run: () => {
        if (shouldFail) {
          if (handlers.error) handlers.error(new Error('ffmpeg failed'));
          return api;
        }
        if (outputPath) {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, '');
        }
        if (handlers.end) handlers.end();
        return api;
      },
    };
    return api;
  };

  const ffmpeg = jest.fn(() => chain());
  ffmpeg.__setFail = (value) => {
    shouldFail = Boolean(value);
  };
  ffmpeg.ffprobe = jest.fn((file, cb) =>
    cb(null, { streams: [{ codec_type: 'video', tags: { rotate: '0' } }] })
  );
  return ffmpeg;
});

const ORIGINAL_ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
  MEDIA_PATH: process.env.MEDIA_PATH,
  PROFILE_PATH: process.env.PROFILE_PATH,
};

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';

const tempMediaRoot = createTestTempDir('upload-media');
const tempProfileRoot = createTestTempDir('upload-profile');
process.env.MEDIA_PATH = trailingSlash(tempMediaRoot);
process.env.PROFILE_PATH = trailingSlash(tempProfileRoot);

const uploadRouter = require('../../../routes/upload.route');
const resourceRouter = require('../../../routes/timeline/uploadResource.route');
const { IMAGE_LIMIT, SUBTITLE_LIMIT } = require('../../../constants/uploads');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const FloorMember = require('../../../models/FloorMember');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/upload', uploadRouter);
  app.use('/api', resourceRouter());
  return attachErrorHandler(app);
};

const buildToken = (user) => jwt.sign({ user_id: user._id.toString(), user_role: user.role }, process.env.JWT_SECRET);

const postTargetedUpload = (app, requestPath, floorId, roomId = null) => {
  const query = { floor_id: String(floorId) };
  if (roomId !== null) query.room_id = String(roomId);
  return request(app).post(requestPath).query(query);
};

const readDirSafe = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
};
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const createTimelineContext = async (prefix) => {
  const owner = await User.create({
    username: `${prefix}Owner`,
    mail: `${prefix}-${Date.now()}@example.com`,
    lang: 'ja',
    role: 'Editor',
  });
  const floor = await Floor.create({
    user: owner._id,
    title: `${prefix} Floor`,
    lang: 'ja',
  });
  const room = await Room.create({
    user: owner._id,
    floor: floor._id,
    title: `${prefix} Room`,
    lang: 'ja',
  });
  return { owner, floor, room, token: buildToken(owner) };
};

describe('メディアのアップロードAPI', () => {
  let app;

  afterAll(async () => {
    await removeDirSafe(tempMediaRoot);
    await removeDirSafe(tempProfileRoot);
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
    if (ORIGINAL_ENV.MEDIA_PATH === undefined) delete process.env.MEDIA_PATH;
    else process.env.MEDIA_PATH = ORIGINAL_ENV.MEDIA_PATH;
    if (ORIGINAL_ENV.PROFILE_PATH === undefined) delete process.env.PROFILE_PATH;
    else process.env.PROFILE_PATH = ORIGINAL_ENV.PROFILE_PATH;
  });

  beforeEach(() => {
    app = buildApp();
  });

  test('プロフィール画像を再エンコードし、サーバが決めた拡張子で保存する', async () => {
    const user = await User.create({
      username: 'Uploader',
      mail: `uploader-${Date.now()}@example.com`,
      lang: 'ja',
    });

    const res = await request(app)
      .post('/upload/profile/image')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .attach('image_file', VALID_PNG, {
        filename: 'avatar.html',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('image_name');
    expect(res.body.image_name).toMatch(/\.png$/);

    const savedPath = path.join(process.env.PROFILE_PATH, user._id.toString(), res.body.image_name);
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  test('画像のMIMEタイプを装ったHTMLのプロフィール画像を拒否する', async () => {
    const user = await User.create({
      username: 'HtmlUploader',
      mail: `html-${Date.now()}@example.com`,
      lang: 'ja',
    });

    const res = await request(app)
      .post('/upload/profile/image')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .attach('image_file', Buffer.from('<!doctype html><script>alert(1)</script>'), {
        filename: 'attack.html',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
    const profileDir = path.join(process.env.PROFILE_PATH, user._id.toString());
    expect(readDirSafe(profileDir)).toEqual([]);
  });

  test('許可されていないMIMEタイプのプロフィール画像を拒否する', async () => {
    const user = await User.create({
      username: 'BadUploader',
      mail: `bad-${Date.now()}@example.com`,
      lang: 'ja',
    });

    const res = await request(app)
      .post('/upload/profile/image')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .attach('image_file', Buffer.from('not-image'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('有効なファイルをフロア画像としてアップロードできる', async () => {
    const owner = await User.create({
      username: 'FloorOwner',
      mail: `floor-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Upload Floor',
      description: 'desc',
      lang: 'ja',
    });

    const res = await postTargetedUpload(app, '/upload/floor/image', floor._id)
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .field('_id', floor._id.toString())
      .attach('image_file', VALID_PNG, {
        filename: 'floor.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('image_name');

    const savedPath = path.join(process.env.MEDIA_PATH, floor._id.toString(), res.body.image_name);
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  test('フロアの更新権限がないユーザの画像を保存せず拒否する', async () => {
    const owner = await User.create({
      username: 'FloorAuthOwner',
      mail: `floor-auth-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const outsider = await User.create({
      username: 'FloorAuthOutsider',
      mail: `floor-auth-outsider-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Protected Upload Floor',
      description: 'desc',
      lang: 'ja',
    });

    const res = await postTargetedUpload(app, '/upload/floor/image', floor._id)
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .field('_id', floor._id.toString())
      .attach('image_file', VALID_PNG, {
        filename: 'floor.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
    const dir = path.join(process.env.MEDIA_PATH, floor._id.toString());
    expect(readDirSafe(dir)).toEqual([]);
  });

  test('有効なファイルをルーム画像としてアップロードできる', async () => {
    const owner = await User.create({
      username: 'RoomOwner',
      mail: `room-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Room Floor',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Room',
      description: 'desc',
      lang: 'ja',
    });

    const res = await postTargetedUpload(app, '/upload/room/image', floor._id, room._id)
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .field('floor_id', floor._id.toString())
      .field('_id', room._id.toString())
      .attach('image_file', VALID_PNG, {
        filename: 'room.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('image_name');

    const savedPath = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString(), res.body.image_name);
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  test('フロアメンバーはルーム画像をアップロードできる', async () => {
    const owner = await User.create({
      username: 'RoomMemberOwner',
      mail: `room-member-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const member = await User.create({
      username: 'RoomFloorMember',
      mail: `room-floor-member-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Member Upload Floor',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Member Upload Room',
      description: 'desc',
      lang: 'ja',
    });
    await FloorMember.create({ floor: floor._id, user: member._id });

    const res = await postTargetedUpload(app, '/upload/room/image', floor._id, room._id)
      .set('Authorization', `Bearer ${buildToken(member)}`)
      .field('floor_id', floor._id.toString())
      .field('_id', room._id.toString())
      .attach('image_file', VALID_PNG, {
        filename: 'room.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('image_name');
    const savedPath = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString(), res.body.image_name);
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  test('フロアへの権限がないユーザのルーム画像を保存せず拒否する', async () => {
    const owner = await User.create({
      username: 'RoomAuthOwner',
      mail: `room-auth-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const outsider = await User.create({
      username: 'RoomAuthOutsider',
      mail: `room-auth-outsider-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Protected Room Floor',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Protected Room',
      description: 'desc',
      lang: 'ja',
    });

    const res = await postTargetedUpload(app, '/upload/room/image', floor._id, room._id)
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .field('floor_id', floor._id.toString())
      .field('_id', room._id.toString())
      .attach('image_file', VALID_PNG, {
        filename: 'room.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');
    const dir = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());
    expect(readDirSafe(dir)).toEqual([]);
  });

  test('フロアが不正なら画像のアップロードを取り消す', async () => {
    const user = await User.create({
      username: 'FloorUploader',
      mail: `floor-${Date.now()}@example.com`,
      lang: 'ja',
    });

    const invalidFloorId = new mongoose.Types.ObjectId().toString();

    const res = await postTargetedUpload(app, '/upload/floor/image', invalidFloorId)
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .field('_id', invalidFloorId)
      .attach('image_file', VALID_PNG, {
        filename: 'floor.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');

    const dir = path.join(process.env.MEDIA_PATH, invalidFloorId);
    expect(readDirSafe(dir).length).toBe(0);
  });

  test('タイムラインの画像を再エンコードし、本体とサムネイルを保存する', async () => {
    const owner = await User.create({
      username: 'TimelineImageOwner',
      mail: `timeline-image-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Timeline Image Floor',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Timeline Image Room',
      description: 'desc',
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/image`)
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .attach('image_file', VALID_PNG, {
        filename: 'timeline.html',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    expect(res.body.image_name).toMatch(/\.png$/);
    expect(res.body.image_thumbnail_name).toMatch(/_thumbnail\.png$/);
    const dir = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());
    expect(fs.existsSync(path.join(dir, res.body.image_name))).toBe(true);
    expect(fs.existsSync(path.join(dir, res.body.image_thumbnail_name))).toBe(true);
  });

  test('権限がなければタイムライン画像のアップロードを取り消す', async () => {
    const owner = await User.create({
      username: 'Owner',
      mail: `owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const outsider = await User.create({
      username: 'Outsider',
      mail: `outsider-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });

    const floor = await Floor.create({
      user: owner._id,
      title: 'Private Floor',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Private Room',
      member_only: true,
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/image`)
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .attach('image_file', VALID_PNG, {
        filename: 'timeline.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');

    const dir = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());
    expect(readDirSafe(dir).length).toBe(0);
  });

  test('プロフィール画像が容量上限を超えた場合はFILE_TOO_LARGEを返す', async () => {
    const user = await User.create({
      username: 'BigUploader',
      mail: `big-${Date.now()}@example.com`,
      lang: 'ja',
    });

    const bigBuffer = Buffer.alloc(IMAGE_LIMIT + 1, 0);

    const res = await request(app)
      .post('/upload/profile/image')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .attach('image_file', bigBuffer, {
        filename: 'big.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(413);
    expect(res.body?.error?.code).toBe('FILE_TOO_LARGE');

    const dir = path.join(process.env.PROFILE_PATH, user._id.toString());
    expect(readDirSafe(dir).length).toBe(0);
  });

  test('不正な音声ファイルを解析する前にアップロード権限を確認する', async () => {
    const owner = await User.create({
      username: 'AudioOwner',
      mail: `audio-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const outsider = await User.create({
      username: 'AudioOutsider',
      mail: `audio-outsider-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Author',
    });

    const floor = await Floor.create({
      user: owner._id,
      title: 'Audio Floor',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Audio Room',
      member_only: true,
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/audio`)
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .attach('audio_file', Buffer.from('not-audio'), {
        filename: 'clip.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('FORBIDDEN');

    const dir = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());
    expect(readDirSafe(dir).length).toBe(0);
  });

  test('音声アップロードの本文が認可済みの対象と違えば拒否して受信ファイルを削除する', async () => {
    const { owner, floor, room, token } = await createTimelineContext('target-mismatch');
    const anotherRoom = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Target Mismatch Room',
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/audio`)
      .set('Authorization', `Bearer ${token}`)
      .field('room_id', anotherRoom._id.toString())
      .attach('audio_file', Buffer.from('audio'), {
        filename: 'clip.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
    const authorizedDir = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());
    const bodyDir = path.join(process.env.MEDIA_PATH, floor._id.toString(), anotherRoom._id.toString());
    expect(readDirSafe(authorizedDir)).toEqual([]);
    expect(readDirSafe(bodyDir)).toEqual([]);
  });

  test('MP3音声をアップロードできる', async () => {
    const owner = await User.create({
      username: 'AudioOwnerOk',
      mail: `audio-owner-ok-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Audio Floor Ok',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Audio Room Ok',
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/audio`)
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .attach('audio_file', Buffer.from('audio'), {
        filename: 'clip.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('audio_name');

    const savedPath = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString(), res.body.audio_name);
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  test('必要な場合はアップロード音声をMP3へ変換する', async () => {
    const owner = await User.create({
      username: 'AudioOwnerConvert',
      mail: `audio-owner-convert-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Audio Floor Convert',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Audio Room Convert',
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/audio`)
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .attach('audio_file', Buffer.from('audio'), {
        filename: 'clip.wav',
        contentType: 'audio/wav',
      });

    expect(res.status).toBe(201);
    expect(res.body.audio_name.endsWith('.mp3')).toBe(true);

    const savedPath = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString(), res.body.audio_name);
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  test('音声の変換に失敗した場合はエラーを返す', async () => {
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.__setFail(true);

    const owner = await User.create({
      username: 'AudioOwnerFail',
      mail: `audio-owner-fail-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Audio Floor Fail',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Audio Room Fail',
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/audio`)
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .attach('audio_file', Buffer.from('audio'), {
        filename: 'clip.wav',
        contentType: 'audio/wav',
      });

    expect(res.status).toBe(500);
    expect(res.body?.error?.code).toBe('INTERNAL_SERVER_ERROR');

    ffmpeg.__setFail(false);
  });

  test('有効な動画ファイルをアップロードできる', async () => {
    const owner = await User.create({
      username: 'VideoOwnerOk',
      mail: `video-owner-ok-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Video Floor Ok',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Video Room Ok',
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/video`)
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .attach('video_file', Buffer.from('video'), {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('video_name');
    expect(res.body).toHaveProperty('video_thumbnail_name');

    const savedPath = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString(), res.body.video_name);
    expect(fs.existsSync(savedPath)).toBe(true);
  });

  test('動画の字幕ファイルを受け付ける', async () => {
    const owner = await User.create({
      username: 'VideoOwnerSubtitle',
      mail: `video-owner-subtitle-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Video Floor Subtitle',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Video Room Subtitle',
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/video`)
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .attach('video_file', Buffer.from('video'), {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
      })
      .attach('video_subtitle_file', Buffer.from('subtitle'), {
        filename: 'clip.vtt',
        contentType: 'text/vtt',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('video_subtitle_name');

    const subtitlePath = path.join(
      process.env.MEDIA_PATH,
      floor._id.toString(),
      room._id.toString(),
      res.body.video_subtitle_name
    );
    expect(fs.existsSync(subtitlePath)).toBe(true);
  });

  test('不正な字幕ファイルを無視する', async () => {
    const owner = await User.create({
      username: 'VideoOwnerInvalidSub',
      mail: `video-owner-invalid-sub-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Video Floor Invalid Sub',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Video Room Invalid Sub',
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/video`)
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .attach('video_file', Buffer.from('video'), {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
      })
      .attach('video_subtitle_file', Buffer.from('subtitle'), {
        filename: 'clip.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(201);
    expect(res.body.video_subtitle_name).toBeNull();
  });

  test('動画ファイルがなければアップロードを拒否する', async () => {
    const owner = await User.create({
      username: 'VideoOwnerMissing',
      mail: `video-owner-missing-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });
    const floor = await Floor.create({
      user: owner._id,
      title: 'Video Floor Missing',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Video Room Missing',
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/video`)
      .set('Authorization', `Bearer ${buildToken(owner)}`);

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('動画の拡張子が不正ならアップロードを拒否する', async () => {
    const owner = await User.create({
      username: 'VideoOwner',
      mail: `video-owner-${Date.now()}@example.com`,
      lang: 'ja',
      role: 'Editor',
    });

    const floor = await Floor.create({
      user: owner._id,
      title: 'Video Floor',
      description: 'desc',
      lang: 'ja',
    });
    const room = await Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Video Room',
      lang: 'ja',
    });

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/video`)
      .set('Authorization', `Bearer ${buildToken(owner)}`)
      .attach('video_file', Buffer.from('not-video'), {
        filename: 'movie.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');

    const dir = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());
    expect(readDirSafe(dir).length).toBe(0);
  });

  test('動画を再送せず字幕だけをアップロードできる', async () => {
    const { floor, room, token } = await createTimelineContext('subtitle-only');
    const roomDir = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/video`)
      .set('Authorization', `Bearer ${token}`)
      .attach('video_subtitle_file', Buffer.from('WEBVTT'), {
        filename: 'subtitle.vtt',
        contentType: 'text/vtt',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      video_name: null,
      video_thumbnail_name: null,
      video_subtitle_name: expect.stringMatching(/\.vtt$/),
    });
    expect(readDirSafe(roomDir)).toEqual([res.body.video_subtitle_name]);
    expect(fs.existsSync(path.join(roomDir, res.body.video_subtitle_name))).toBe(true);
  });

  test('字幕が容量上限を超えた場合は受信した全ファイルを削除する', async () => {
    const { floor, room, token } = await createTimelineContext('subtitle-limit');
    const roomDir = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());

    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/video`)
      .set('Authorization', `Bearer ${token}`)
      .attach('video_file', Buffer.from('video'), {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
      })
      .attach('video_subtitle_file', Buffer.alloc(SUBTITLE_LIMIT + 1, 0x61), {
        filename: 'subtitle.vtt',
        contentType: 'text/vtt',
      });

    expect(res.status).toBe(413);
    expect(res.body?.error?.code).toBe('FILE_TOO_LARGE');
    expect(readDirSafe(roomDir)).toEqual([]);
  });

  test('未添付メディアの破棄APIはアップロード済みの対象を即時削除する', async () => {
    const { floor, room, token } = await createTimelineContext('discard');
    const roomDir = path.join(process.env.MEDIA_PATH, floor._id.toString(), room._id.toString());

    const uploaded = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/image`)
      .set('Authorization', `Bearer ${token}`)
      .attach('image_file', VALID_PNG, {
        filename: 'image.png',
        contentType: 'image/png',
      });
    expect(uploaded.status).toBe(201);

    const fileNames = [uploaded.body.image_name, uploaded.body.image_thumbnail_name];
    const discarded = await request(app)
      .post(`/api/rooms/${room._id}/timeline/uploads/discard`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        file_names: fileNames,
      });

    expect(discarded.status).toBe(200);
    expect(discarded.body.discarded_file_names).toEqual(fileNames);
    expect(readDirSafe(roomDir)).toEqual([]);
  });

  test.each([
    ['image', 'image_file', 'image.png', 'image/png', VALID_PNG, 'image_name'],
    ['video', 'video_subtitle_file', 'subtitle.vtt', 'text/vtt', Buffer.from('WEBVTT'), 'video_subtitle_name'],
    ['audio', 'audio_file', 'sound.mp3', 'audio/mpeg', Buffer.from('audio'), 'audio_name'],
  ])('%sのアップロードはルームからフロアを特定し、ファイルだけの本文を受け付ける', async (kind, field, filename, contentType, data, key) => {
    const { floor, room, token } = await createTimelineContext(`resource-${kind}`);
    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/${kind}`)
      .set('Authorization', `Bearer ${token}`).attach(field, data, { filename, contentType });
    expect(res.status).toBe(201);
    expect(res.body[key]).toEqual(expect.any(String));
    const dir = path.join(tempMediaRoot, String(floor._id), String(room._id));
    expect(fs.existsSync(path.join(dir, res.body[key]))).toBe(true);
  });

  test('本文に対象範囲を含むアップロードを拒否し、読込済みファイルを削除する', async () => {
    const { floor, room, token } = await createTimelineContext('resource-body');
    const res = await request(app).post(`/api/rooms/${room._id}/timeline/uploads/audio`)
      .set('Authorization', `Bearer ${token}`).field('floor_id', String(floor._id))
      .attach('audio_file', Buffer.from('audio'), { filename: 'sound.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAMS');
    expect(readDirSafe(path.join(tempMediaRoot, String(floor._id), String(room._id)))).toEqual([]);
  });

  test('アップロードはmultipartの解析前に認可し、余分な対象指定のクエリを拒否する', async () => {
    const { floor, room, token } = await createTimelineContext('resource-access');
    await Room.updateOne({ _id: room._id }, { member_only: true });
    const outsider = await User.create({ username: 'UploadOutsider', mail: 'upload-outsider@example.com', lang: 'ja' });
    const endpoint = `/api/rooms/${room._id}/timeline/uploads/image`;
    const denied = await request(app).post(endpoint).set('Authorization', `Bearer ${buildToken(outsider)}`)
      .attach('image_file', VALID_PNG, { filename: 'image.png', contentType: 'image/png' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    expect((await request(app).post(endpoint)).status).toBe(401);
    const redundant = await request(app).post(endpoint).set('Authorization', `Bearer ${token}`)
      .query({ floor_id: String(floor._id) });
    expect(redundant.status).toBe(400);
    expect(readDirSafe(path.join(tempMediaRoot, String(floor._id), String(room._id)))).toEqual([]);
  });

  test('一括破棄は全対象を検証してから削除し、参照中のメディアを保持する', async () => {
    const { owner, floor, room, token } = await createTimelineContext('resource-discard');
    const endpoint = `/api/rooms/${room._id}/timeline/uploads`;
    const uploaded = await request(app).post(`${endpoint}/image`).set('Authorization', `Bearer ${token}`)
      .attach('image_file', VALID_PNG, { filename: 'image.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    const fileNames = [uploaded.body.image_name, uploaded.body.image_thumbnail_name];
    const dir = path.join(tempMediaRoot, String(floor._id), String(room._id));
    const invalid = await request(app).post(`${endpoint}/discard`).set('Authorization', `Bearer ${token}`)
      .send({ file_names: [fileNames[0], '../invalid.png'] });
    expect(invalid.status).toBe(400);
    expect(readDirSafe(dir).sort()).toEqual([...fileNames].sort());
    const Chat = require('../../../models/Chat');
    await Chat.create({ user: owner._id, floor: floor._id, room: room._id, lang: 'ja', content: 'attached', image_name: fileNames[0] });
    const discarded = await request(app).post(`${endpoint}/discard`).set('Authorization', `Bearer ${token}`)
      .send({ file_names: fileNames });
    expect(discarded.status).toBe(200);
    expect(discarded.body.retained_file_names).toEqual([fileNames[0]]);
    expect(discarded.body.discarded_file_names).toEqual([fileNames[1]]);
    expect(readDirSafe(dir)).toEqual([fileNames[0]]);
  });

});
