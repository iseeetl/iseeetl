const mockSendMail = jest.fn();
jest.mock('../../../integrations/mail/mailer', () => ({ createMailTransport: () => ({ sendMail: mockSendMail }) }));
const bcrypt = require('bcrypt');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const userRouter = require('../../../routes/user.route');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const UserTemp = require('../../../models/UserTemp');
const AuthIdentity = require('../../../models/AuthIdentity');
const { linkOrCreateUserFromLine } = require('../../../services/auth/line.service');
const { activate } = require('../../../services/auth/registration.service');
const { changePassword } = require('../../../services/user/password.service');

const mailEnv = {
  EXTERNAL_MAIL_DELIVERY_ENABLED: 'true', SEND_MAIL_HOST: 'smtp.example.invalid', SEND_MAIL_PORT: '1025',
  NO_REPLY_MAIL: 'noreply@example.invalid', VUE_APP_APPNAME: 'TestApp', VUE_APP_APPURL: 'http://localhost:3100',
};
let originalEnv;
beforeAll(async () => { await AuthIdentity.init(); });
beforeEach(() => {
  originalEnv = Object.fromEntries(Object.keys(mailEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, mailEnv);
  mockSendMail.mockReset().mockResolvedValue({});
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test.each([null, 'line@example.invalid'])('LINEの同時初回ログインは同じユーザだけを作成する（mail=%s）', async (email) => {
  const results = await Promise.all(Array.from({ length: 4 }, () => linkOrCreateUserFromLine({ sub: 'same-sub', email, displayName: 'Line Test' })));
  expect(new Set(results.map(({ user }) => String(user._id))).size).toBe(1);
  expect(await User.countDocuments()).toBe(1);
  expect(await AuthIdentity.countDocuments()).toBe(1);
  expect((await AuthIdentity.findOne()).provisioning).toBe(false);
});

test('LINEのユーザ作成失敗後は予約したIDを再利用し、同じメールの既存ユーザも維持する', async () => {
  const spy = jest.spyOn(User, 'create').mockRejectedValueOnce(new Error('injected write failure'));
  await expect(linkOrCreateUserFromLine({ sub: 'resume-sub' })).rejects.toThrow('injected write failure');
  const pending = await AuthIdentity.findOne();
  expect(pending.provisioning).toBe(true);
  spy.mockRestore();
  const { user } = await linkOrCreateUserFromLine({ sub: 'resume-sub' });
  expect(String(user._id)).toBe(String(pending.user_id));
  const existing = await User.create({ username: 'Existing', mail: 'existing@example.invalid' });
  expect(String((await linkOrCreateUserFromLine({ sub: 'existing-sub', email: existing.mail })).user._id)).toBe(String(existing._id));
  expect(await User.countDocuments()).toBe(2);
});

const createTemp = (overrides = {}) => UserTemp.create({ username: 'Signup Test', mail: 'signup@example.invalid', password: 'test-password', token: 'a'.repeat(48), ...overrides });

test('本登録後の仮登録削除失敗から再開し、完了後の同じ操作も成功する', async () => {
  const temp = await createTemp();
  const cleanup = jest.spyOn(UserTemp, 'findByIdAndDelete').mockRejectedValueOnce(new Error('cleanup failed'));
  await expect(activate({ invite_token: temp.token })).rejects.toThrow('cleanup failed');
  expect(await User.countDocuments()).toBe(1);
  expect(await UserTemp.countDocuments()).toBe(1);
  cleanup.mockRestore();
  await expect(activate({ invite_token: temp.token })).resolves.toMatchObject({ roomId: null });
  await expect(activate({ invite_token: temp.token })).resolves.toMatchObject({ roomId: null });
  expect(await User.countDocuments()).toBe(1);
  expect(await UserTemp.countDocuments()).toBe(0);
  expect((await User.findOne()).toObject()).not.toHaveProperty('activation_token_hash');
});

test('同じトークンの同時有効化はユーザを1件に保ち、別トークンの既存ユーザを成功扱いにしない', async () => {
  const temp = await createTemp();
  const results = await Promise.all(Array.from({ length: 3 }, () => activate({ invite_token: temp.token })));
  expect(results).toHaveLength(3);
  expect(await User.countDocuments()).toBe(1);
  const other = await createTemp({ token: 'b'.repeat(48) });
  await expect(activate({ invite_token: other.token })).rejects.toMatchObject({ code: 'USER_ALREADY_EXISTS' });
  expect(await UserTemp.countDocuments()).toBe(1);
});

test('有効化の復旧期限は残存UserTempや現在のTTL設定で延長しない', async () => {
  const temp = await createTemp();
  const cleanup = jest.spyOn(UserTemp, 'findByIdAndDelete').mockRejectedValueOnce(new Error('cleanup failed'));
  await expect(activate({ invite_token: temp.token })).rejects.toThrow('cleanup failed');
  cleanup.mockRestore();
  await User.updateOne({ mail: temp.mail }, { $set: { activation_expires_at: new Date(Date.now() - 1000) } });
  await expect(activate({ invite_token: temp.token })).rejects.toMatchObject({ code: 'USER_ALREADY_EXISTS' });
  expect(await UserTemp.countDocuments()).toBe(1);
});

test('通知失敗でもpassword変更は成功し、未送信記録を作らない', async () => {
  const user = await User.create({ username: 'Password Test', mail: 'password@example.invalid', password: await bcrypt.hash('old-password', 4), lang: 'ja' });
  mockSendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));
  await expect(changePassword({ old_password: 'old-password', new_password: 'new-password' }, { user_id: String(user._id) })).resolves.toEqual({});
  const changed = await User.findById(user._id).select('+password +password_change_notice');
  expect(changed.session_version).toBe(1);
  expect(await bcrypt.compare('new-password', changed.password)).toBe(true);
  expect(changed.password_change_notice).toBeUndefined();
  expect(mockSendMail).toHaveBeenCalledTimes(1);
});

test('通知障害でもHTTP 200を返し、全Socketと旧JWTを失効させる', async () => {
  const user = await User.create({ username: 'HTTP Test', mail: 'http@example.invalid', password: await bcrypt.hash('OldPassw0rd', 4) });
  const token = jwt.sign({ user_id: String(user._id), user_role: user.role, session_version: 0 }, process.env.JWT_SECRET);
  const scope = { emit: jest.fn(), disconnectSockets: jest.fn() };
  const io = { in: jest.fn(() => scope) };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.io = io; next(); });
  app.use('/user', userRouter);
  attachErrorHandler(app);
  mockSendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));
  const result = await request(app).post('/user/changepassword').set('Authorization', `Bearer ${token}`)
    .send({ old_password: 'OldPassw0rd', new_password: 'NewPassw0rd' });
  expect(result.status).toBe(200);
  expect(result.body).toEqual({});
  expect(scope.emit).toHaveBeenCalledWith('SESSION_REVOKED');
  expect(scope.disconnectSockets).toHaveBeenCalledWith(true);
  expect((await request(app).get('/user/detail').set('Authorization', `Bearer ${token}`)).status).toBe(401);
});

test('LINEのユーザ作成後の確定失敗と、異なるLINE IDのメール競合でも余分なユーザを作らない', async () => {
  const finalize = jest.spyOn(AuthIdentity, 'updateOne').mockRejectedValueOnce(new Error('finalize failed'));
  await expect(linkOrCreateUserFromLine({ sub: 'unfinished' })).rejects.toThrow('finalize failed');
  const existing = await User.findOne();
  finalize.mockRestore();
  expect(String((await linkOrCreateUserFromLine({ sub: 'unfinished' })).user._id)).toBe(String(existing._id));
  const results = await Promise.all(['first', 'second'].map((sub) => linkOrCreateUserFromLine({ sub, email: 'shared@example.invalid' })));
  expect(String(results[0].user._id)).toBe(String(results[1].user._id));
  expect(await User.countDocuments()).toBe(2);
});
