const cookieParser = require('cookie-parser');
const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const request = require('supertest');

const { createTestTempDir, removeDirSafe } = require('../../_helpers/testRuntime');
const { attachErrorHandler } = require('../_helpers/app');
const { snapshotEnv, restoreEnv } = require('../_helpers/auth');

const ORIGINAL_ENV = snapshotEnv(['JWT_SECRET', 'GUEST_JWT_SECRET', 'GUEST_REFRESH_SECRET']);
process.env.JWT_SECRET = 'media-access-user-secret';
process.env.GUEST_JWT_SECRET = 'media-access-guest-secret';
process.env.GUEST_REFRESH_SECRET = 'media-access-guest-refresh-secret';

const createMediaRoute = require('../../../routes/media.route');
const { USER_MEDIA_COOKIE, GUEST_MEDIA_COOKIE } = require('../../../utils/mediaAccessCookie');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const KickedUser = require('../../../models/KickedUser');

const mediaRoot = createTestTempDir('media-access');
let mediaSequence = 0;

const buildApp = () => {
  const app = express();
  app.use(cookieParser());
  app.use('/media', createMediaRoute({ mediaRoot }));
  app.use('/media', express.static(mediaRoot));
  return attachErrorHandler(app);
};

const buildUserToken = (user, sessionVersion = user.session_version || 0) =>
  jwt.sign(
    {
      user_id: user._id.toString(),
      user_role: user.role,
      session_version: sessionVersion,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

const buildGuestToken = () =>
  jwt.sign({ guest_id: '00000000-0000-4000-8000-000000000001' }, process.env.GUEST_JWT_SECRET, {
    expiresIn: '1h',
  });

const createContext = async ({ memberOnly = false } = {}) => {
  mediaSequence += 1;
  const owner = await User.create({
    username: `MediaOwner-${mediaSequence}`,
    mail: `media-owner-${mediaSequence}@example.com`,
    lang: 'ja',
    role: 'Editor',
  });
  const floor = await Floor.create({ user: owner._id, title: 'Media Floor', lang: 'ja' });
  const room = await Room.create({
    user: owner._id,
    floor: floor._id,
    title: 'Media Room',
    lang: 'ja',
    member_only: memberOnly,
  });
  const directory = path.join(mediaRoot, floor._id.toString(), room._id.toString());
  fs.mkdirSync(directory, { recursive: true });
  const fileName = 'protected.mp3';
  fs.writeFileSync(path.join(directory, fileName), Buffer.from('0123456789'));
  return { owner, floor, room, fileName };
};

const mediaPath = ({ floor, room, fileName }) =>
  `/media/${floor._id.toString()}/${room._id.toString()}/${fileName}`;

describe('ルームのメディア取得権限', () => {
  const app = buildApp();

  afterAll(async () => {
    await removeDirSafe(mediaRoot);
    restoreEnv(ORIGINAL_ENV);
  });

  test('有効なユーザは限定ルームのメディアを取得でき、private・no-storeになる', async () => {
    const context = await createContext({ memberOnly: true });
    const token = buildUserToken(context.owner);

    const response = await request(app)
      .get(mediaPath(context))
      .set('Cookie', `${USER_MEDIA_COOKIE}=${token}`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.body).toEqual(Buffer.from('0123456789'));
  });

  test('認可済みメディアはRange リクエストを維持する', async () => {
    const context = await createContext({ memberOnly: true });
    const token = buildUserToken(context.owner);

    const response = await request(app)
      .get(mediaPath(context))
      .set('Cookie', `${USER_MEDIA_COOKIE}=${token}`)
      .set('Range', 'bytes=2-5');

    expect(response.status).toBe(206);
    expect(response.headers['content-range']).toBe('bytes 2-5/10');
    expect(response.body).toEqual(Buffer.from('2345'));
  });

  test('限定ルームへ権限がないユーザはメディアを取得できない', async () => {
    const context = await createContext({ memberOnly: true });
    const outsider = await User.create({
      username: `MediaOutsider-${Date.now()}`,
      mail: `media-outsider-${Date.now()}@example.com`,
      lang: 'ja',
    });

    const response = await request(app)
      .get(mediaPath(context))
      .set('Cookie', `${USER_MEDIA_COOKIE}=${buildUserToken(outsider)}`);

    expect(response.status).toBe(401);
    expect(response.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('キック済みユーザは公開ルームでもメディアを取得できない', async () => {
    const context = await createContext();
    const kicked = await User.create({
      username: `MediaKicked-${Date.now()}`,
      mail: `media-kicked-${Date.now()}@example.com`,
      lang: 'ja',
    });
    await KickedUser.create({
      user: kicked._id,
      kicked_by: context.owner._id,
      floor: context.floor._id,
      room: context.room._id,
    });

    const response = await request(app)
      .get(mediaPath(context))
      .set('Cookie', `${USER_MEDIA_COOKIE}=${buildUserToken(kicked)}`);

    expect(response.status).toBe(401);
    expect(response.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('ゲストは公開ルームのメディアだけ取得できる', async () => {
    const publicContext = await createContext();
    const privateContext = await createContext({ memberOnly: true });
    const cookie = `${GUEST_MEDIA_COOKIE}=${buildGuestToken()}`;

    const publicResponse = await request(app).get(mediaPath(publicContext)).set('Cookie', cookie);
    const privateResponse = await request(app).get(mediaPath(privateContext)).set('Cookie', cookie);

    expect(publicResponse.status).toBe(200);
    expect(privateResponse.status).toBe(403);
    expect(privateResponse.body?.error?.code).toBe('FORBIDDEN');
  });

  test('URLのフロアとルームの所属フロアが一致しなければ404', async () => {
    const context = await createContext();
    const anotherFloorId = '507f1f77bcf86cd799439099';
    const token = buildUserToken(context.owner);
    const requestPath = `/media/${anotherFloorId}/${context.room._id.toString()}/${context.fileName}`;

    const response = await request(app)
      .get(requestPath)
      .set('Cookie', `${USER_MEDIA_COOKIE}=${token}`);

    expect(response.status).toBe(404);
    expect(response.body?.error?.code).toBe('NOT_FOUND');
  });

  test('session_versionが古いユーザ Cookieは拒否する', async () => {
    const context = await createContext();
    const token = buildUserToken(context.owner, 0);
    await User.updateOne({ _id: context.owner._id }, { $set: { session_version: 1 } });

    const response = await request(app)
      .get(mediaPath(context))
      .set('Cookie', `${USER_MEDIA_COOKIE}=${token}`);

    expect(response.status).toBe(401);
    expect(response.body?.error?.code).toBe('TOKEN_INVALID');
  });
});
