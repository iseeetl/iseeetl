const mongoose = require('mongoose');

jest.mock('../../../models/User', () => ({ findOne: jest.fn() }));

const User = require('../../../models/User');
const ensureDeveloperUserV1 = require('../../../middlewares/ensureDeveloperUserV1');

describe('v1開発者権限の確認', () => {
  const userId = new mongoose.Types.ObjectId().toString();

  const run = async (jwtPayload) => {
    const req = { jwtPayload };
    const next = jest.fn();
    await ensureDeveloperUserV1(req, {}, next);
    return { req, next };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('有効な開発者ユーザのDB情報から認証情報を構成する', async () => {
    const select = jest.fn().mockResolvedValue({ _id: userId, role: 'developer' });
    User.findOne.mockReturnValue({ select });
    const claims = { user_id: userId, user_role: 'developer', legacy: 'claim' };

    const { req, next } = await run(claims);

    expect(User.findOne).toHaveBeenCalledWith({ _id: userId, delete_flg: false });
    expect(select).toHaveBeenCalledWith('_id role');
    expect(req.v1Claims).toBe(claims);
    expect(req.jwtPayload).toEqual({ user_id: userId, user_role: 'developer' });
    expect(next).toHaveBeenCalledWith();
  });

  test.each([
    ['欠落', undefined],
    ['一致', 1],
    ['不一致', 2],
  ])('session_versionが%sでもv1利用可否には使用しない', async (_label, sessionVersion) => {
    const select = jest.fn().mockResolvedValue({
      _id: userId,
      role: 'developer',
      session_version: 1,
    });
    User.findOne.mockReturnValue({ select });

    const claims = {
      user_id: userId,
      user_role: 'developer',
    };
    if (sessionVersion !== undefined) claims.session_version = sessionVersion;

    const { req, next } = await run(claims);

    expect(req.jwtPayload).toEqual({ user_id: userId, user_role: 'developer' });
    expect(next).toHaveBeenCalledWith();
  });

  test.each([
    [undefined],
    [{}],
    [{ user_id: 'invalid', user_role: 'developer' }],
  ])('ユーザを特定できない要求はTOKEN_INVALIDにする: %p', async (jwtPayload) => {
    const { next } = await run(jwtPayload);

    expect(User.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID', status: 401 }));
  });

  test('トークンの権限がdeveloperでなければFORBIDDENを返す', async () => {
    const { next } = await run({ user_id: userId, user_role: 'Author' });

    expect(User.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN', status: 403 }));
  });

  test('ユーザが存在しないか論理削除済みならTOKEN_INVALIDにする', async () => {
    User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    const { next } = await run({ user_id: userId, user_role: 'developer' });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID', status: 401 }));
  });

  test('現在のDB上の権限がdeveloperでなければFORBIDDENを返す', async () => {
    User.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: userId, role: 'Author' }),
    });

    const { next } = await run({ user_id: userId, user_role: 'developer' });

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN', status: 403 }));
  });

  test('DB エラーをそのままnextへ渡す', async () => {
    const error = new Error('database failure');
    User.findOne.mockReturnValue({ select: jest.fn().mockRejectedValue(error) });

    const { next } = await run({ user_id: userId, user_role: 'developer' });

    expect(next).toHaveBeenCalledWith(error);
  });
});
