jest.mock('../../../../services/room/roomQuickText.service', () => ({
  listGroups: jest.fn(),
  listItems: jest.fn(),
  createGroup: jest.fn(),
  updateGroup: jest.fn(),
  deleteGroup: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
}));

const roomQuickTextService = require('../../../../services/room/roomQuickText.service');
const controller = require('../../../../controllers/room/roomQuickText.controller');

describe('ルームの単語のコントローラ', () => {
  const makeReq = ({
    params = {},
    body = {},
    query = {},
    jwtPayload = { user_id: 'u1' },
    guest,
  } = {}) => ({
    params,
    body,
    query,
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

  describe('単語グループの一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const guest = { id: 'guest-1' };
      const req = makeReq({ params: { roomId: 'r1' }, query: { lang: 'ja' }, guest });
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 'g1' }];

      roomQuickTextService.listGroups.mockResolvedValue(result);

      await controller.listGroups(req, res, next);

      expect(roomQuickTextService.listGroups).toHaveBeenCalledWith({
        roomId: 'r1',
        lang: 'ja',
        jwtPayload: req.jwtPayload,
        guest,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { roomId: 'r1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('listGroups failed');
      roomQuickTextService.listGroups.mockRejectedValue(err);

      await controller.listGroups(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の一覧取得', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const guest = { id: 'guest-1' };
      const req = makeReq({ params: { roomId: 'r1', groupId: 'g1' }, query: { lang: 'en' }, guest });
      const res = makeRes();
      const next = makeNext();
      const result = [{ _id: 'i1' }];

      roomQuickTextService.listItems.mockResolvedValue(result);

      await controller.listItems(req, res, next);

      expect(roomQuickTextService.listItems).toHaveBeenCalledWith({
        roomId: 'r1',
        groupId: 'g1',
        lang: 'en',
        jwtPayload: req.jwtPayload,
        guest,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { roomId: 'r1', groupId: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('listItems failed');
      roomQuickTextService.listItems.mockRejectedValue(err);

      await controller.listItems(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語グループの作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { roomId: 'r1' }, body: { order: 1, title: 'g1', lang: 'ja' } });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'g1' };

      roomQuickTextService.createGroup.mockResolvedValue(result);

      await controller.createGroup(req, res, next);

      expect(roomQuickTextService.createGroup).toHaveBeenCalledWith({
        roomId: 'r1',
        order: 1,
        title: 'g1',
        lang: 'ja',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { roomId: 'r1' }, body: { title: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('createGroup failed');
      roomQuickTextService.createGroup.mockRejectedValue(err);

      await controller.createGroup(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語グループの更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({
        params: { roomId: 'r1', id: 'g1' },
        body: { order: 2, title: 'g2', lang: 'en' },
      });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'g1', title: 'g2' };

      roomQuickTextService.updateGroup.mockResolvedValue(result);

      await controller.updateGroup(req, res, next);

      expect(roomQuickTextService.updateGroup).toHaveBeenCalledWith({
        roomId: 'r1',
        id: 'g1',
        order: 2,
        title: 'g2',
        lang: 'en',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { roomId: 'r1', id: 'g1' }, body: { title: 'g2' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('updateGroup failed');
      roomQuickTextService.updateGroup.mockRejectedValue(err);

      await controller.updateGroup(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語グループの削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { roomId: 'r1', id: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const result = { ok: true };

      roomQuickTextService.deleteGroup.mockResolvedValue(result);

      await controller.deleteGroup(req, res, next);

      expect(roomQuickTextService.deleteGroup).toHaveBeenCalledWith({
        roomId: 'r1',
        id: 'g1',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { roomId: 'r1', id: 'g1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('deleteGroup failed');
      roomQuickTextService.deleteGroup.mockRejectedValue(err);

      await controller.deleteGroup(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の作成', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({
        params: { roomId: 'r1', groupId: 'g1' },
        body: { order: 1, label: 'l1', lang: 'ja' },
      });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'i1' };

      roomQuickTextService.createItem.mockResolvedValue(result);

      await controller.createItem(req, res, next);

      expect(roomQuickTextService.createItem).toHaveBeenCalledWith({
        roomId: 'r1',
        groupId: 'g1',
        order: 1,
        label: 'l1',
        lang: 'ja',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { roomId: 'r1', groupId: 'g1' }, body: { label: 'l1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('createItem failed');
      roomQuickTextService.createItem.mockRejectedValue(err);

      await controller.createItem(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の更新', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({
        params: { roomId: 'r1', id: 'i1' },
        body: { order: 2, label: 'l2', lang: 'en' },
      });
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'i1', label: 'l2' };

      roomQuickTextService.updateItem.mockResolvedValue(result);

      await controller.updateItem(req, res, next);

      expect(roomQuickTextService.updateItem).toHaveBeenCalledWith({
        roomId: 'r1',
        id: 'i1',
        order: 2,
        label: 'l2',
        lang: 'en',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { roomId: 'r1', id: 'i1' }, body: { label: 'l2' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('updateItem failed');
      roomQuickTextService.updateItem.mockRejectedValue(err);

      await controller.updateItem(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('単語の削除', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ params: { roomId: 'r1', id: 'i1' } });
      const res = makeRes();
      const next = makeNext();
      const result = { ok: true };

      roomQuickTextService.deleteItem.mockResolvedValue(result);

      await controller.deleteItem(req, res, next);

      expect(roomQuickTextService.deleteItem).toHaveBeenCalledWith({
        roomId: 'r1',
        id: 'i1',
        jwtPayload: req.jwtPayload,
      });
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({ params: { roomId: 'r1', id: 'i1' } });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('deleteItem failed');
      roomQuickTextService.deleteItem.mockRejectedValue(err);

      await controller.deleteItem(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
