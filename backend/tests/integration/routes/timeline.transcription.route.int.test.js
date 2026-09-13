const { OPENAI_MODEL_ENV } = require('../../_helpers/openai');
const mockTranscribeFromBuffer = jest.fn();

jest.mock('../../../integrations/openai/audio.client', () =>
  jest.fn(() => ({
    transcribeFromBuffer: mockTranscribeFromBuffer,
  }))
);

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const transcriptionRouter = require('../../../routes/timeline/transcription.route');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const FloorMember = require('../../../models/FloorMember');
const RoomMember = require('../../../models/RoomMember');
const KickedUser = require('../../../models/KickedUser');

describe('音声の文字起こしAPI', () => {
  let app;

  const ORIGINAL_ENV = {
    ...Object.fromEntries(Object.keys(OPENAI_MODEL_ENV).map((name) => [name, process.env[name]])),
    JWT_SECRET: process.env.JWT_SECRET,
    EXTERNAL_OPENAI_ENABLED: process.env.EXTERNAL_OPENAI_ENABLED,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  const ensureEnv = () => {
    Object.assign(process.env, OPENAI_MODEL_ENV);
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.EXTERNAL_OPENAI_ENABLED = 'true';
    if (!process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = 'test-openai-key';
  };

  const restoreEnv = () => {
    Object.keys(OPENAI_MODEL_ENV).forEach((name) => {
      if (ORIGINAL_ENV[name] === undefined) delete process.env[name];
      else process.env[name] = ORIGINAL_ENV[name];
    });
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
    if (ORIGINAL_ENV.EXTERNAL_OPENAI_ENABLED === undefined) delete process.env.EXTERNAL_OPENAI_ENABLED;
    else process.env.EXTERNAL_OPENAI_ENABLED = ORIGINAL_ENV.EXTERNAL_OPENAI_ENABLED;
    if (ORIGINAL_ENV.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;
  };

  const buildToken = (user) =>
    jwt.sign({ user_id: user._id.toString(), user_role: user.role }, process.env.JWT_SECRET);

  const buildApp = () => {
    const a = express();
    a.use(express.json());
    a.use('/timeline', transcriptionRouter);
    return attachErrorHandler(a);
  };

  const createUser = (overrides = {}) =>
    User.create({
      username: `user-${Date.now()}-${Math.random()}`,
      mail: `user-${Date.now()}-${Math.random()}@example.com`,
      lang: 'ja',
      ...overrides,
    });

  const createFloor = (owner, overrides = {}) =>
    Floor.create({
      user: owner._id,
      title: 'Floor',
      lang: 'ja',
      target_langs: [],
      ...overrides,
    });

  const createRoom = (owner, floor, overrides = {}) =>
    Room.create({
      user: owner._id,
      floor: floor._id,
      title: 'Room',
      lang: 'ja',
      member_only: false,
      ...overrides,
    });

  beforeAll(() => {
    ensureEnv();
  });

  afterAll(() => {
    restoreEnv();
  });

  beforeEach(() => {
    ensureEnv();
    mockTranscribeFromBuffer.mockReset();
    app = buildApp();
  });

  test('503: 文字起こし無効時は認証後かつファイル処理前に拒否する', async () => {
    const user = await createUser({ role: 'Author' });
    process.env.EXTERNAL_OPENAI_ENABLED = 'false';
    delete process.env.OPENAI_API_KEY;

    const res = await request(app)
      .post('/timeline/transcription/audio')
      .set('Authorization', `Bearer ${buildToken(user)}`);

    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe('EXTERNAL_FEATURE_DISABLED');
    expect(res.body?.error?.details).toEqual({ feature: 'openaiTranscription' });
    expect(mockTranscribeFromBuffer).not.toHaveBeenCalled();
  });

  test('認証ヘッダがなければTOKEN_INVALIDを返す（HTTP 401）', async () => {
    const res = await request(app)
      .post('/timeline/transcription/audio')
      .field('room_id', '507f191e810c19729de860ea')
      .field('lang', 'ja');

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('ルームIDが不正ならINVALID_PARAMSを返す（HTTP 400）', async () => {
    const user = await createUser({ role: 'Author' });

    const res = await request(app)
      .post('/timeline/transcription/audio')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .field('room_id', 'invalid')
      .field('lang', 'ja')
      .attach('file', Buffer.from('audio'), {
        filename: 'sample.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('ファイルの項目名が不正ならINVALID_FILEを返す（HTTP 400）', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);

    const res = await request(app)
      .post('/timeline/transcription/audio')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .field('room_id', room._id.toString())
      .field('lang', 'ja')
      .attach('wrong', Buffer.from('audio'), {
        filename: 'sample.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_FILE');
  });

  test('ファイルが容量上限を超えた場合はFILE_TOO_LARGEを返す（HTTP 413）', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);
    const bigBuffer = Buffer.alloc(6 * 1024 * 1024 + 1, 0);

    const res = await request(app)
      .post('/timeline/transcription/audio')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .field('room_id', room._id.toString())
      .field('lang', 'ja')
      .attach('file', bigBuffer, {
        filename: 'big.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(413);
    expect(res.body?.error?.code).toBe('FILE_TOO_LARGE');
  });

  test('言語が不正ならINVALID_PARAMSを返す（HTTP 400）', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);

    const res = await request(app)
      .post('/timeline/transcription/audio')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .field('room_id', room._id.toString())
      .field('lang', 'zz')
      .attach('file', Buffer.from('audio'), {
        filename: 'sample.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('音声を文字起こしできる（HTTP 200）', async () => {
    mockTranscribeFromBuffer.mockResolvedValue('hello');
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);

    const res = await request(app)
      .post('/timeline/transcription/audio')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .field('room_id', room._id.toString())
      .field('lang', 'ja')
      .attach('file', Buffer.from('audio'), {
        filename: 'sample.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('hello');
  });

  test('メンバー限定ルームの非メンバーは文字起こしを使えない（HTTP 401）', async () => {
    mockTranscribeFromBuffer.mockResolvedValue('should-not-run');
    const owner = await createUser({ role: 'Editor' });
    const outsider = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor, { member_only: true });

    const res = await request(app)
      .post('/timeline/transcription/audio')
      .set('Authorization', `Bearer ${buildToken(outsider)}`)
      .field('room_id', room._id.toString())
      .field('lang', 'ja')
      .attach('file', Buffer.from('audio'), {
        filename: 'sample.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PERMISSION');
    expect(mockTranscribeFromBuffer).not.toHaveBeenCalled();
  });

  test('フロア・ルームメンバーは限定ルームでも文字起こしを使える（HTTP 200）', async () => {
    mockTranscribeFromBuffer.mockResolvedValueOnce('floor member').mockResolvedValueOnce('room member');
    const owner = await createUser({ role: 'Editor' });
    const floorMember = await createUser({ role: 'Author' });
    const roomMember = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor, { member_only: true });
    await FloorMember.create({ floor: floor._id, user: floorMember._id });
    await RoomMember.create({ floor: floor._id, room: room._id, user: roomMember._id });

    const transcribe = (user) =>
      request(app)
        .post('/timeline/transcription/audio')
        .set('Authorization', `Bearer ${buildToken(user)}`)
        .field('room_id', room._id.toString())
        .field('lang', 'ja')
        .attach('file', Buffer.from('audio'), {
          filename: 'sample.mp3',
          contentType: 'audio/mpeg',
        });

    const floorMemberResponse = await transcribe(floorMember);
    const roomMemberResponse = await transcribe(roomMember);

    expect(floorMemberResponse.status).toBe(200);
    expect(floorMemberResponse.body.text).toBe('floor member');
    expect(roomMemberResponse.status).toBe(200);
    expect(roomMemberResponse.body.text).toBe('room member');
    expect(mockTranscribeFromBuffer).toHaveBeenCalledTimes(2);
  });

  test('キックされたユーザは文字起こしを使えない（HTTP 401）', async () => {
    mockTranscribeFromBuffer.mockResolvedValue('should-not-run');
    const owner = await createUser({ role: 'Editor' });
    const kickedUser = await createUser({ role: 'Author' });
    const floor = await createFloor(owner);
    const room = await createRoom(owner, floor);
    await KickedUser.create({
      user: kickedUser._id,
      kicked_by: owner._id,
      floor: floor._id,
      room: room._id,
    });

    const res = await request(app)
      .post('/timeline/transcription/audio')
      .set('Authorization', `Bearer ${buildToken(kickedUser)}`)
      .field('room_id', room._id.toString())
      .field('lang', 'ja')
      .attach('file', Buffer.from('audio'), {
        filename: 'sample.mp3',
        contentType: 'audio/mpeg',
      });

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PERMISSION');
    expect(mockTranscribeFromBuffer).not.toHaveBeenCalled();
  });

  test('ファイルがなければFILE_REQUIREDを返す（HTTP 400）', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);

    const res = await request(app)
      .post('/timeline/transcription/audio')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .field('room_id', room._id.toString())
      .field('lang', 'ja');

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('FILE_REQUIRED');
  });

  test('ファイル形式が不正ならINVALID_FILE_TYPEを返す（HTTP 400）', async () => {
    const user = await createUser({ role: 'Author' });
    const floor = await createFloor(user);
    const room = await createRoom(user, floor);

    const res = await request(app)
      .post('/timeline/transcription/audio')
      .set('Authorization', `Bearer ${buildToken(user)}`)
      .field('room_id', room._id.toString())
      .field('lang', 'ja')
      .attach('file', Buffer.from('text'), {
        filename: 'sample.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('INVALID_FILE_TYPE');
  });
});
