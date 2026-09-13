jest.mock('../../../../services/room/room.service', () => ({
  guestList: jest.fn(),
  list: jest.fn(),
  detail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateRoomDisplayHidden: jest.fn(),
  updateDisplayOrder: jest.fn(),
  delete: jest.fn(),
  managementPaginate: jest.fn(),
  managementUpdate: jest.fn(),
  managementSetDeleteState: jest.fn(),
}));

const roomService = require('../../../../services/room/room.service');
const controller = require('../../../../controllers/room/room.controller');

describe('ルームのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { sub: 'user1', role: 'user' }) => ({
    body,
    jwtPayload,
    io: { id: "request-io" },
  });
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

  describe('ゲスト向けの一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 'r1' }];

      roomService.guestList.mockResolvedValue(result);

      await controller.guestList(req, res, next);

      expect(roomService.guestList).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('guestList failed');
      roomService.guestList.mockRejectedValue(err);

      await controller.guestList(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001' };
      const jwt = { sub: 'u1', role: 'member' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 'r1' }];

      roomService.list.mockResolvedValue(result);

      await controller.list(req, res, next);

      expect(roomService.list).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('list failed');
      roomService.list.mockRejectedValue(err);

      await controller.list(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('詳細取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'R001' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'R001', title: 'room' };

      roomService.detail.mockResolvedValue(result);

      await controller.detail(req, res, next);

      expect(roomService.detail).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'R001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('detail failed');
      roomService.detail.mockRejectedValue(err);

      await controller.detail(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001', title: 'new room' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'RNEW' };

      roomService.create.mockResolvedValue(result);

      await controller.create(req, res, next);

      expect(roomService.create).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001', title: 'x' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('create failed');
      roomService.create.mockRejectedValue(err);

      await controller.create(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'R001', title: 'updated' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'R001', title: 'updated' };

      roomService.update.mockResolvedValue(result);

      await controller.update(req, res, next);

      expect(roomService.update).toHaveBeenCalledWith(body, jwt, req.io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'R001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('update failed');
      roomService.update.mockRejectedValue(err);

      await controller.update(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('ルームの表示状態の変更', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001', room_display_hidden: true };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { modifiedCount: 2 };

      roomService.updateRoomDisplayHidden.mockResolvedValue(result);

      await controller.updateRoomDisplayHidden(req, res, next);

      expect(roomService.updateRoomDisplayHidden).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001', room_display_hidden: false });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('bulk failed');
      roomService.updateRoomDisplayHidden.mockRejectedValue(err);

      await controller.updateRoomDisplayHidden(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('表示順の変更', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001', orders: [{ _id: 'R1', order: 1 }] };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { ok: true };

      roomService.updateDisplayOrder.mockResolvedValue(result);

      await controller.updateDisplayOrder(req, res, next);

      expect(roomService.updateDisplayOrder).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001', orders: [] });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('order failed');
      roomService.updateDisplayOrder.mockRejectedValue(err);

      await controller.updateDisplayOrder(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'R001', floor_id: 'F001' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'R001', deleted: true };

      roomService.delete.mockResolvedValue(result);

      await controller.delete(req, res, next);

      expect(roomService.delete).toHaveBeenCalledWith(body, jwt, req.io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'R001', floor_id: 'F001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('delete failed');
      roomService.delete.mockRejectedValue(err);

      await controller.delete(req, res, next);
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
      const result = { total: 1, docs: [{ _id: 'r1' }] };

      roomService.managementPaginate.mockResolvedValue(result);

      await controller.managementPaginate(req, res, next);

      expect(roomService.managementPaginate).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ page: 1 });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('mgmt paginate failed');
      roomService.managementPaginate.mockRejectedValue(err);

      await controller.managementPaginate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面からの更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'R001', title: 'admin update', delete_flg: true };
      const jwt = { sub: 'admin', role: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'R001', deleted: true };

      roomService.managementUpdate.mockResolvedValue(result);

      await controller.managementUpdate(req, res, next);

      expect(roomService.managementUpdate).toHaveBeenCalledWith(body, jwt, req.io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'R001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('mgmt update failed');
      roomService.managementUpdate.mockRejectedValue(err);

      await controller.managementUpdate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面からの削除状態の変更', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'R1', delete_flg: true };
      const jwt = { user_id: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'R1', delete_flg: true };
      roomService.managementSetDeleteState.mockResolvedValue(result);

      await controller.managementSetDeleteState(req, res, next);

      expect(roomService.managementSetDeleteState).toHaveBeenCalledWith(body, jwt, req.io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'R1', delete_flg: false });
      const res = makeRes();
      const next = makeNext();
      const error = new Error('set delete state failed');
      roomService.managementSetDeleteState.mockRejectedValue(error);

      await controller.managementSetDeleteState(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
