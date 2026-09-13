jest.mock('../../../../services/floor/floor.service', () => ({
  guestPaginate: jest.fn(),
  paginate: jest.fn(),
  getRole: jest.fn(),
  getDetail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateFloorDisplayHidden: jest.fn(),
  delete: jest.fn(),
  managementPaginate: jest.fn(),
  managementGetDetail: jest.fn(),
  managementUpdate: jest.fn(),
  managementSetDeleteState: jest.fn(),
}));

const floorService = require('../../../../services/floor/floor.service');
const controller = require('../../../../controllers/floor/floor.controller');

describe('フロアのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { sub: 'user1', role: 'user' }) => ({
    body,
    jwtPayload,
    io: { id: "request-io" },
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

  describe('ゲスト向けのページ単位の一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ page: 1, search: 'foo' });
      const res = makeRes();
      const next = makeNext();
      const result = { docs: [{ id: 'f1' }] };

      floorService.guestPaginate.mockResolvedValue(result);

      await controller.guestPaginate(req, res, next);

      expect(floorService.guestPaginate).toHaveBeenCalledWith({ page: 1, search: 'foo' });
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ page: 1, search: null });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('boom');
      floorService.guestPaginate.mockRejectedValue(err);

      await controller.guestPaginate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('ページ単位の一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const jwt = { sub: 'u1', role: 'admin' };
      const req = makeReq({ page: 2, search: 'bar' }, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { docs: [] };
      floorService.paginate.mockResolvedValue(result);

      await controller.paginate(req, res, next);

      expect(floorService.paginate).toHaveBeenCalledWith({ page: 2, search: 'bar' }, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ page: 1, search: '' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('bad');
      floorService.paginate.mockRejectedValue(err);

      await controller.paginate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('権限取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const jwt = { sub: 'u1' };
      const req = makeReq({ floor_id: 'F001' }, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { is_editor: true };
      floorService.getRole.mockResolvedValue(result);

      await controller.getRole(req, res, next);

      expect(floorService.getRole).toHaveBeenCalledWith({ floor_id: 'F001' }, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('oops');
      floorService.getRole.mockRejectedValue(err);

      await controller.getRole(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('詳細取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ _id: 'FFF' });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'FFF', title: 'T' };
      floorService.getDetail.mockResolvedValue(result);

      await controller.getDetail(req, res, next);

      expect(floorService.getDetail).toHaveBeenCalledWith({ _id: 'FFF' });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'NG' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('xx');
      floorService.getDetail.mockRejectedValue(err);

      await controller.getDetail(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = {
        title: 'A',
        description: 'B',
        floor_display_hidden: false,
        lang: 'ja',
        target_langs: ['en'],
      };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'new' };
      floorService.create.mockResolvedValue(result);

      await controller.create(req, res, next);

      expect(floorService.create).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { title: 'X' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('create failed');
      floorService.create.mockRejectedValue(err);

      await controller.create(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = {
        _id: 'ID1',
        title: 'T',
        description: 'D',
        lang: 'ja',
        target_langs: ['en'],
        image_name: 'x.png',
        floor_display_hidden: true,
      };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'ID1', title: 'T!' };
      floorService.update.mockResolvedValue(result);

      await controller.update(req, res, next);

      expect(floorService.update).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { _id: 'ID1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('update failed');
      floorService.update.mockRejectedValue(err);

      await controller.update(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('フロアの表示状態の変更', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_display_hidden: true };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { modifiedCount: 3 };
      floorService.updateFloorDisplayHidden.mockResolvedValue(result);

      await controller.updateFloorDisplayHidden(req, res, next);

      expect(floorService.updateFloorDisplayHidden).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_display_hidden: false });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('bulk failed');
      floorService.updateFloorDisplayHidden.mockRejectedValue(err);

      await controller.updateFloorDisplayHidden(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'ID1' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'ID1', deleted: true };
      floorService.delete.mockResolvedValue(result);

      await controller.delete(req, res, next);

      expect(floorService.delete).toHaveBeenCalledWith(body, jwt, req.io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'ID1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('delete failed');
      floorService.delete.mockRejectedValue(err);

      await controller.delete(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面向けのページ単位の一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { page: 1, search: 'x' };
      const jwt = { sub: 'admin', role: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { total: 1, docs: [] };
      floorService.managementPaginate.mockResolvedValue(result);

      await controller.managementPaginate(req, res, next);

      expect(floorService.managementPaginate).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ page: 1 });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('mgmt paginate failed');
      floorService.managementPaginate.mockRejectedValue(err);

      await controller.managementPaginate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面向けの詳細取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'F1' };
      const jwt = { user_id: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'F1', delete_flg: true };
      floorService.managementGetDetail.mockResolvedValue(result);

      await controller.managementGetDetail(req, res, next);

      expect(floorService.managementGetDetail).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'missing' }, { user_id: 'admin' });
      const res = makeRes();
      const next = makeNext();
      const error = new Error('detail failed');
      floorService.managementGetDetail.mockRejectedValue(error);

      await controller.managementGetDetail(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('管理画面からの更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = {
        _id: 'X',
        title: 'Y',
        delete_flg: true,
        floor_display_hidden: false,
      };
      const jwt = { sub: 'admin', role: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'X', title: 'Y!' };
      floorService.managementUpdate.mockResolvedValue(result);

      await controller.managementUpdate(req, res, next);

      expect(floorService.managementUpdate).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'Z' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('mgmt update failed');
      floorService.managementUpdate.mockRejectedValue(err);

      await controller.managementUpdate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面からの削除状態の変更', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'F1', delete_flg: true };
      const jwt = { user_id: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'F1', delete_flg: true };
      floorService.managementSetDeleteState.mockResolvedValue(result);

      await controller.managementSetDeleteState(req, res, next);

      expect(floorService.managementSetDeleteState).toHaveBeenCalledWith(body, jwt, req.io);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'F1', delete_flg: false });
      const res = makeRes();
      const next = makeNext();
      const error = new Error('set delete state failed');
      floorService.managementSetDeleteState.mockRejectedValue(error);

      await controller.managementSetDeleteState(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
