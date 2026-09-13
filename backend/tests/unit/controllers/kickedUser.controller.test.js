jest.mock('../../../services/kickedUser.service', () => ({
  getKickedUserList: jest.fn(),
  checkKickedUser: jest.fn(),
  createKickedUser: jest.fn(),
  deleteKickedUser: jest.fn(),
}));

const kickedUserService = require('../../../services/kickedUser.service');
const controller = require('../../../controllers/kickedUser.controller.js');

describe('キックのコントローラ', () => {
  const makeReq = (
    body = {},
    jwtPayload = { sub: 'user1', user_id: 'user1', user_role: 'Administrator', role: 'user' }
  ) => ({ body, jwtPayload });

  const makeRes = () => {
    const res = {};
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const makeNext = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('キックされたユーザの一覧取得', () => {
    test('body, jwt を渡して結果を返す', async () => {
      const body = { room_id: 'R1' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = [{ user_id: 'U9' }];

      kickedUserService.getKickedUserList.mockResolvedValue(result);

      await controller.getKickedUserList(req, res, next);

      expect(kickedUserService.getKickedUserList).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('getKickedUserList failed');

      kickedUserService.getKickedUserList.mockRejectedValue(err);

      await controller.getKickedUserList(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('キック状態の確認', () => {
    test('body, jwt を渡して結果を返す', async () => {
      const body = { room_id: 'R1', user_id: 'U2' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { kicked: false };

      kickedUserService.checkKickedUser.mockResolvedValue(result);

      await controller.checkKickedUser(req, res, next);

      expect(kickedUserService.checkKickedUser).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R1', user_id: 'U2' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('checkKickedUser failed');

      kickedUserService.checkKickedUser.mockRejectedValue(err);

      await controller.checkKickedUser(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('キックの登録', () => {
    test('body, jwt, io を渡して結果を返す', async () => {
      const body = { room_id: 'R1', target_user_id: 'U3' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { kicked: true };

      kickedUserService.createKickedUser.mockResolvedValue(result);

      await controller.createKickedUser(req, res, next, io);

      expect(kickedUserService.createKickedUser).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R1', target_user_id: 'U3' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('createKickedUser failed');

      kickedUserService.createKickedUser.mockRejectedValue(err);

      await controller.createKickedUser(req, res, next);

      expect(kickedUserService.createKickedUser).toHaveBeenCalledWith(body, req.jwtPayload, undefined);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('キックの解除', () => {
    test('body, jwt を渡して結果を返す', async () => {
      const body = { room_id: 'R1', target_user_id: 'U3' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { deleted: true };

      kickedUserService.deleteKickedUser.mockResolvedValue(result);

      await controller.deleteKickedUser(req, res, next);

      expect(kickedUserService.deleteKickedUser).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R1', target_user_id: 'U3' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('deleteKickedUser failed');

      kickedUserService.deleteKickedUser.mockRejectedValue(err);

      await controller.deleteKickedUser(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
