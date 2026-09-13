jest.mock('../../../../../services/timeline/guest/guestReplyReactions.service', () => ({
  createReplyReaction: jest.fn(),
  deleteReplyReaction: jest.fn(),
}));

const svc = require('../../../../../services/timeline/guest/guestReplyReactions.service');
const controller = require('../../../../../controllers/timeline/guest/guestReplyReactions.controller.js');

describe('ゲストの返信リアクションのコントローラ', () => {
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

  describe('返信へのリアクション追加', () => {
    test('io を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { reply_id: 'RP1', reaction: 'like' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      svc.createReplyReaction.mockResolvedValue(result);

      await controller.createReplyReaction(req, res, next);

      expect(svc.createReplyReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { reply_id: 'RP1', reaction: 'love' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('createReplyReaction failed');

      req.io = io;
      svc.createReplyReaction.mockRejectedValue(err);

      await controller.createReplyReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('返信のリアクション削除', () => {
    test('io を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { reply_id: 'RP1', reaction_id: 'RR1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      svc.deleteReplyReaction.mockResolvedValue(result);

      await controller.deleteReplyReaction(req, res, next);

      expect(svc.deleteReplyReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { reply_id: 'RP1', reaction_id: 'RR1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('deleteReplyReaction failed');

      req.io = io;
      svc.deleteReplyReaction.mockRejectedValue(err);

      await controller.deleteReplyReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('リクエストのSocket.IO', () => {
    test('リクエストの io が使われる', async () => {
      const body = { reply_id: 'RP1', reaction: 'wow' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      svc.createReplyReaction.mockResolvedValue(result);

      await controller.createReplyReaction(req, res, next);

      expect(svc.createReplyReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });
  });
});
