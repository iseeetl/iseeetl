jest.mock('../../../services/quickText.service', () => ({
  listAllGroups: jest.fn(),
  paginateGroups: jest.fn(),
  createGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  listItems: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
}));

const quickTextService = require('../../../services/quickText.service');
const controller = require('../../../controllers/quickText.controller');

describe('単語のコントローラ', () => {
  const makeReq = ({ params = {}, body = {}, query = {}, jwtPayload = { user_id: 'u1' } } = {}) => ({
    params,
    body,
    query,
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

  describe('全単語グループの取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const jwt = { user_id: 'u1', user_role: 'admin' };
      const req = makeReq({ jwtPayload: jwt });
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 'g1' }];

      quickTextService.listAllGroups.mockResolvedValue(result);

      await controller.listAllGroups(req, res, next);

      expect(quickTextService.listAllGroups).toHaveBeenCalledWith({ jwtPayload: jwt });
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq();
      const res = makeRes();
      const next = makeNext();
      const err = new Error('listAllGroups failed');
      quickTextService.listAllGroups.mockRejectedValue(err);

      await controller.listAllGroups(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語グループのページ単位の一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const jwt = { user_id: 'u1' };
      const req = makeReq({ query: { page: '2' }, jwtPayload: jwt });
      const res = makeRes();
      const next = makeNext();
      const result = { docs: [{ _id: 'g1' }], page: 2 };

      quickTextService.paginateGroups.mockResolvedValue(result);

      await controller.paginateGroups(req, res, next);

      expect(quickTextService.paginateGroups).toHaveBeenCalledWith({ page: 2, jwtPayload: jwt });
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ query: { page: '2' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('paginate failed');
      quickTextService.paginateGroups.mockRejectedValue(err);

      await controller.paginateGroups(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語グループの作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ body: { order: 1, title: 'g1', lang: 'ja' } });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'g1' };

      quickTextService.createGroup.mockResolvedValue(result);

      await controller.createGroup(req, res, next);

      expect(quickTextService.createGroup).toHaveBeenCalledWith({
        title: 'g1',
        lang: 'ja',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ body: { title: 'g1', lang: 'ja' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('create failed');
      quickTextService.createGroup.mockRejectedValue(err);

      await controller.createGroup(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語グループの更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({
        params: { id: 'g1' },
        body: { order: 2, title: 'g2', lang: 'en' },
      });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'g1', title: 'g2' };

      quickTextService.updateGroup.mockResolvedValue(result);

      await controller.updateGroup(req, res, next);

      expect(quickTextService.updateGroup).toHaveBeenCalledWith({
        id: 'g1',
        order: 2,
        title: 'g2',
        lang: 'en',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { id: 'g1' }, body: { title: 'g2' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('update failed');
      quickTextService.updateGroup.mockRejectedValue(err);

      await controller.updateGroup(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語グループの削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { id: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const result = { ok: true };

      quickTextService.deleteGroup.mockResolvedValue(result);

      await controller.deleteGroup(req, res, next);

      expect(quickTextService.deleteGroup).toHaveBeenCalledWith({ id: 'g1', jwtPayload: req.jwtPayload });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { id: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('delete failed');
      quickTextService.deleteGroup.mockRejectedValue(err);

      await controller.deleteGroup(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { groupId: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 'i1' }];

      quickTextService.listItems.mockResolvedValue(result);

      await controller.listItems(req, res, next);

      expect(quickTextService.listItems).toHaveBeenCalledWith({ groupId: 'g1', jwtPayload: req.jwtPayload });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { groupId: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('list items failed');
      quickTextService.listItems.mockRejectedValue(err);

      await controller.listItems(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { groupId: 'g1' }, body: { order: 1, label: 'l1', lang: 'ja' } });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'i1' };

      quickTextService.createItem.mockResolvedValue(result);

      await controller.createItem(req, res, next);

      expect(quickTextService.createItem).toHaveBeenCalledWith({
        groupId: 'g1',
        label: 'l1',
        lang: 'ja',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { groupId: 'g1' }, body: { label: 'l1', lang: 'ja' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('create item failed');
      quickTextService.createItem.mockRejectedValue(err);

      await controller.createItem(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { id: 'i1' }, body: { order: 2, label: 'l2', lang: 'en' } });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'i1', label: 'l2' };

      quickTextService.updateItem.mockResolvedValue(result);

      await controller.updateItem(req, res, next);

      expect(quickTextService.updateItem).toHaveBeenCalledWith({
        id: 'i1',
        order: 2,
        label: 'l2',
        lang: 'en',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { id: 'i1' }, body: { label: 'l2' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('update item failed');
      quickTextService.updateItem.mockRejectedValue(err);

      await controller.updateItem(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { id: 'i1' } });
      const res = makeRes();
      const next = makeNext();
      const result = { ok: true };

      quickTextService.deleteItem.mockResolvedValue(result);

      await controller.deleteItem(req, res, next);

      expect(quickTextService.deleteItem).toHaveBeenCalledWith({ id: 'i1', jwtPayload: req.jwtPayload });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { id: 'i1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('delete item failed');
      quickTextService.deleteItem.mockRejectedValue(err);

      await controller.deleteItem(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
