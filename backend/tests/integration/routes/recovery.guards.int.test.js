const mockSendMail = jest.fn();
jest.mock('../../../integrations/mail/mailer', () => ({ createMailTransport: () => ({ sendMail: mockSendMail }) }));
const mongoose = require('mongoose');
const User = require('../../../models/User');
const Floor = require('../../../models/Floor');
const Room = require('../../../models/Room');
const KickedUser = require('../../../models/KickedUser');
const kick = require('../../../services/kickedUser.service');
const { sendResetPasswordMail, verifyResetPasswordToken, resetPassword } = require('../../../services/auth/passwordReset.service');
const { hashToken } = require('../../../services/auth/passwordResetState.service');
const { deleteQuickTextGroup } = require('../../../services/_shared/quickTextDeletion');
const mailEnv = { EXTERNAL_MAIL_DELIVERY_ENABLED: 'true', SEND_MAIL_HOST: 'smtp.example.invalid', SEND_MAIL_PORT: '1025',
  NO_REPLY_MAIL: 'noreply@example.invalid', VUE_APP_APPNAME: 'Test', VUE_APP_APPURL: 'http://localhost:3100' };
let saved;
beforeEach(() => {
  saved = Object.fromEntries(Object.keys(mailEnv).map((key) => [key, process.env[key]]));
  Object.assign(process.env, mailEnv);
  mockSendMail.mockReset().mockResolvedValue({});
});
afterEach(() => {
  jest.restoreAllMocks();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const createContext = async () => {
  const owner = await User.create({ username: 'Owner', role: 'Administrator', mail: 'owner@example.invalid' });
  const user = await User.create({ username: 'Target', mail: 'target@example.invalid', lang: 'ja' });
  const floor = await Floor.create({ user: owner._id, title: 'Floor', lang: 'ja', target_langs: [] });
  const room = await Room.create({ user: owner._id, floor: floor._id, title: 'Room', lang: 'ja' });
  return { owner, user, floor, room, jwt: { user_id: String(owner._id), user_role: owner.role } };
};

test('同時キックは一件だけ保存し、別フロアの制限を解除しない', async () => {
  await KickedUser.createIndexes();
  const { owner, user, floor, room, jwt } = await createContext();
  const io = { to: () => ({ emit: jest.fn() }), in: () => ({ disconnectSockets: jest.fn() }) };
  const results = await Promise.allSettled([1, 2, 3].map(() => kick.createKickedUser({ user_id: String(user._id), room_id: String(room._id) }, jwt, io)));
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  for (const result of results.filter((r) => r.status === 'rejected')) expect(result.reason.code).toBe('ALREADY_KICKED');
  const otherFloor = await Floor.create({ user: owner._id, title: 'Other', lang: 'ja' });
  await KickedUser.create({ user: user._id, kicked_by: owner._id, floor: otherFloor._id, room: room._id });
  await kick.deleteKickedUser({ user_id: String(user._id), floor_id: String(floor._id) }, jwt);
  expect(await KickedUser.countDocuments({ floor: floor._id })).toBe(0);
  expect(await KickedUser.countDocuments({ floor: otherFloor._id })).toBe(1);
});

test('旧重複がある場合も、ルーム削除後に同一フロアの全重複を解除できる', async () => {
  const collection = mongoose.connection.db.collection('kickedusers');
  const indexes = await collection.indexes();
  if (indexes.some((i) => i.name === 'uniq_kickedusers_floor_user')) await collection.dropIndex('uniq_kickedusers_floor_user');
  const { owner, user, floor, room, jwt } = await createContext();
  const data = { user: user._id, kicked_by: owner._id, floor: floor._id, room: room._id };
  await KickedUser.create([data, data]);
  expect(await KickedUser.countDocuments({ floor: floor._id })).toBe(2);
  await expect(KickedUser.createIndexes()).rejects.toMatchObject({ code: 11000 });
  await Room.deleteOne({ _id: room._id });
  await kick.deleteKickedUser({ user_id: String(user._id), floor_id: String(floor._id) }, jwt);
  expect(await KickedUser.countDocuments()).toBe(0);
  await KickedUser.createIndexes();
});

test.each(['QuickText', 'FloorQuickText', 'RoomQuickText'])('%sは配下削除失敗時に親を残し、親削除失敗後も同じ要求で完了できる', async (kind) => {
  const Group = require(`../../../models/${kind}Group`);
  const Item = require(`../../../models/${kind}Item`);
  const { owner, floor, room } = await createContext();
  const scope = kind === 'QuickText' ? {} : kind === 'FloorQuickText' ? { floor: floor._id } : { floor: floor._id, room: room._id };
  const group = await Group.create({ ...scope, user: owner._id, title: 'Group', lang: 'ja', order: 1 });
  const other = await Group.create({ ...scope, user: owner._id, title: 'Other', lang: 'ja', order: 2 });
  await Item.create([{ ...scope, group: group._id, label: 'One', lang: 'ja', order: 1 }, { ...scope, group: other._id, label: 'Other', lang: 'ja', order: 1 }]);
  const remove = () => deleteQuickTextGroup({ groupModel: Group, itemModel: Item, filter: { _id: group._id, ...scope } });
  const itemFailure = jest.spyOn(Item, 'deleteMany').mockRejectedValueOnce(new Error('item delete failed'));
  await expect(remove()).rejects.toThrow('item delete failed');
  expect(await Group.findById(group._id)).not.toBeNull();
  expect(await Item.countDocuments({ group: group._id })).toBe(1);
  itemFailure.mockRestore();

  const parentFailure = jest.spyOn(Group, 'findOneAndDelete').mockRejectedValueOnce(new Error('group delete failed'));
  await expect(remove()).rejects.toThrow('group delete failed');
  expect(await Group.findById(group._id)).not.toBeNull();
  expect(await Item.countDocuments({ group: group._id })).toBe(0);
  parentFailure.mockRestore();

  await expect(remove()).resolves.toMatchObject({ ok: true, deletedGroupId: String(group._id) });
  expect(await Group.findById(group._id)).toBeNull();
  expect(await Item.countDocuments({ group: other._id })).toBe(1);
});

const createResetUser = async () => User.create({ username: 'Reset', mail: 'reset@example.invalid', lang: 'ja',
  password_reset: { token_hash: hashToken('old-link'), mail: 'reset@example.invalid', expires_at: new Date(Date.now() + 3600000), consumed: false } });
const sentToken = () => mockSendMail.mock.calls.at(-1)[0].html.match(/user\/resetpassword\/([a-f0-9]{48})/)[1];

test('SMTP失敗は旧リンクを維持し、再要求では別の新リンクを確定する', async () => {
  const user = await createResetUser();
  mockSendMail.mockRejectedValueOnce(new Error('mail unavailable'));
  await expect(sendResetPasswordMail(user.mail)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  const failedToken = sentToken();
  await expect(verifyResetPasswordToken('old-link')).resolves.toBeUndefined();
  expect((await User.collection.findOne({ _id: user._id })).password_reset_delivery).toBeUndefined();
  await expect(sendResetPasswordMail(user.mail)).resolves.toBeUndefined();
  const newToken = sentToken();
  expect(newToken).not.toBe(failedToken);
  await expect(verifyResetPasswordToken(newToken)).resolves.toBeUndefined();
  await expect(verifyResetPasswordToken(failedToken)).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
  await expect(verifyResetPasswordToken('old-link')).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
  expect(JSON.stringify(await User.collection.findOne({ _id: user._id }))).not.toContain(newToken);
});

test('SMTP成功後のDB障害は旧リンクを維持し、届いた未確定リンクは使用できない', async () => {
  const user = await createResetUser();
  const fail = jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error('promotion failed'));
  await expect(sendResetPasswordMail(user.mail)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  const failedToken = sentToken();
  fail.mockRestore();
  await expect(verifyResetPasswordToken('old-link')).resolves.toBeUndefined();
  await expect(verifyResetPasswordToken(failedToken)).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
  await expect(sendResetPasswordMail(user.mail)).resolves.toBeUndefined();
  expect(sentToken()).not.toBe(failedToken);
  await expect(verifyResetPasswordToken(sentToken())).resolves.toBeUndefined();
});

test.each(['mail', 'session', 'deleted', 'consumed', 'reissued'])('送信中の%s変更で古い要求が再設定状態を上書きしない', async (kind) => {
  const user = await createResetUser();
  let attemptedToken;
  mockSendMail.mockImplementationOnce(async () => {
    attemptedToken = sentToken();
    if (kind === 'consumed') await resetPassword({ token: 'old-link', password: 'new-password' });
    else if (kind === 'reissued') await sendResetPasswordMail(user.mail);
    else await User.updateOne({ _id: user._id }, kind === 'mail' ? { $set: { mail: 'changed@example.invalid' } } :
      kind === 'session' ? { $inc: { session_version: 1 } } : { $set: { delete_flg: true } });
    return {};
  });
  await expect(sendResetPasswordMail(user.mail)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  const current = await User.findById(user._id).select('+password_reset');
  expect(current.password_reset.token_hash).not.toBe(hashToken(attemptedToken));
  expect(current.password_reset.consumed).toBe(kind === 'consumed');
});

test('送信成功時に期限が過ぎていれば新リンクを確定しない', async () => {
  const user = await createResetUser();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() - 24 * 3600000);
  try { await expect(sendResetPasswordMail(user.mail)).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' }); }
  finally { clock.mockRestore(); }
  await expect(verifyResetPasswordToken('old-link')).resolves.toBeUndefined();
});

test.each([false, true])('並行発行は先に確定したリンクだけを有効にし、遅い完了で置換しない（既存状態=%s）', async (hasState) => {
  const user = hasState ? await createResetUser() : await User.create({ username: 'New', mail: 'new@example.invalid' });
  let releaseFirst, releaseSecond, bothSending;
  const entered = new Promise((resolve) => { bothSending = resolve; });
  mockSendMail.mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; }))
    .mockImplementationOnce(() => new Promise((resolve) => { releaseSecond = resolve; bothSending(); }));
  const first = sendResetPasswordMail(user.mail);
  const second = sendResetPasswordMail(user.mail);
  const settled = Promise.allSettled([first, second]);
  await entered;
  const tokens = mockSendMail.mock.calls.map(([mail]) => mail.html.match(/user\/resetpassword\/([a-f0-9]{48})/)[1]);
  releaseSecond({});
  // 発行順とSMTP到達順は固定しない。DB確定を検出してから遅い送信を完了する。
  await Promise.race([first, second]);
  releaseFirst({});
  const results = await settled;
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  await expect(verifyResetPasswordToken(tokens[1])).resolves.toBeUndefined();
  await expect(verifyResetPasswordToken(tokens[0])).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
});

test('旧配送記録を残したユーザでも新規発行でき、通常の検索応答に旧記録を含めない', async () => {
  const user = await createResetUser();
  const legacy = { password_reset_delivery: { sealed_token: 'legacy-ciphertext' }, password_change_notice: { mail: user.mail } };
  await User.collection.updateOne({ _id: user._id }, { $set: legacy });
  await expect(sendResetPasswordMail(user.mail)).resolves.toBeUndefined();
  const publicUser = await User.findById(user._id).lean();
  expect(publicUser).not.toHaveProperty('password_reset_delivery');
  expect(publicUser).not.toHaveProperty('password_change_notice');
  expect(await User.collection.findOne({ _id: user._id })).toMatchObject(legacy);
});
