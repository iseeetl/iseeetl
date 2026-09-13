jest.mock('../../../services/auth/passwordResetState.service', () => ({ prepareResetState: jest.fn() }));
jest.mock('../../../models/User', () => ({ findOneAndUpdate: jest.fn(), updateOne: jest.fn() }));
jest.mock('../../../models/ResetPassword', () => ({ deleteOne: jest.fn() }));
jest.mock('../../../services/_shared/activeResource', () => ({
  findActiveUser: jest.fn(),
}));
jest.mock('../../../socket/configurationRevocation', () => ({ revokeUserSessions: jest.fn().mockResolvedValue() }));
jest.mock('../../../config/featureFlags', () => ({ isMailDeliveryEnabled: jest.fn(), getMailDeliveryConfig: () => ({}) }));
jest.mock('../../../integrations/mail/mailer', () => ({ createMailTransport: jest.fn() }));
const { prepareResetState } = require('../../../services/auth/passwordResetState.service');
const User = require('../../../models/User');
const ResetPassword = require('../../../models/ResetPassword');
const { findActiveUser } = require('../../../services/_shared/activeResource');
const { revokeUserSessions } = require('../../../socket/configurationRevocation');
const { isMailDeliveryEnabled } = require('../../../config/featureFlags');
const { createMailTransport } = require('../../../integrations/mail/mailer');
const { changePassword } = require('../../../services/user/password.service');
const { resetPassword } = require('../../../services/auth/passwordReset.service');

beforeEach(() => {
  jest.clearAllMocks();
  User.findOneAndUpdate.mockResolvedValue({ _id: 'user-a', lang: 'ja' });
  findActiveUser.mockResolvedValue({ _id: 'user-a', comparePassword: jest.fn().mockResolvedValue(true) });
  prepareResetState.mockResolvedValue({ user: { _id: 'user-a', mail: 'test@example.invalid', lang: 'ja' }, state: { token_hash: 'hash' }, legacy: { _id: 'legacy' } });
  ResetPassword.deleteOne.mockResolvedValue({ deletedCount: 1 });
  isMailDeliveryEnabled.mockReturnValue(false);
});

test.each(['change', 'reset'])('%sは更新失敗時に切断せず、成功直後に対象ユーザだけ失効する', async (kind) => {
  const io = {};
  const run = () => kind === 'change' ? changePassword({ old_password: 'old', new_password: 'new' }, { user_id: 'user-a' }, io)
    : resetPassword({ token: 'dummy', password: 'new' }, io);
  User.findOneAndUpdate.mockRejectedValueOnce(new Error('database failed'));
  await expect(run()).rejects.toThrow('database failed');
  expect(revokeUserSessions).not.toHaveBeenCalled();
  await run();
  expect(revokeUserSessions).toHaveBeenCalledTimes(1);
  expect(revokeUserSessions).toHaveBeenCalledWith(io, 'user-a');
});

test('reset トークンの後処理失敗より前に失効を完了する', async () => {
  ResetPassword.deleteOne.mockRejectedValue(new Error('cleanup failed'));
  await expect(resetPassword({ token: 'dummy', password: 'new' }, {})).resolves.toBeUndefined();
  expect(revokeUserSessions).toHaveBeenCalledTimes(1);
  expect(revokeUserSessions.mock.invocationCallOrder[0]).toBeLessThan(ResetPassword.deleteOne.mock.invocationCallOrder[0]);
});

test.each(['change', 'reset'])('%sの通知メール失敗より前に失効を完了する', async (kind) => {
  isMailDeliveryEnabled.mockReturnValue(true);
  const sendMail = jest.fn().mockRejectedValue(new Error('mail failed'));
  createMailTransport.mockReturnValue({ sendMail });
  User.findOneAndUpdate.mockResolvedValueOnce({ _id: 'user-a', mail: 'test@example.invalid', lang: 'ja' });
  const pending = kind === 'change' ? changePassword({ old_password: 'old', new_password: 'new' }, { user_id: 'user-a' }, {})
    : resetPassword({ token: 'dummy', password: 'new' }, {});
  if (kind === 'change') await expect(pending).resolves.toEqual({});
  else await expect(pending).resolves.toBeUndefined();
  expect(revokeUserSessions).toHaveBeenCalledTimes(1);
  expect(revokeUserSessions.mock.invocationCallOrder[0]).toBeLessThan(sendMail.mock.invocationCallOrder[0]);
});
