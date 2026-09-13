jest.mock('../../../../services/floor/floorMember.service', () => ({
  list: jest.fn(),
  invite: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  leave: jest.fn(),
  managementPaginate: jest.fn(),
  managementDelete: jest.fn(),
}));

const floorMemberService = require('../../../../services/floor/floorMember.service');
const controller = require('../../../../controllers/floor/floorMember.controller');

describe('フロアメンバーのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { sub: 'user1', role: 'user' }) => ({
    body,
    jwtPayload,
  });
  const makeRes = () => {
    const res = {};
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };
  const makeNext = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001' };
      const jwt = { sub: 'u1', role: 'member' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 'm1' }];

      floorMemberService.list.mockResolvedValue(result);

      await controller.list(req, res, next);

      expect(floorMemberService.list).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('list failed');
      floorMemberService.list.mockRejectedValue(err);

      await controller.list(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('招待', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001', period: '8h' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { token: 'tok_123' };

      floorMemberService.invite.mockResolvedValue(result);

      await controller.invite(req, res, next);

      expect(floorMemberService.invite).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001', period: '3d' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('invite failed');
      floorMemberService.invite.mockRejectedValue(err);

      await controller.invite(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001', invite_token: 'tok_123' };
      const jwt = { sub: 'u2', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'member1', floor_id: 'F001' };

      floorMemberService.create.mockResolvedValue(result);

      await controller.create(req, res, next);

      expect(floorMemberService.create).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001', invite_token: 'tok_123' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('create failed');
      floorMemberService.create.mockRejectedValue(err);

      await controller.create(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'M001', floor_id: 'F001' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = {};
      const result = { _id: 'M001', deleted: true };

      floorMemberService.delete.mockResolvedValue(result);

      await controller.delete(req, res, next, io);

      expect(floorMemberService.delete).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'M001', floor_id: 'F001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('delete failed');
      floorMemberService.delete.mockRejectedValue(err);

      await controller.delete(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('退会', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001' };
      const jwt = { sub: 'u3', role: 'member' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = {};
      const result = { left: true };

      floorMemberService.leave.mockResolvedValue(result);

      await controller.leave(req, res, next, io);

      expect(floorMemberService.leave).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('leave failed');
      floorMemberService.leave.mockRejectedValue(err);

      await controller.leave(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面向けのページ単位の一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { page: 1 };
      const jwt = { sub: 'admin', role: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { total: 10, docs: [{ _id: 'm1' }] };

      floorMemberService.managementPaginate.mockResolvedValue(result);

      await controller.managementPaginate(req, res, next);

      expect(floorMemberService.managementPaginate).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ page: 1 });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('mgmt paginate failed');
      floorMemberService.managementPaginate.mockRejectedValue(err);

      await controller.managementPaginate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面からの削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'M001' };
      const jwt = { sub: 'admin', role: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = {};
      const result = { _id: 'M001', deleted: true };

      floorMemberService.managementDelete.mockResolvedValue(result);

      await controller.managementDelete(req, res, next, io);

      expect(floorMemberService.managementDelete).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'M001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('managementDelete failed');
      floorMemberService.managementDelete.mockRejectedValue(err);

      await controller.managementDelete(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
