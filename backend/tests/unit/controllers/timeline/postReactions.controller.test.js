jest.mock('../../../../services/timeline/postReactions.service', () => ({
  createReaction: jest.fn(),
  deleteReaction: jest.fn(),
}));

const postReactionsService = require('../../../../services/timeline/postReactions.service');
const controller = require('../../../../controllers/timeline/postReactions.controller.js');

describe('投稿リアクションのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { sub: 'user1', user_id: 'user1', role: 'user' }) => ({ body, jwtPayload });
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
    test('body, jwt, io を渡してサービスを呼ぶ', async () => {
      const body = { post_id: 'P001', type: 'like' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      postReactionsService.createReaction.mockResolvedValue(result);

      await controller.createReaction(req, res, next);

      expect(postReactionsService.createReaction).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { post_id: 'P001', type: 'love' };
      const req = makeReq(body, { sub: 'u1', user_id: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('createReaction failed');

      req.io = io;
      postReactionsService.createReaction.mockRejectedValue(err);

      await controller.createReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('リアクション削除', () => {
    test('body, jwt, io を渡してサービスを呼ぶ', async () => {
      const body = { post_id: 'P001', reaction_id: 'R001' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      postReactionsService.deleteReaction.mockResolvedValue(result);

      await controller.deleteReaction(req, res, next);

      expect(postReactionsService.deleteReaction).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { post_id: 'P001', reaction_id: 'R001' };
      const req = makeReq(body, { sub: 'u1', user_id: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('deleteReaction failed');

      req.io = io;
      postReactionsService.deleteReaction.mockRejectedValue(err);

      await controller.deleteReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
