jest.mock('../../../../../services/timeline/guest/guestReplySupplementReactions.service', () => ({
  createReplySupplementReaction: jest.fn(),
  deleteReplySupplementReaction: jest.fn(),
}));

const svc = require('../../../../../services/timeline/guest/guestReplySupplementReactions.service');
const controller = require('../../../../../controllers/timeline/guest/guestReplySupplementReactions.controller.js');

describe('ゲストの返信付加情報リアクションのコントローラ', () => {
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

  describe('返信の付加情報へのリアクション追加', () => {
    test('io を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { reply_id: 'RP1', supplement_id: 'RS1', reaction: 'like' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      svc.createReplySupplementReaction.mockResolvedValue(result);

      await controller.createReplySupplementReaction(req, res, next);

      expect(svc.createReplySupplementReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { reply_id: 'RP1', supplement_id: 'RS1', reaction: 'love' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('createReplySupplementReaction failed');

      req.io = io;
      svc.createReplySupplementReaction.mockRejectedValue(err);

      await controller.createReplySupplementReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('返信の付加情報のリアクション削除', () => {
    test('io を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { reply_id: 'RP1', supplement_id: 'RS1', reaction_id: 'RR1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      svc.deleteReplySupplementReaction.mockResolvedValue(result);

      await controller.deleteReplySupplementReaction(req, res, next);

      expect(svc.deleteReplySupplementReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { reply_id: 'RP1', supplement_id: 'RS1', reaction_id: 'RR1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('deleteReplySupplementReaction failed');

      req.io = io;
      svc.deleteReplySupplementReaction.mockRejectedValue(err);

      await controller.deleteReplySupplementReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('リクエストのSocket.IO', () => {
    test('リクエストの io が使われる', async () => {
      const body = { reply_id: 'RP1', supplement_id: 'RS1', reaction: 'wow' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      svc.createReplySupplementReaction.mockResolvedValue(result);

      await controller.createReplySupplementReaction(req, res, next);

      expect(svc.createReplySupplementReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });
  });
});
