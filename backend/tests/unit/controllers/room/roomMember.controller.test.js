jest.mock('../../../../services/room/roomMember.service', () => ({
  isCurrentUserRoomMember: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  invite: jest.fn(),
  leave: jest.fn(),
  list: jest.fn(),
  managementDelete: jest.fn(),
  managementPaginate: jest.fn(),
}));

const roomMemberService = require('../../../../services/room/roomMember.service');
const controller = require('../../../../controllers/room/roomMember.controller.js');

describe('ルームメンバーのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { sub: 'user1', role: 'user' }) => ({ body, jwtPayload });
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
      const body = { room_id: 'R001' };
      const jwt = { sub: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { ok: true };

      roomMemberService.list.mockResolvedValue(result);

      await controller.list(req, res, next);

      expect(roomMemberService.list).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R001' };
      const req = makeReq(body, { sub: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('list failed');

      roomMemberService.list.mockRejectedValue(err);

      await controller.list(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('招待', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { room_id: 'R001', period: '8h' };
      const jwt = { sub: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { token: 'tok_room_invite' };

      roomMemberService.invite.mockResolvedValue(result);

      await controller.invite(req, res, next);

      expect(roomMemberService.invite).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R001', period: '8h' };
      const req = makeReq(body, { sub: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('invite failed');

      roomMemberService.invite.mockRejectedValue(err);

      await controller.invite(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { room_id: 'R001', invite_token: 'tok_room_invite' };
      const jwt = { sub: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'member1' };

      roomMemberService.create.mockResolvedValue(result);

      await controller.create(req, res, next);

      expect(roomMemberService.create).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R001', invite_token: 'tok_room_invite' };
      const req = makeReq(body, { sub: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('create failed');

      roomMemberService.create.mockRejectedValue(err);

      await controller.create(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'RM001', room_id: 'R001' };
      const jwt = { sub: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = { to: jest.fn() };
      const result = { deleted: true };

      roomMemberService.delete.mockResolvedValue(result);

      await controller.delete(req, res, next, io);

      expect(roomMemberService.delete).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { _id: 'RM001', room_id: 'R001' };
      const req = makeReq(body, { sub: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('delete failed');

      roomMemberService.delete.mockRejectedValue(err);

      await controller.delete(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('退会', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { room_id: 'R001' };
      const jwt = { sub: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = {};
      const result = { left: true };

      roomMemberService.leave.mockResolvedValue(result);

      await controller.leave(req, res, next, io);

      expect(roomMemberService.leave).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R001' };
      const req = makeReq(body, { sub: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('leave failed');

      roomMemberService.leave.mockRejectedValue(err);

      await controller.leave(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('所属の確認', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { room_id: 'R001', user_id: 'U001' };
      const jwt = { sub: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { contains: true };

      roomMemberService.isCurrentUserRoomMember.mockResolvedValue(result);

      await controller.contains(req, res, next);

      expect(roomMemberService.isCurrentUserRoomMember).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R001', user_id: 'U001' };
      const req = makeReq(body, { sub: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('contains failed');

      roomMemberService.isCurrentUserRoomMember.mockRejectedValue(err);

      await controller.contains(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面向けのページ単位の一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { page: 1, search: '' };
      const jwt = { sub: 'admin', role: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { total: 1, docs: [{ _id: 'rm1' }] };

      roomMemberService.managementPaginate.mockResolvedValue(result);

      await controller.managementPaginate(req, res, next);

      expect(roomMemberService.managementPaginate).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { page: 1, search: '' };
      const req = makeReq(body, { sub: 'admin' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('managementPaginate failed');

      roomMemberService.managementPaginate.mockRejectedValue(err);

      await controller.managementPaginate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面からの削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'RM001' };
      const jwt = { sub: 'admin', role: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = {};
      const result = { deleted: true };

      roomMemberService.managementDelete.mockResolvedValue(result);

      await controller.managementDelete(req, res, next, io);

      expect(roomMemberService.managementDelete).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { _id: 'RM001' };
      const req = makeReq(body, { sub: 'admin' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('managementDelete failed');

      roomMemberService.managementDelete.mockRejectedValue(err);

      await controller.managementDelete(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
