const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');

const { snapshotEnv, restoreEnv, createJwtToken } = require('../_helpers/auth');
const { buildErrorHandledApp } = require('../_helpers/app');
const { createUser, createFloor, createRoom } = require('../_helpers/models');
const {
  ensureDir,
  removeDirSafe,
  testRuntimePath,
  trailingSlash,
} = require('../../_helpers/testRuntime');

const ORIGINAL_ENV = snapshotEnv(['JWT_DEV_SECRET', 'MEDIA_PATH']);
const suiteRoot = testRuntimePath('v1-upload-main-service');
const mediaRoot = testRuntimePath('v1-upload-main-service', 'media');
process.env.JWT_DEV_SECRET = 'v1-upload-main-service-test-secret';
process.env.MEDIA_PATH = trailingSlash(mediaRoot);

const v1Router = require('../../../routes/v1');
const Chat = require('../../../models/Chat');
const KickedUser = require('../../../models/KickedUser');
const { AUDIO_LIMIT } = require('../../../constants/uploads');

const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const socket = { to: () => ({ emit: () => {} }) };
const buildToken = (user) =>
  createJwtToken(
    { user_id: user._id.toString(), user_role: 'developer' },
    process.env.JWT_DEV_SECRET
  );
const roomDirectory = (floor, room) =>
  path.join(mediaRoot, floor._id.toString(), room._id.toString());
const readDirectory = (directory) =>
  fs.existsSync(directory) ? fs.readdirSync(directory).sort() : [];
const exists = (directory, fileName) => fs.existsSync(path.join(directory, fileName));

const uploadImage = ({ app, user, floor, room }) =>
  request(app)
    .post('/api/v1/upload/image')
    .query({ room_id: room._id.toString() })
    .set('Authorization', `Bearer ${buildToken(user)}`)
    .field('floor_id', floor._id.toString())
    .field('room_id', room._id.toString())
    .attach('image_file', VALID_PNG, {
      filename: 'image.png',
      contentType: 'image/png',
    });

