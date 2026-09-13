jest.mock('../../../../../services/timeline/guest/guestPostReactions.service', () => ({
  createReaction: jest.fn(),
  deleteReaction: jest.fn(),
}));

const guestPostReactionsService = require('../../../../../services/timeline/guest/guestPostReactions.service');
const controller = require('../../../../../controllers/timeline/guest/guestPostReactions.controller.js');

describe('ゲストの投稿リアクションのコントローラ', () => {
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

  describe('リアクション追加', () => {
    test('io を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { post_id: 'P1', reaction: 'like' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      guestPostReactionsService.createReaction.mockResolvedValue(result);

      await controller.createReaction(req, res, next);

      expect(guestPostReactionsService.createReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { post_id: 'P1', reaction: 'love' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('createReaction failed');

      req.io = io;
      guestPostReactionsService.createReaction.mockRejectedValue(err);

      await controller.createReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('リアクション削除', () => {
    test('io を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { post_id: 'P1', reaction_id: 'R1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      guestPostReactionsService.deleteReaction.mockResolvedValue(result);

      await controller.deleteReaction(req, res, next);

      expect(guestPostReactionsService.deleteReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { post_id: 'P1', reaction_id: 'R1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('deleteReaction failed');

      req.io = io;
      guestPostReactionsService.deleteReaction.mockRejectedValue(err);

      await controller.deleteReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('リクエストのSocket.IO', () => {
    test('リクエストの io が使用される', async () => {
      const body = { post_id: 'P1', reaction: 'wow' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;

      guestPostReactionsService.createReaction.mockResolvedValue(result);

      await controller.createReaction(req, res, next);

      expect(guestPostReactionsService.createReaction).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });
  });
});
