const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const FloorMember = require('../../../models/FloorMember');
const ResetPassword = require('../../../models/ResetPassword');
const { createUserToken } = require('../_helpers/auth');
const { attachErrorHandler } = require('../_helpers/app');

describe('設定変更による対象接続の失効', () => {
  let app; let admin; let target; let other; let floor; let room; let io; let scopes;
  const password = 'Test-before-123';
  const nextPassword = 'Test-after-123';
  const scope = () => ({ emit: jest.fn(), disconnectSockets: jest.fn(), fetchSockets: jest.fn().mockResolvedValue([]) });
  const connect = (user) => ({ data: { accessContext: { authenticated_user: Boolean(user), user_id: user?._id.toString() } }, emit: jest.fn(), disconnect: jest.fn() });
  const post = (path, body, user = admin) => request(app).post(path).set('Authorization', `Bearer ${createUserToken(user)}`).send(body);
  const roomBody = (extra = {}) => ({ _id: room._id.toString(), title: room.title, description: room.description,
    lang: 'ja', image_name: null, member_only: false, guest_reaction_only: false,
    room_display_hidden: false, notification: false, external_sns_button: false, ...extra });

  beforeEach(async () => {
    admin = await User.create({ username: 'Admin', mail: 'admin@revocation.invalid', role: 'Administrator' });
    target = await User.create({ username: 'Target', mail: 'target@revocation.invalid', role: 'Author', password: await bcrypt.hash(password, 4) });
    other = await User.create({ username: 'Other', mail: 'other@revocation.invalid', role: 'Author' });
    floor = await Floor.create({ title: 'Floor', description: 'Test', lang: 'ja', user: admin._id });
    room = await Room.create({ floor: floor._id, title: 'Room', description: 'Test', lang: 'ja', user: admin._id });
    scopes = new Map();
    io = { in: jest.fn((name) => { if (!scopes.has(name)) scopes.set(name, scope()); return scopes.get(name); }) };
    app = express(); app.use(express.json()); app.use((req, _res, next) => { req.io = io; next(); });
    app.use('/floor', require('../../../routes/floor/floor.route'));
    app.use('/room', require('../../../routes/room/room.route'));
    app.use('/user', require('../../../routes/user.route'));
    app.use('/auth', require('../../../routes/auth.route'));
    attachErrorHandler(app);
  });

  test.each(['/room/update', '/room/management/update'])('%sの限定化で認可済みユーザを維持する', async (path) => {
    await FloorMember.create({ floor: floor._id, user: target._id });
    const guest = connect(); const allowed = connect(target); const denied = connect(other);
    const sockets = io.in(`__access__:room:${room._id}`);
    sockets.fetchSockets.mockResolvedValue([guest, allowed, denied]);
    const result = await post(path, roomBody({ member_only: true, delete_flg: false }));
    expect(result.status).toBe(200);
    expect((await Room.findById(room._id)).member_only).toBe(true);
    expect(guest.disconnect).toHaveBeenCalledWith(true);
    expect(denied.disconnect).toHaveBeenCalledWith(true);
    expect(allowed.disconnect).not.toHaveBeenCalled();
  });

  test.each([
    ['/room/delete', 'room'], ['/room/management/delete-state', 'room'],
    ['/floor/delete', 'floor'], ['/floor/management/delete-state', 'floor'],
  ])('%sでは対象範囲だけを切断し、通知に失敗しても保存を成功させる', async (path, type) => {
    const id = type === 'room' ? room._id : floor._id;
    const sockets = io.in(`__access__:${type}:${id}`);
    sockets.emit.mockImplementation(() => { throw new Error('notification unavailable'); });
    io.in.mockClear();
    const result = await post(path, { _id: String(id), delete_flg: true });
    expect(result.status).toBe(200);
    expect(io.in).toHaveBeenCalledTimes(1);
    expect(io.in).toHaveBeenCalledWith(`__access__:${type}:${id}`);
    expect(sockets.disconnectSockets).toHaveBeenCalledWith(true);
    expect((await (type === 'room' ? Room : Floor).findById(id)).delete_flg).toBe(true);
  });

  test('非表示変更・公開化・復元は切断せず、未認可の更新も副作用を起こさない', async () => {
    expect((await post('/room/update', roomBody({ room_display_hidden: true }))).status).toBe(200);
    await Room.updateOne({ _id: room._id }, { member_only: true });
    expect((await post('/room/update', roomBody())).status).toBe(200);
    await Room.updateOne({ _id: room._id }, { delete_flg: true });
    expect((await post('/room/management/delete-state', { _id: String(room._id), delete_flg: false })).status).toBe(200);
    expect((await post('/room/update', roomBody({ member_only: true }), other)).status).toBe(403);
    expect(io.in).not.toHaveBeenCalled();
  });

  test.each(['change', 'reset', 'management'])('%sの成功で本人の全接続だけを失効させ、旧JWTを拒否し、新パスワードでログインできる', async (kind) => {
    const oldToken = createUserToken(target);
    let result;
    if (kind === 'change') result = await post('/user/changepassword', { old_password: password, new_password: nextPassword }, target);
    else if (kind === 'reset') {
      const resetToken = 'a'.repeat(48);
      await ResetPassword.create({ mail: target.mail, token: resetToken, created_at: new Date() });
      result = await request(app).post('/auth/resetpassword').send({ token: resetToken, password: nextPassword });
    } else result = await post('/user/management/update', { _id: String(target._id), username: target.username, mail: target.mail,
      role: target.role, password: nextPassword, delete_flg: false });
    expect(result.status).toBe(200);
    expect(result.body.token).toBeUndefined();
    expect((await User.findById(target._id)).session_version).toBe(1);
    expect(io.in).toHaveBeenCalledTimes(1);
    expect(io.in).toHaveBeenCalledWith(`__access__:user:${target._id}`);
    expect(scopes.has(`__access__:user:${other._id}`)).toBe(false);
    const sockets = scopes.get(`__access__:user:${target._id}`);
    expect(sockets.emit).toHaveBeenCalledWith('SESSION_REVOKED');
    expect(sockets.disconnectSockets).toHaveBeenCalledWith(true);
    expect((await request(app).get('/user/detail').set('Authorization', `Bearer ${oldToken}`)).status).toBe(401);
    expect((await request(app).post('/auth/login').send({ mail: target.mail, password: nextPassword })).status).toBe(200);
  });
});