describe('v1と主系APIの共通アップロード処理', () => {
  let app;

  beforeEach(async () => {
    await removeDirSafe(suiteRoot);
    await ensureDir(mediaRoot);
    app = buildErrorHandledApp({
      mounts: [{ path: '/api/v1', handler: v1Router(socket) }],
    });
  });

  afterAll(async () => {
    restoreEnv(ORIGINAL_ENV);
    await removeDirSafe(suiteRoot);
  });

  test('画像は主系APIと同じ処理で本体とサムネイルを保存する', async () => {
    const developer = await createUser({ role: 'developer' });
    const floor = await createFloor(developer);
    const room = await createRoom(developer, floor);

    const response = await uploadImage({ app, user: developer, floor, room });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      image_name: expect.stringMatching(
        new RegExp(`^\\d+_${developer._id.toString()}\\.png$`)
      ),
      image_thumbnail_name: expect.stringMatching(
        new RegExp(`^\\d+_${developer._id.toString()}_thumbnail\\.png$`)
      ),
    });
    const directory = roomDirectory(floor, room);
    expect(exists(directory, response.body.image_name)).toBe(true);
    expect(exists(directory, response.body.image_thumbnail_name)).toBe(true);
  });

  test('大文字の同値IDでもDB由来の正規形ディレクトリへ保存する', async () => {
    const developer = await createUser({ role: 'developer' });
    const floor = await createFloor(developer, {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd7994390ab'),
    });
    const room = await createRoom(developer, floor, {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd7994390cd'),
    });
    const floorId = floor._id.toString();
    const roomId = room._id.toString();

    const response = await request(app)
      .post('/api/v1/upload/image')
      .query({ room_id: roomId.toUpperCase(), floor_id: floorId.toUpperCase() })
      .set('Authorization', `Bearer ${buildToken(developer)}`)
      .field('floor_id', floorId.toUpperCase())
      .field('room_id', roomId.toUpperCase())
      .attach('image_file', VALID_PNG, {
        filename: 'image.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(200);
    expect(exists(roomDirectory(floor, room), response.body.image_name)).toBe(true);
    expect(fs.readdirSync(path.join(mediaRoot, floorId))).toContain(roomId);
    expect(fs.readdirSync(path.join(mediaRoot, floorId))).not.toContain(roomId.toUpperCase());
  });

  test.each([
    ['限定Roomの非所属User', 'restricted', 401, 'INVALID_PERMISSION'],
    ['キック済みUser', 'kicked', 401, 'INVALID_PERMISSION'],
    ['論理削除済みRoom', 'deleted', 400, 'INVALID_PARAMS'],
  ])('%sはMulterより前に拒否され、ファイルを保存しない', async (_label, scenario, status, code) => {
    const owner = await createUser({ role: 'developer' });
    const developer = await createUser({ role: 'developer' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor, {
      member_only: scenario === 'restricted',
      delete_flg: scenario === 'deleted',
    });
    if (scenario === 'kicked') {
      await KickedUser.create({
        user: developer._id,
        kicked_by: owner._id,
        floor: floor._id,
        room: room._id,
      });
    }

    const response = await request(app)
      .post('/api/v1/upload/audio')
      .query({ room_id: room._id.toString() })
      .set('Authorization', `Bearer ${buildToken(developer)}`)
      .field('floor_id', floor._id.toString())
      .field('room_id', room._id.toString())
      .attach('audio_file', Buffer.alloc(AUDIO_LIMIT + 1), {
        filename: 'oversize.mp3',
        contentType: 'audio/mpeg',
      });

    expect(response.status).toBe(status);
    expect(response.body?.error?.code).toBe(code);
    expect(readDirectory(roomDirectory(floor, room))).toEqual([]);
  });

  test.each([
    ['floor_id', () => new mongoose.Types.ObjectId().toString(), (room) => room._id.toString()],
    ['room_id', (floor) => floor._id.toString(), () => new mongoose.Types.ObjectId().toString()],
  ])('bodyの%sが認可済み対象と異なる場合は受信ファイルを削除する', async (_field, floorValue, roomValue) => {
    const developer = await createUser({ role: 'developer' });
    const floor = await createFloor(developer);
    const room = await createRoom(developer, floor);

    const response = await request(app)
      .post('/api/v1/upload/audio')
      .query({ room_id: room._id.toString() })
      .set('Authorization', `Bearer ${buildToken(developer)}`)
      .field('floor_id', floorValue(floor))
      .field('room_id', roomValue(room))
      .attach('audio_file', Buffer.from('audio'), {
        filename: 'audio.mp3',
        contentType: 'audio/mpeg',
      });

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('INVALID_PARAMS');
    expect(readDirectory(roomDirectory(floor, room))).toEqual([]);
  });

  test('discardは本人の未参照ファイルを削除し、参照中ファイルを保持する', async () => {
    const developer = await createUser({ role: 'developer' });
    const floor = await createFloor(developer);
    const room = await createRoom(developer, floor);
    const unreferenced = await uploadImage({ app, user: developer, floor, room });
    const referenced = await uploadImage({ app, user: developer, floor, room });
    expect(unreferenced.status).toBe(200);
    expect(referenced.status).toBe(200);

    await Chat.create({
      floor: floor._id,
      room: room._id,
      user: developer._id,
      content: 'referenced image',
      lang: 'ja',
      image_name: referenced.body.image_name,
      image_thumbnail_name: referenced.body.image_thumbnail_name,
    });
    const discardedNames = [
      unreferenced.body.image_name,
      unreferenced.body.image_thumbnail_name,
    ];
    const retainedNames = [
      referenced.body.image_name,
      referenced.body.image_thumbnail_name,
    ];

    const response = await request(app)
      .post('/api/v1/upload/discard')
      .set('Authorization', `Bearer ${buildToken(developer)}`)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        file_names: [...discardedNames, ...retainedNames],
      });

    expect(response.status).toBe(200);
    expect(response.body.discarded_file_names).toEqual(discardedNames);
    expect(response.body.retained_file_names).toEqual(retainedNames);
    const directory = roomDirectory(floor, room);
    discardedNames.forEach((fileName) => expect(exists(directory, fileName)).toBe(false));
    retainedNames.forEach((fileName) => expect(exists(directory, fileName)).toBe(true));
  });

  test('discardは大文字の同値IDでも正規形ディレクトリの本人ファイルを削除する', async () => {
    const developer = await createUser({ role: 'developer' });
    const floor = await createFloor(developer);
    const room = await createRoom(developer, floor);
    const uploaded = await uploadImage({ app, user: developer, floor, room });
    expect(uploaded.status).toBe(200);

    const response = await request(app)
      .post('/api/v1/upload/discard')
      .set('Authorization', `Bearer ${buildToken(developer)}`)
      .send({
        floor_id: floor._id.toString().toUpperCase(),
        room_id: room._id.toString().toUpperCase(),
        file_names: [uploaded.body.image_name],
      });

    expect(response.status).toBe(200);
    expect(response.body.discarded_file_names).toEqual([uploaded.body.image_name]);
    expect(exists(roomDirectory(floor, room), uploaded.body.image_name)).toBe(false);
  });

  test('discardは他ユーザが発行したファイルを削除しない', async () => {
    const developer = await createUser({ role: 'developer' });
    const otherDeveloper = await createUser({ role: 'developer' });
    const floor = await createFloor(developer);
    const room = await createRoom(developer, floor);
    const uploaded = await uploadImage({ app, user: otherDeveloper, floor, room });
    expect(uploaded.status).toBe(200);

    const response = await request(app)
      .post('/api/v1/upload/discard')
      .set('Authorization', `Bearer ${buildToken(developer)}`)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        file_names: [uploaded.body.image_name],
      });

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('INVALID_PARAMS');
    expect(exists(roomDirectory(floor, room), uploaded.body.image_name)).toBe(true);
  });

  test('discardは保存先外を示す危険なファイル名を拒否する', async () => {
    const developer = await createUser({ role: 'developer' });
    const floor = await createFloor(developer);
    const room = await createRoom(developer, floor);

    const response = await request(app)
      .post('/api/v1/upload/discard')
      .set('Authorization', `Bearer ${buildToken(developer)}`)
      .send({
        floor_id: floor._id.toString(),
        room_id: room._id.toString(),
        file_names: ['../outside.png'],
      });

    expect(response.status).toBe(400);
    expect(response.body?.error?.code).toBe('INVALID_PARAMS');
    expect(readDirectory(roomDirectory(floor, room))).toEqual([]);
  });
});
