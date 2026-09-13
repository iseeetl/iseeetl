jest.mock('../../../../../services/timeline/guest/guestPostSupplementReactions.service', () => ({
  createSupplementReaction: jest.fn(),
  deleteSupplementReaction: jest.fn(),
}));

const svc = require('../../../../../services/timeline/guest/guestPostSupplementReactions.service');
const controller = require('../../../../../controllers/timeline/guest/guestPostSupplementReactions.controller.js');

describe('ゲストの投稿付加情報リアクションのコントローラ', () => {
  const makeReq = (body = {}) => ({ body });
  const makeRes = () => {
    const res = {};
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };
  const makeNext = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('付加情報へのリアクション追加', () => {
    test('io を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { post_id: 'P1', supplement_id: 'S1', reaction: 'like' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      svc.createSupplementReaction.mockResolvedValue(result);

      await controller.createSupplementReaction(req, res, next);

      expect(svc.createSupplementReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { post_id: 'P1', supplement_id: 'S1', reaction: 'love' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('createSupplementReaction failed');

      req.io = io;
      svc.createSupplementReaction.mockRejectedValue(err);

      await controller.createSupplementReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('付加情報のリアクション削除', () => {
    test('io を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { post_id: 'P1', supplement_id: 'S1', reaction_id: 'R1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      svc.deleteSupplementReaction.mockResolvedValue(result);

      await controller.deleteSupplementReaction(req, res, next);

      expect(svc.deleteSupplementReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { post_id: 'P1', supplement_id: 'S1', reaction_id: 'R1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('deleteSupplementReaction failed');

      req.io = io;
      svc.deleteSupplementReaction.mockRejectedValue(err);

      await controller.deleteSupplementReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('リクエストのSocket.IO', () => {
    test('リクエストの io が使われる', async () => {
      const body = { post_id: 'P1', supplement_id: 'S1', reaction: 'wow' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      svc.createSupplementReaction.mockResolvedValue(result);

      await controller.createSupplementReaction(req, res, next);

      expect(svc.createSupplementReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });
  });
});
