jest.mock('../../../../services/timeline/replySupplementReactions.service', () => ({
  create: jest.fn(),
  delete: jest.fn(),
}));

const service = require('../../../../services/timeline/replySupplementReactions.service');
const controller = require('../../../../controllers/timeline/replySupplementReactions.controller.js');

describe('返信付加情報リアクションのコントローラ', () => {
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

  describe('作成', () => {
    test('body, jwt, io を渡す', async () => {
      const body = { reply_id: 'RP1', supplement_id: 'RS1', type: 'like' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      service.create.mockResolvedValue(result);

      await controller.create(req, res, next);

      expect(service.create).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { reply_id: 'RP1', supplement_id: 'RS1', type: 'love' };
      const req = makeReq(body, { sub: 'u1', user_id: 'u1', role: 'user' });
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('create failed');

      req.io = io;
      service.create.mockRejectedValue(err);

      await controller.create(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('削除', () => {
    test('body, jwt, io を渡す', async () => {
      const body = { reply_id: 'RP1', supplement_id: 'RS1', reaction_id: 'RR1' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { ok: true };

      req.io = io;
      service.delete.mockResolvedValue(result);

      await controller.delete(req, res, next);

      expect(service.delete).toHaveBeenCalledWith(body, jwt, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { reply_id: 'RP1', supplement_id: 'RS1', reaction_id: 'RR1' };
      const req = makeReq(body, { sub: 'u1', user_id: 'u1', role: 'user' });
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('delete failed');

      req.io = io;
      service.delete.mockRejectedValue(err);

      await controller.delete(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
