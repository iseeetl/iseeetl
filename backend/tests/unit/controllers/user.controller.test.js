jest.mock('../../../services/user.service', () => ({
  getUserDetail: jest.fn(),
  updateUser: jest.fn(),
  changePassword: jest.fn(),
  getUserListPaginate: jest.fn(),
  managementUpdateUser: jest.fn(),
  managementSetDeleteState: jest.fn(),
  searchAIAnalysisResultUsers: jest.fn(),
}));

const userService = require('../../../services/user.service');
const controller = require('../../../controllers/user.controller.js');

describe('ユーザのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { user_id: 'u1', user_role: 'Administrator' }) => ({ body, jwtPayload });
  const makeRes = () => {
    const res = {};
    res.json = jest.fn().mockReturnValue(res);
    res.sendStatus = jest.fn().mockReturnValue(res);
    return res;
  };
  const makeNext = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ユーザ詳細取得', () => {
    test('jwtPayload.user_id を渡す', async () => {
      const req = makeReq({}, { user_id: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const result = { id: 'u1' };

      userService.getUserDetail.mockResolvedValue(result);

      await controller.getUserDetail(req, res, next);

      expect(userService.getUserDetail).toHaveBeenCalledWith('u1');
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({}, { user_id: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('getUserDetail failed');

      userService.getUserDetail.mockRejectedValue(err);

      await controller.getUserDetail(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('ユーザ更新', () => {
    test('body と jwtPayload.user_id を渡す', async () => {
      const body = { name: 'Alice' };
      const req = makeReq(body, { user_id: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const result = { id: 'u1', name: 'Alice' };

      userService.updateUser.mockResolvedValue(result);

      await controller.updateUser(req, res, next);

      expect(userService.updateUser).toHaveBeenCalledWith(body, 'u1');
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { name: 'Alice' };
      const req = makeReq(body, { user_id: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('updateUser failed');

      userService.updateUser.mockRejectedValue(err);

      await controller.updateUser(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('パスワード変更', () => {
    test('body を渡して新JWTを返す', async () => {
      const body = { current: 'old', next: 'new' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const jwt = req.jwtPayload;
      const result = { token: 'new-session-token' };

      userService.changePassword.mockResolvedValue(result);

      await controller.changePassword(req, res, next);

      expect(userService.changePassword).toHaveBeenCalledWith(body, jwt, req.io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(res.sendStatus).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { current: 'old', next: 'new' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('changePassword failed');

      userService.changePassword.mockRejectedValue(err);

      await controller.changePassword(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('ユーザのページ単位の一覧取得', () => {
    test('body を渡す', async () => {
      const body = { page: 1, search: '' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { total: 0, docs: [] };
      const jwt = req.jwtPayload;

      userService.getUserListPaginate.mockResolvedValue(result);

      await controller.getUserListPaginate(req, res, next);

      expect(userService.getUserListPaginate).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { page: 1 };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('getUserListPaginate failed');

      userService.getUserListPaginate.mockRejectedValue(err);

      await controller.getUserListPaginate(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面からのユーザ更新', () => {
    test('body と jwtPayload を渡す', async () => {
      const body = { id: 'u2', role: 'Moderator' };
      const io = { in: jest.fn() };
      const req = makeReq(body, { user_id: 'admin', user_role: 'Administrator' });
      req.io = io;
      const res = makeRes();
      const next = makeNext();
      const result = { id: 'u2', role: 'Moderator' };
      const jwt = req.jwtPayload;

      userService.managementUpdateUser.mockResolvedValue(result);

      await controller.managementUpdateUser(req, res, next);

      expect(userService.managementUpdateUser).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { id: 'u2', role: 'Moderator' };
      const req = makeReq(body, { user_role: 'Administrator' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('managementUpdateUser failed');

      userService.managementUpdateUser.mockRejectedValue(err);

      await controller.managementUpdateUser(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面からの削除状態の変更', () => {
    test('body、jwtPayload、ioをサービスへ渡す', async () => {
      const body = { _id: 'u2', delete_flg: true };
      const req = makeReq(body, { user_id: 'admin' });
      req.io = { in: jest.fn() };
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'u2', delete_flg: true };
      userService.managementSetDeleteState.mockResolvedValue(result);

      await controller.managementSetDeleteState(req, res, next);

      expect(userService.managementSetDeleteState).toHaveBeenCalledWith(
        body,
        req.jwtPayload,
        req.io
      );
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービス例外をnextへ渡す', async () => {
      const req = makeReq({ _id: 'u2', delete_flg: false });
      const res = makeRes();
      const next = makeNext();
      const error = new Error('set delete state failed');
      userService.managementSetDeleteState.mockRejectedValue(error);

      await controller.managementSetDeleteState(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('AI解析結果ユーザの候補検索', () => {
    test('body と jwtPayload を渡して候補一覧を返す', async () => {
      const body = { search: 'support' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 'u2', username: 'Support', image_name: null }];

      userService.searchAIAnalysisResultUsers.mockResolvedValue(result);

      await controller.searchAIAnalysisResultUsers(req, res, next);

      expect(userService.searchAIAnalysisResultUsers).toHaveBeenCalledWith(
        body,
        req.jwtPayload
      );
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const error = new Error('search failed');
      const req = makeReq({ search: '' });
      const res = makeRes();
      const next = makeNext();
      userService.searchAIAnalysisResultUsers.mockRejectedValue(error);

      await controller.searchAIAnalysisResultUsers(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
