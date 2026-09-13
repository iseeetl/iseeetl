jest.mock('../../../../services/room/roomTag.service', () => ({
  create: jest.fn(),
  delete: jest.fn(),
  import: jest.fn(),
  init: jest.fn(),
  list: jest.fn(),
  managementPaginate: jest.fn(),
  managementUpdate: jest.fn(),
  managementSetDeleteState: jest.fn(),
  update: jest.fn(),
}));

const roomTagService = require('../../../../services/room/roomTag.service');
const controller = require('../../../../controllers/room/roomTag.controller.js');

describe('ルームタグのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { sub: 'user1', role: 'user' }, guest) => ({
    body,
    jwtPayload,
    guest,
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


  describe('作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { room_id: 'R001', name: 'tag-A' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', ...body };

      roomTagService.create.mockResolvedValue(result);

      await controller.create(req, res, next);

      expect(roomTagService.create).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R001', name: 'tag-A' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('create failed');

      roomTagService.create.mockRejectedValue(err);

      await controller.create(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'T1', room_id: 'R001', name: 'tag-A2' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', name: 'tag-A2' };

      roomTagService.update.mockResolvedValue(result);

      await controller.update(req, res, next);

      expect(roomTagService.update).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { _id: 'T1', room_id: 'R001', name: 'tag-A2' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('update failed');

      roomTagService.update.mockRejectedValue(err);

      await controller.update(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'T1', room_id: 'R001' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', deleted: true };

      roomTagService.delete.mockResolvedValue(result);

      await controller.delete(req, res, next);

      expect(roomTagService.delete).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { _id: 'T1', room_id: 'R001' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('delete failed');

      roomTagService.delete.mockRejectedValue(err);

      await controller.delete(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('インポート', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { room_id: 'R001', tags: ['a', 'b'] };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { imported: 2 };

      roomTagService.import.mockResolvedValue(result);

      await controller['import'](req, res, next);

      expect(roomTagService.import).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R001', tags: [] };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('import failed');

      roomTagService.import.mockRejectedValue(err);

      await controller['import'](req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('初期化', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { room_id: 'R001' };
      const jwt = { sub: 'u1', role: 'editor' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { initialized: true };

      roomTagService.init.mockResolvedValue(result);

      await controller.init(req, res, next);

      expect(roomTagService.init).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { room_id: 'R001' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('init failed');

      roomTagService.init.mockRejectedValue(err);

      await controller.init(req, res, next);
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
      const result = { total: 1, docs: [{ _id: 't1' }] };

      roomTagService.managementPaginate.mockResolvedValue(result);

      await controller.managementPaginate(req, res, next);

      expect(roomTagService.managementPaginate).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { page: 1, search: '' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('managementPaginate failed');

      roomTagService.managementPaginate.mockRejectedValue(err);

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

      roomTagService.managementUpdate.mockResolvedValue(result);

      await controller.managementUpdate(req, res, next);

      expect(roomTagService.managementUpdate).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { _id: 'T1', name: 'tag-admin', delete_flg: true };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('managementUpdate failed');

      roomTagService.managementUpdate.mockRejectedValue(err);

      await controller.managementUpdate(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('管理画面からの削除状態の変更', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'T1', delete_flg: false };
      const jwt = { user_id: 'admin' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', delete_flg: false };
      roomTagService.managementSetDeleteState.mockResolvedValue(result);

      await controller.managementSetDeleteState(req, res, next);

      expect(roomTagService.managementSetDeleteState).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'T1', delete_flg: true });
      const res = makeRes();
      const next = makeNext();
      const error = new Error('set delete state failed');
      roomTagService.managementSetDeleteState.mockRejectedValue(error);

      await controller.managementSetDeleteState(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
