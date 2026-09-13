jest.mock('../../../../services/floor/floorQuickText.service', () => ({
  listGroups: jest.fn(),
  createGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  listItems: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
}));

const floorQuickTextService = require('../../../../services/floor/floorQuickText.service');
const controller = require('../../../../controllers/floor/floorQuickText.controller');

describe('フロアの単語のコントローラ', () => {
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

  describe('単語グループの一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { floorId: 'f1' }, query: { lang: 'ja' } });
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 'g1' }];

      floorQuickTextService.listGroups.mockResolvedValue(result);

      await controller.listGroups(req, res, next);

      expect(floorQuickTextService.listGroups).toHaveBeenCalledWith({
        floorId: 'f1',
        lang: 'ja',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { floorId: 'f1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('listGroups failed');
      floorQuickTextService.listGroups.mockRejectedValue(err);

      await controller.listGroups(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語グループの作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { floorId: 'f1' }, body: { order: 1, title: 'g1', lang: 'ja' } });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'g1' };

      floorQuickTextService.createGroup.mockResolvedValue(result);

      await controller.createGroup(req, res, next);

      expect(floorQuickTextService.createGroup).toHaveBeenCalledWith({
        floorId: 'f1',
        order: 1,
        title: 'g1',
        lang: 'ja',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { floorId: 'f1' }, body: { title: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('createGroup failed');
      floorQuickTextService.createGroup.mockRejectedValue(err);

      await controller.createGroup(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語グループの更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({
        params: { floorId: 'f1', id: 'g1' },
        body: { order: 2, title: 'g2', lang: 'en' },
      });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'g1', title: 'g2' };

      floorQuickTextService.updateGroup.mockResolvedValue(result);

      await controller.updateGroup(req, res, next);

      expect(floorQuickTextService.updateGroup).toHaveBeenCalledWith({
        floorId: 'f1',
        id: 'g1',
        order: 2,
        title: 'g2',
        lang: 'en',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { floorId: 'f1', id: 'g1' }, body: { title: 'g2' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('updateGroup failed');
      floorQuickTextService.updateGroup.mockRejectedValue(err);

      await controller.updateGroup(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語グループの削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { floorId: 'f1', id: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const result = { ok: true };

      floorQuickTextService.deleteGroup.mockResolvedValue(result);

      await controller.deleteGroup(req, res, next);

      expect(floorQuickTextService.deleteGroup).toHaveBeenCalledWith({
        floorId: 'f1',
        id: 'g1',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { floorId: 'f1', id: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('deleteGroup failed');
      floorQuickTextService.deleteGroup.mockRejectedValue(err);

      await controller.deleteGroup(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { floorId: 'f1', groupId: 'g1' }, query: { lang: 'ja' } });
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 'i1' }];

      floorQuickTextService.listItems.mockResolvedValue(result);

      await controller.listItems(req, res, next);

      expect(floorQuickTextService.listItems).toHaveBeenCalledWith({
        floorId: 'f1',
        groupId: 'g1',
        lang: 'ja',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { floorId: 'f1', groupId: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('listItems failed');
      floorQuickTextService.listItems.mockRejectedValue(err);

      await controller.listItems(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({
        params: { floorId: 'f1', groupId: 'g1' },
        body: { order: 1, label: 'l1', lang: 'ja' },
      });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'i1' };

      floorQuickTextService.createItem.mockResolvedValue(result);

      await controller.createItem(req, res, next);

      expect(floorQuickTextService.createItem).toHaveBeenCalledWith({
        floorId: 'f1',
        groupId: 'g1',
        order: 1,
        label: 'l1',
        lang: 'ja',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { floorId: 'f1', groupId: 'g1' }, body: { label: 'l1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('createItem failed');
      floorQuickTextService.createItem.mockRejectedValue(err);

      await controller.createItem(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({
        params: { floorId: 'f1', id: 'i1' },
        body: { order: 2, label: 'l2', lang: 'en' },
      });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'i1', label: 'l2' };

      floorQuickTextService.updateItem.mockResolvedValue(result);

      await controller.updateItem(req, res, next);

      expect(floorQuickTextService.updateItem).toHaveBeenCalledWith({
        floorId: 'f1',
        id: 'i1',
        order: 2,
        label: 'l2',
        lang: 'en',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { floorId: 'f1', id: 'i1' }, body: { label: 'l2' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('updateItem failed');
      floorQuickTextService.updateItem.mockRejectedValue(err);

      await controller.updateItem(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { floorId: 'f1', id: 'i1' } });
      const res = makeRes();
      const next = makeNext();
      const result = { ok: true };

      floorQuickTextService.deleteItem.mockResolvedValue(result);

      await controller.deleteItem(req, res, next);

      expect(floorQuickTextService.deleteItem).toHaveBeenCalledWith({
        floorId: 'f1',
        id: 'i1',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { floorId: 'f1', id: 'i1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('deleteItem failed');
      floorQuickTextService.deleteItem.mockRejectedValue(err);

      await controller.deleteItem(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
