jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

const mockSendMail = jest.fn().mockResolvedValue(true);
jest.mock('../../../integrations/mail/mailer', () => ({
  createMailTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const authRouter = require('../../../routes/auth.route');
const userRouter = require('../../../routes/user.route');
const { attachErrorHandler } = require('../_helpers/app');
const User = require('../../../models/User');
const UserTemp = require('../../../models/UserTemp');
const ResetPassword = require('../../../models/ResetPassword');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const { hashToken } = require('../../../services/auth/passwordResetState.service');
const lastMailToken = () => mockSendMail.mock.calls.at(-1)[0].html.match(/resetpassword\/([a-f0-9]{48})/)[1];

describe('ユーザ登録・本登録・パスワード再設定API', () => {
  let app;

  const ORIGINAL_ENV = {
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    VUE_APP_APPURL: process.env.VUE_APP_APPURL,
    VUE_APP_APPNAME: process.env.VUE_APP_APPNAME,
    SEND_MAIL_HOST: process.env.SEND_MAIL_HOST,
    SEND_MAIL_PORT: process.env.SEND_MAIL_PORT,
    NO_REPLY_MAIL: process.env.NO_REPLY_MAIL,
    MAIL_DELIVERY_MODE: process.env.MAIL_DELIVERY_MODE,
    EXTERNAL_MAIL_DELIVERY_ENABLED: process.env.EXTERNAL_MAIL_DELIVERY_ENABLED,
  };

  const ensureEnv = () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.VUE_APP_APPURL = 'http://localhost:3000';
    process.env.VUE_APP_APPNAME = 'TestApp';
    process.env.SEND_MAIL_HOST = 'smtp.example.invalid';
    process.env.SEND_MAIL_PORT = '1025';
    process.env.NO_REPLY_MAIL = 'noreply@example.invalid';
    process.env.EXTERNAL_MAIL_DELIVERY_ENABLED = 'true';
    delete process.env.MAIL_DELIVERY_MODE;
  };

  const restoreEnv = () => {
    if (ORIGINAL_ENV.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
    if (ORIGINAL_ENV.VUE_APP_APPURL === undefined) delete process.env.VUE_APP_APPURL;
    else process.env.VUE_APP_APPURL = ORIGINAL_ENV.VUE_APP_APPURL;
    if (ORIGINAL_ENV.VUE_APP_APPNAME === undefined) delete process.env.VUE_APP_APPNAME;
    else process.env.VUE_APP_APPNAME = ORIGINAL_ENV.VUE_APP_APPNAME;
    if (ORIGINAL_ENV.SEND_MAIL_HOST === undefined) delete process.env.SEND_MAIL_HOST;
    else process.env.SEND_MAIL_HOST = ORIGINAL_ENV.SEND_MAIL_HOST;
    if (ORIGINAL_ENV.SEND_MAIL_PORT === undefined) delete process.env.SEND_MAIL_PORT;
    else process.env.SEND_MAIL_PORT = ORIGINAL_ENV.SEND_MAIL_PORT;
    if (ORIGINAL_ENV.NO_REPLY_MAIL === undefined) delete process.env.NO_REPLY_MAIL;
    else process.env.NO_REPLY_MAIL = ORIGINAL_ENV.NO_REPLY_MAIL;
    if (ORIGINAL_ENV.MAIL_DELIVERY_MODE === undefined) delete process.env.MAIL_DELIVERY_MODE;
    else process.env.MAIL_DELIVERY_MODE = ORIGINAL_ENV.MAIL_DELIVERY_MODE;
    if (ORIGINAL_ENV.EXTERNAL_MAIL_DELIVERY_ENABLED === undefined) {
      delete process.env.EXTERNAL_MAIL_DELIVERY_ENABLED;
    } else {
      process.env.EXTERNAL_MAIL_DELIVERY_ENABLED = ORIGINAL_ENV.EXTERNAL_MAIL_DELIVERY_ENABLED;
    }
  };

  const buildApp = () => {
    const a = express();
    a.use(express.json());
    a.use('/api/auth', authRouter);
    a.use('/api/user', userRouter);
    return attachErrorHandler(a);
  };

  beforeAll(() => {
    ensureEnv();
  });

  afterAll(() => {
    restoreEnv();
  });

  beforeEach(() => {
    ensureEnv();
    mockSendMail.mockReset().mockResolvedValue(true);
    app = buildApp();
  });

  test('メール送信が無効なら仮登録ユーザを作らず503を返す', async () => {
    process.env.EXTERNAL_MAIL_DELIVERY_ENABLED = 'false';

    const res = await request(app).post('/api/auth/register').send({
      username: 'DisabledMail',
      mail: 'disabled@example.com',
      password: 'Passw0rd',
      lang: 'ja',
    });

    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe('EXTERNAL_FEATURE_DISABLED');
    expect(res.body?.error?.details).toEqual({ feature: 'mailDelivery' });
    expect(await UserTemp.countDocuments({ mail: 'disabled@example.com' })).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('ユーザ登録で仮登録データを作成する', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'Alice',
      mail: 'alice@example.com',
      password: 'Passw0rd',
      lang: 'ja',
    });

    expect(res.status).toBe(200);
    const temp = await UserTemp.findOne({ mail: 'alice@example.com' });
    expect(temp).toBeTruthy();
    expect(temp.token).toBeTruthy();
  });

  test('同じメールアドレスでの重複登録を拒否する', async () => {
    await User.create({ username: 'Bob', mail: 'bob@example.com', lang: 'ja' });

    const res = await request(app).post('/api/auth/register').send({
      username: 'Bob2',
      mail: 'bob@example.com',
      password: 'Passw0rd',
      lang: 'ja',
    });

    expect(res.status).toBe(409);
    expect(res.body?.error?.code).toBe('USER_EMAIL_ALREADY_USED');
  });

  test('本登録でユーザを作成して仮登録データを削除する', async () => {
    const owner = await User.create({ username: 'Owner', mail: 'owner@example.com', lang: 'ja', role: 'Editor' });
    const floor = await Floor.create({ user: owner._id, title: 'Floor A', lang: 'ja', target_langs: [] });
    const room = await Room.create({ user: owner._id, floor: floor._id, title: 'Room A', lang: 'ja' });

    const inviteToken = 'a'.repeat(48);
    await UserTemp.create({
      username: 'TempUser',
      mail: 'temp@example.com',
      password: 'Passw0rd',
      token: inviteToken,
    });

    const res = await request(app).post('/api/auth/activate').send({
      invite_token: inviteToken,
      room_id: room._id.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.body.roomId).toBe(room._id.toString());
    expect(res.body.roomTitle).toBe(room.title);
    expect(res.body.floorId).toBe(floor._id.toString());
    expect(res.body.floorTitle).toBe(floor.title);

    const created = await User.findOne({ mail: 'temp@example.com' });
    expect(created).toBeTruthy();
    const remainingTemp = await UserTemp.findOne({ mail: 'temp@example.com' });
    expect(remainingTemp).toBeNull();
  });

  test('本登録のトークンが不明ならTOKEN_NOT_FOUNDを返す', async () => {
    const res = await request(app).post('/api/auth/activate').send({ invite_token: 'b'.repeat(48) });

    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('TOKEN_NOT_FOUND');
  });

  test('パスワード再設定メールの送信で同じメールアドレスの旧トークンを置き換える', async () => {
    await User.create({ username: 'ResetUser', mail: 'reset@example.com', lang: 'ja' });

    const firstRes = await request(app)
      .post('/api/auth/resetpassword/sendmail')
      .send({ mail: 'reset@example.com' });
    expect(firstRes.status).toBe(200);
    const firstToken = lastMailToken();

    const secondRes = await request(app)
      .post('/api/auth/resetpassword/sendmail')
      .send({ mail: 'reset@example.com' });
    expect(secondRes.status).toBe(200);

    const latestToken = lastMailToken();
    expect(latestToken).not.toBe(firstToken);
    const state = await User.findOne({ mail: 'reset@example.com' }).select('+password_reset');
    expect(state.password_reset.token_hash).toBe(hashToken(latestToken));
    expect(await ResetPassword.countDocuments()).toBe(0);

    const oldTokenRes = await request(app)
      .post('/api/auth/resetpassword/verify')
      .send({ token: firstToken });
    expect(oldTokenRes.status).toBe(400);
    expect(oldTokenRes.body?.error?.code).toBe('INVALID_PARAMS');

    const latestTokenRes = await request(app)
      .post('/api/auth/resetpassword/verify')
      .send({ token: latestToken });
    expect(latestTokenRes.status).toBe(200);
  });

  test('未登録のメールアドレスにも再設定メールの要求はHTTP 200を返す', async () => {
    const res = await request(app).post('/api/auth/resetpassword/sendmail').send({ mail: 'unknown@example.com' });

    expect(res.status).toBe(200);
    const reset = await ResetPassword.findOne({ mail: 'unknown@example.com' });
    expect(reset).toBeNull();
  });

  test('メール送信が無効なら再設定トークンを作らず503を返す', async () => {
    await User.create({ username: 'MailOff', mail: 'mail-off@example.com', lang: 'ja' });
    process.env.EXTERNAL_MAIL_DELIVERY_ENABLED = 'false';

    const res = await request(app)
      .post('/api/auth/resetpassword/sendmail')
      .send({ mail: 'mail-off@example.com' });

    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe('EXTERNAL_FEATURE_DISABLED');
    expect(res.body?.error?.details).toEqual({ feature: 'mailDelivery' });
    expect(await ResetPassword.countDocuments({ mail: 'mail-off@example.com' })).toBe(0);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('パスワード再設定のトークンを検証する', async () => {
    await User.create({ username: 'Verify', mail: 'verify@example.com', lang: 'ja' });
    await ResetPassword.create({ mail: 'verify@example.com', token: 'c'.repeat(48) });

    const res = await request(app).post('/api/auth/resetpassword/verify').send({ token: 'c'.repeat(48) });

    expect(res.status).toBe(200);
  });

  test('パスワード再設定でパスワードを更新してトークンを消費する', async () => {
    const user = await User.create({ username: 'UpdateUser', mail: 'update@example.com', lang: 'ja' });
    const otherUser = await User.create({ username: 'OtherUser', mail: 'other@example.com', lang: 'ja' });
    const reset = await ResetPassword.create({ mail: 'update@example.com', token: 'd'.repeat(48) });
    const otherReset = await ResetPassword.create({ mail: 'other@example.com', token: 'e'.repeat(48) });
    const oldToken = jwt.sign(
      { user_id: user._id.toString(), user_role: user.role },
      process.env.JWT_SECRET
    );
    const otherToken = jwt.sign(
      { user_id: otherUser._id.toString(), user_role: otherUser.role },
      process.env.JWT_SECRET
    );

    const res = await request(app).post('/api/auth/resetpassword').send({ password: 'NewPassw0rd', token: reset.token });

    expect(res.status).toBe(200);

    const updated = await User.findOne({ mail: 'update@example.com' }).select('+password');
    expect(updated).toBeTruthy();
    const ok = await updated.comparePassword('NewPassw0rd');
    expect(ok).toBe(true);
    expect(updated.session_version).toBe(1);

    const oldTokenRes = await request(app)
      .get('/api/user/detail')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(oldTokenRes.status).toBe(401);

    const otherTokenRes = await request(app)
      .get('/api/user/detail')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherTokenRes.status).toBe(200);

    const remaining = await ResetPassword.findOne({ mail: 'update@example.com' });
    expect(remaining).toBeNull();
    expect(await ResetPassword.findById(otherReset._id)).toBeTruthy();

    const reusedRes = await request(app)
      .post('/api/auth/resetpassword')
      .send({ password: 'NextPassw0rd', token: reset.token });
    expect(reusedRes.status).toBe(400);
    expect(reusedRes.body?.error?.code).toBe('INVALID_PARAMS');
  });

  test('メール送信が無効でも発行済みトークンでパスワードを再設定できる', async () => {
    const user = await User.create({ username: 'ExistingToken', mail: 'existing-token@example.com', lang: 'ja' });
    const reset = await ResetPassword.create({
      mail: user.mail,
      token: '9'.repeat(48),
    });
    process.env.EXTERNAL_MAIL_DELIVERY_ENABLED = 'false';

    const res = await request(app)
      .post('/api/auth/resetpassword')
      .send({ password: 'ChangedPass1', token: reset.token });

    expect(res.status).toBe(200);
    expect(await ResetPassword.findById(reset._id)).toBeNull();
    const updated = await User.findById(user._id).select('+password');
    await expect(updated.comparePassword('ChangedPass1')).resolves.toBe(true);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('同じ再設定トークンの同時使用は1回だけ許可する', async () => {
    await User.create({ username: 'ConcurrentUser', mail: 'concurrent@example.com', lang: 'ja' });
    const reset = await ResetPassword.create({ mail: 'concurrent@example.com', token: 'f'.repeat(48) });

    const [firstRes, secondRes] = await Promise.all([
      request(app)
        .post('/api/auth/resetpassword')
        .send({ password: 'FirstPass1', token: reset.token }),
      request(app)
        .post('/api/auth/resetpassword')
        .send({ password: 'SecondPass2', token: reset.token }),
    ]);

    expect([firstRes.status, secondRes.status].sort()).toEqual([200, 400]);
    const rejectedRes = [firstRes, secondRes].find((response) => response.status === 400);
    expect(rejectedRes.body?.error?.code).toBe('INVALID_PARAMS');
    expect(await ResetPassword.findOne({ mail: 'concurrent@example.com' })).toBeNull();
  });

  test('同じメールアドレスの再設定データの重複をDBで拒否する', async () => {
    await ResetPassword.init();
    await ResetPassword.create({ mail: 'unique@example.com', token: '1'.repeat(48) });

    await expect(
      ResetPassword.create({
        mail: 'unique@example.com',
        token: '2'.repeat(48),
      })
    ).rejects.toMatchObject({ code: 11000 });
  });
  test('ユーザ更新が失敗しても同じリンクで再試行できる（新規・旧リンク）', async () => {
    for (const legacy of [false, true]) {
      const user = await User.create({ username: 'Retry', mail: `retry-${legacy}@example.invalid`, lang: 'ja' });
      let token;
      if (legacy) {
        token = '8'.repeat(48);
        await ResetPassword.create({ mail: user.mail, token });
      } else {
        await request(app).post('/api/auth/resetpassword/sendmail').send({ mail: user.mail }).expect(200);
        token = lastMailToken();
      }
      const update = jest.spyOn(User, 'findOneAndUpdate').mockRejectedValueOnce(new Error('injected database failure'));
      try {
        await request(app).post('/api/auth/resetpassword').send({ token, password: 'RetryPass1' }).expect(500);
      } finally { update.mockRestore(); }
      const pending = await User.findById(user._id).select('+password_reset');
      expect(pending.session_version).toBe(0);
      expect(pending.password_reset.consumed).toBe(false);
      await request(app).post('/api/auth/resetpassword/verify').send({ token }).expect(200);
      await request(app).post('/api/auth/resetpassword').send({ token, password: 'RetryPass1' }).expect(200);
      const completed = await User.findById(user._id).select('+password +password_reset');
      expect(completed.password_reset.consumed).toBe(true);
      expect(completed.session_version).toBe(1);
      await expect(completed.comparePassword('RetryPass1')).resolves.toBe(true);
      await request(app).post('/api/auth/resetpassword').send({ token, password: 'ReplayPass1' }).expect(400);
    }
  });

  test('通知失敗でも再設定は200、トークンは消費済みで未送信記録を作らない', async () => {
    const user = await User.create({ username: 'Notice', mail: 'notice@example.invalid', lang: 'ja' });
    await request(app).post('/api/auth/resetpassword/sendmail').send({ mail: user.mail }).expect(200);
    const token = lastMailToken();
    mockSendMail.mockRejectedValueOnce(new Error('injected SMTP failure'));
    await request(app).post('/api/auth/resetpassword').send({ token, password: 'NoticePass1' }).expect(200);
    const completed = await User.findById(user._id).select('+password +password_reset +password_change_notice');
    expect(completed.password_change_notice).toBeUndefined();
    await expect(completed.comparePassword('NoticePass1')).resolves.toBe(true);
    expect(completed.password_reset.consumed).toBe(true);
    expect(completed.session_version).toBe(1);
    await request(app).post('/api/auth/resetpassword').send({ token, password: 'ReplayPass1' }).expect(400);
  });

  test('新規トークンも同時使用は一度だけ、旧リンクは新規発行で無効になる', async () => {
    const user = await User.create({ username: 'Atomic', mail: 'atomic@example.invalid', lang: 'ja' });
    const old = await ResetPassword.create({ mail: user.mail, token: '7'.repeat(48) });
    await request(app).post('/api/auth/resetpassword/sendmail').send({ mail: user.mail }).expect(200);
    const token = lastMailToken();
    await request(app).post('/api/auth/resetpassword/verify').send({ token: old.token }).expect(400);
    const results = await Promise.all(['FirstPass1', 'SecondPass1'].map((password) => request(app).post('/api/auth/resetpassword').send({ token, password })));
    expect(results.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect((await User.findById(user._id)).session_version).toBe(1);
    await request(app).post('/api/auth/resetpassword').send({ token: old.token, password: 'LegacyPass1' }).expect(400);
  });

  test('期限切れ・削除ユーザを拒否し、verifyは有効リンクを消費しない', async () => {
    const user = await User.create({ username: 'Expired', mail: 'expired@example.invalid', lang: 'ja' });
    await request(app).post('/api/auth/resetpassword/sendmail').send({ mail: user.mail }).expect(200);
    const token = lastMailToken();
    await request(app).post('/api/auth/resetpassword/verify').send({ token }).expect(200);
    expect((await User.findById(user._id).select('+password_reset')).password_reset.consumed).toBe(false);
    await User.updateOne({ _id: user._id }, { $set: { 'password_reset.expires_at': new Date(0) } });
    const expired = await request(app).post('/api/auth/resetpassword').send({ token, password: 'ExpiredPass1' }).expect(400);
    expect(expired.body.error.code).toBe('RESET_TOKEN_EXPIRED');
    await User.updateOne({ _id: user._id }, { $set: { delete_flg: true } });
    await request(app).post('/api/auth/resetpassword/verify').send({ token }).expect(400);
    expect((await User.findById(user._id)).session_version).toBe(0);
  });

  test.each([undefined, 'expired-token'])('ログアウトはJWT認証は不要とするでユーザメディアCookieを同じ属性で失効する', async (authorization) => {
    let req = request(app).post('/api/auth/logout');
    if (authorization) req = req.set('Authorization', `Bearer ${authorization}`);
    const res = await req.expect(204);
    const cookie = res.headers['set-cookie'].find((value) => value.startsWith('iseeetl_media_user='));
    expect(cookie).toContain('Path=/media');
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('パスワードのハッシュ化失敗はリンクを消費しない', async () => {
    const user = await User.create({ username: 'Hash retry', mail: 'hash-retry@example.invalid', lang: 'ja' });
    await request(app).post('/api/auth/resetpassword/sendmail').send({ mail: user.mail }).expect(200);
    const token = lastMailToken();
    const hash = jest.spyOn(require('bcrypt'), 'hash').mockImplementationOnce((_password, _salt, callback) => callback(new Error('injected hash failure')));
    try {
      await request(app).post('/api/auth/resetpassword').send({ token, password: 'HashRetry1' }).expect(500);
    } finally { hash.mockRestore(); }
    await request(app).post('/api/auth/resetpassword/verify').send({ token }).expect(200);
    await request(app).post('/api/auth/resetpassword').send({ token, password: 'HashRetry1' }).expect(200);
    expect((await User.findById(user._id)).session_version).toBe(1);
  });

  test('検証後に期限切れ・再発行へ変わった場合も古い更新を拒否する', async () => {
    const bcrypt = require('bcrypt');
    for (const change of ['expire', 'replace']) {
      const user = await User.create({ username: 'Race', mail: `race-${change}@example.invalid`, lang: 'ja' });
      await request(app).post('/api/auth/resetpassword/sendmail').send({ mail: user.mail }).expect(200);
      const token = lastMailToken();
      const originalHash = bcrypt.hash;
      const hash = jest.spyOn(bcrypt, 'hash').mockImplementationOnce((password, salt, callback) => {
        const values = change === 'expire' ? { 'password_reset.expires_at': new Date(0) } : { 'password_reset.token_hash': hashToken('6'.repeat(48)) };
        User.updateOne({ _id: user._id }, { $set: values }).then(() => originalHash(password, salt, callback), callback);
      });
      try {
        await request(app).post('/api/auth/resetpassword').send({ token, password: 'RacePass1' }).expect(400);
      } finally { hash.mockRestore(); }
      const unchanged = await User.findById(user._id).select('+password_reset');
      expect(unchanged.session_version).toBe(0);
      expect(unchanged.password_reset.consumed).toBe(false);
    }
  });

  test('発行後にメールアドレスが変わったユーザへ旧宛先のリンクは使えない', async () => {
    const user = await User.create({ username: 'Changed mail', mail: 'old-address@example.invalid', lang: 'ja' });
    await request(app).post('/api/auth/resetpassword/sendmail').send({ mail: user.mail }).expect(200);
    const token = lastMailToken();
    await User.updateOne({ _id: user._id }, { $set: { mail: 'new-address@example.invalid' } });
    await request(app).post('/api/auth/resetpassword/verify').send({ token }).expect(401);
    await request(app).post('/api/auth/resetpassword').send({ token, password: 'OldLinkPass1' }).expect(401);
    expect((await User.findById(user._id)).session_version).toBe(0);
  });

});
