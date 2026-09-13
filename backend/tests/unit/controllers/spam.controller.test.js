jest.mock('../../../services/spam.service', () => ({
  getSpamList: jest.fn(),
  createSpam: jest.fn(),
  updateSpam: jest.fn(),
  deleteSpam: jest.fn(),
}));

const spamService = require('../../../services/spam.service');
const controller = require('../../../controllers/spam.controller.js');

describe('スパムのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { user_id: 'u1' }) => ({ body, jwtPayload });
  const makeRes = () => {
    const res = {};
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };
  const makeNext = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('スパムの一覧取得', () => {
    test('body を渡して結果を返す', async () => {
      const body = { page: 1, search: '' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { total: 0, docs: [] };

      spamService.getSpamList.mockResolvedValue(result);

      await controller.getSpamList(req, res, next);

      expect(spamService.getSpamList).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { page: 1 };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('getSpamList failed');

      spamService.getSpamList.mockRejectedValue(err);

      await controller.getSpamList(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('スパム作成', () => {
    test('第二引数に jwtPayload.user_id を渡す', async () => {
      const body = { word: 'spamword' };
      const jwt = { user_id: 'u1' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'S1', ...body };

      spamService.createSpam.mockResolvedValue(result);

      await controller.createSpam(req, res, next);

      expect(spamService.createSpam).toHaveBeenCalledWith(body, 'u1');
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { word: 'spam' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('createSpam failed');

      spamService.createSpam.mockRejectedValue(err);

      await controller.createSpam(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('スパム更新', () => {
    test('body を渡す', async () => {
      const body = { _id: 'S1', word: 'updated' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'S1', word: 'updated' };

      spamService.updateSpam.mockResolvedValue(result);

      await controller.updateSpam(req, res, next);

      expect(spamService.updateSpam).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { _id: 'S1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('updateSpam failed');

      spamService.updateSpam.mockRejectedValue(err);

      await controller.updateSpam(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('スパム削除', () => {
    test('body を渡す', async () => {
      const body = { _id: 'S1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { deleted: true };

      spamService.deleteSpam.mockResolvedValue(result);

      await controller.deleteSpam(req, res, next);

      expect(spamService.deleteSpam).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { _id: 'S1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('deleteSpam failed');

      spamService.deleteSpam.mockRejectedValue(err);

      await controller.deleteSpam(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
