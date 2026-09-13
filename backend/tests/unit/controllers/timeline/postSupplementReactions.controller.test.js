jest.mock('../../../../services/timeline/postSupplementReactions.service', () => ({
  createSupplementReaction: jest.fn(),
  deleteSupplementReaction: jest.fn(),
}));

const service = require('../../../../services/timeline/postSupplementReactions.service');
const controller = require('../../../../controllers/timeline/postSupplementReactions.controller.js');

describe('投稿付加情報リアクションのコントローラ', () => {
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

  describe('付加情報へのリアクション追加', () => {
    test('body, jwt, io を渡す', async () => {
      const body = { post_id: 'P001', supplement_id: 'S001', type: 'like' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      service.createSupplementReaction.mockResolvedValue(result);

      await controller.createSupplementReaction(req, res, next);

      expect(service.createSupplementReaction).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { post_id: 'P001', supplement_id: 'S001', type: 'love' };
      const req = makeReq(body, { sub: 'u1', user_id: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('createSupplementReaction failed');

      req.io = io;
      service.createSupplementReaction.mockRejectedValue(err);

      await controller.createSupplementReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('付加情報のリアクション削除', () => {
    test('body, jwt, io を渡す', async () => {
      const body = { post_id: 'P001', supplement_id: 'S001', reaction_id: 'R001' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      service.deleteSupplementReaction.mockResolvedValue(result);

      await controller.deleteSupplementReaction(req, res, next);

      expect(service.deleteSupplementReaction).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { post_id: 'P001', supplement_id: 'S001', reaction_id: 'R001' };
      const req = makeReq(body, { sub: 'u1', user_id: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('deleteSupplementReaction failed');

      req.io = io;
      service.deleteSupplementReaction.mockRejectedValue(err);

      await controller.deleteSupplementReaction(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
