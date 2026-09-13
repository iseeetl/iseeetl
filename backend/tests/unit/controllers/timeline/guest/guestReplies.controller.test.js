jest.mock('../../../../../services/timeline/guest/guestReplies.service', () => ({
  createReply: jest.fn(),
}));

const guestRepliesService = require('../../../../../services/timeline/guest/guestReplies.service');
const controller = require('../../../../../controllers/timeline/guest/guestReplies.controller.js');

describe('ゲストの返信のコントローラ', () => {
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

  describe('返信作成', () => {
    test('io を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { post_id: 'P1', content: 'reply!' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { _id: 'REP1', content: 'reply!' };

      req.io = io;
      guestRepliesService.createReply.mockResolvedValue(result);

      await controller.createReply(req, res, next);

      expect(guestRepliesService.createReply).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { post_id: 'P1', content: 'reply!' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('createReply failed');

      req.io = io;
      guestRepliesService.createReply.mockRejectedValue(err);

      await controller.createReply(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('リクエストのSocket.IO', () => {
    test('リクエストの io が使われる', async () => {
      const body = { post_id: 'P1', content: 'latest reply' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { _id: 'REP2' };

      req.io = io;
      guestRepliesService.createReply.mockResolvedValue(result);

      await controller.createReply(req, res, next);

      expect(guestRepliesService.createReply).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });
  });
});
