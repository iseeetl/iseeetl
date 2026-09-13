jest.mock('../../../services/categoryTag.service', () => ({
  list: jest.fn(),
  paginate: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  import: jest.fn(),
}));

const categoryTagService = require('../../../services/categoryTag.service');
const controller = require('../../../controllers/categoryTag.controller.js');

describe('共通タグのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { user_id: 'user1' }) => ({ body, jwtPayload });
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
    test('service.list の結果を返す', async () => {
      const req = makeReq();
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 't1' }];

      categoryTagService.list.mockResolvedValue(result);

      await controller.list(req, res, next);

      expect(categoryTagService.list).toHaveBeenCalledWith();
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq();
      const res = makeRes();
      const next = makeNext();
      const err = new Error('list failed');

      categoryTagService.list.mockRejectedValue(err);

      await controller.list(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('ページ単位の一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { page: 1, search: 'foo' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { total: 1, docs: [] };

      categoryTagService.paginate.mockResolvedValue(result);

      await controller.paginate(req, res, next);

      expect(categoryTagService.paginate).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { page: 1 };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('paginate failed');

      categoryTagService.paginate.mockRejectedValue(err);

      await controller.paginate(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('作成', () => {
    test('第二引数に jwtPayload.user_id を渡す', async () => {
      const body = { name: 'tag-1', color: '#fff' };
      const jwt = { user_id: 'admin-1' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'X', ...body };

      categoryTagService.create.mockResolvedValue(result);

      await controller.create(req, res, next);

      expect(categoryTagService.create).toHaveBeenCalledWith(body, 'admin-1');
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { name: 'x' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('create failed');

      categoryTagService.create.mockRejectedValue(err);

      await controller.create(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'T1', name: 'updated' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', name: 'updated' };

      categoryTagService.update.mockResolvedValue(result);

      await controller.update(req, res, next);

      expect(categoryTagService.update).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { _id: 'T1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('update failed');

      categoryTagService.update.mockRejectedValue(err);

      await controller.update(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('削除状態の変更', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const body = { _id: 'T1', delete_flg: true };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'T1', delete_flg: true };
      categoryTagService.delete.mockResolvedValue(result);

      await controller.delete(req, res, next);

      expect(categoryTagService.delete).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ _id: 'T1', delete_flg: false });
      const res = makeRes();
      const next = makeNext();
      const error = new Error('set delete state failed');
      categoryTagService.delete.mockRejectedValue(error);

      await controller.delete(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('インポート', () => {
    test('第二引数に jwtPayload.user_id を渡す', async () => {
      const body = { tags: [{ name: 'a' }] };
      const jwt = { user_id: 'admin-9' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { imported: 1 };

      categoryTagService.import.mockResolvedValue(result);

      await controller['import'](req, res, next);

      expect(categoryTagService.import).toHaveBeenCalledWith(body, 'admin-9');
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { tags: [] };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('import failed');

      categoryTagService.import.mockRejectedValue(err);

      await controller['import'](req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
