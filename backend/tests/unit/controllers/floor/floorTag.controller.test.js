jest.mock('../../../../services/floor/floorTag.service', () => ({
  list: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  import: jest.fn(),
  init: jest.fn(),
  managementPaginate: jest.fn(),
  managementUpdate: jest.fn(),
  managementDelete: jest.fn(),
}));

const floorTagService = require('../../../../services/floor/floorTag.service');
const controller = require('../../../../controllers/floor/floorTag.controller');

describe('フロアタグのコントローラ', () => {
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
      const result = [{ _id: 'tag1', name: 't1' }];

      floorTagService.list.mockResolvedValue(result);

      await controller.list(req, res, next);

      expect(floorTagService.list).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('list failed');
      floorTagService.list.mockRejectedValue(err);

      await controller.list(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001', name: 'tag-A' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', ...body };

      floorTagService.create.mockResolvedValue(result);

      await controller.create(req, res, next);

      expect(floorTagService.create).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001', name: 'tag-A' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('create failed');
      floorTagService.create.mockRejectedValue(err);

      await controller.create(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'T1', floor_id: 'F001', name: 'tag-A2' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', name: 'tag-A2' };

      floorTagService.update.mockResolvedValue(result);

      await controller.update(req, res, next);

      expect(floorTagService.update).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'T1', name: 'x' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('update failed');
      floorTagService.update.mockRejectedValue(err);

      await controller.update(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'T1', floor_id: 'F001' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', deleted: true };

      floorTagService.delete.mockResolvedValue(result);

      await controller.delete(req, res, next);

      expect(floorTagService.delete).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'T1', floor_id: 'F001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('delete failed');
      floorTagService.delete.mockRejectedValue(err);

      await controller.delete(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('インポート', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001', tags: ['a', 'b'] };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { imported: 2 };

      floorTagService.import.mockResolvedValue(result);

      await controller['import'](req, res, next);

      expect(floorTagService.import).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001', tags: [] });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('import failed');
      floorTagService.import.mockRejectedValue(err);

      await controller['import'](req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('初期化', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { floor_id: 'F001' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { initialized: true };

      floorTagService.init.mockResolvedValue(result);

      await controller.init(req, res, next);

      expect(floorTagService.init).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ floor_id: 'F001' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('init failed');
      floorTagService.init.mockRejectedValue(err);

      await controller.init(req, res, next);
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
      const result = { total: 3, docs: [{ _id: 't1' }] };

      floorTagService.managementPaginate.mockResolvedValue(result);

      await controller.managementPaginate(req, res, next);

      expect(floorTagService.managementPaginate).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ page: 1 });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('mgmt paginate failed');
      floorTagService.managementPaginate.mockRejectedValue(err);

      await controller.managementPaginate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面からの更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'T1', name: 'tag-admin', delete_flg: true };
      const jwt = { sub: 'admin', role: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', deleted: true };

      floorTagService.managementUpdate.mockResolvedValue(result);

      await controller.managementUpdate(req, res, next);

      expect(floorTagService.managementUpdate).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'T1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('mgmt update failed');
      floorTagService.managementUpdate.mockRejectedValue(err);

      await controller.managementUpdate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面からの削除状態の変更', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'T1', delete_flg: true };
      const jwt = { user_id: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', delete_flg: true };
      floorTagService.managementDelete.mockResolvedValue(result);

      await controller.managementDelete(req, res, next);

      expect(floorTagService.managementDelete).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'T1', delete_flg: false });
      const res = makeRes();
      const next = makeNext();
      const error = new Error('set delete state failed');
      floorTagService.managementDelete.mockRejectedValue(error);

      await controller.managementDelete(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
