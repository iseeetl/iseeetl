jest.mock('../../../../../services/timeline/guest/guestPosts.service', () => ({
  createPost: jest.fn(),
  getPostDetail: jest.fn(),
  getPosts: jest.fn(),
}));

const guestPostsService = require('../../../../../services/timeline/guest/guestPosts.service');
const controller = require('../../../../../controllers/timeline/guest/guestPosts.controller.js');

describe('ゲストの投稿のコントローラ', () => {
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

  describe('投稿一覧取得', () => {
    test('サービス結果をjsonで返す', async () => {
      const body = { page: 1, floor_id: 'F001' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { docs: [{ _id: 'p1' }], total: 1 };

      guestPostsService.getPosts.mockResolvedValue(result);

      await controller.getPosts(req, res, next);

      expect(guestPostsService.getPosts).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { page: 1 };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('getPosts failed');

      guestPostsService.getPosts.mockRejectedValue(err);

      await controller.getPosts(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('投稿詳細取得', () => {
    test('サービス結果をjsonで返す', async () => {
      const body = { post_id: 'P1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'P1', content: 'hello' };

      guestPostsService.getPostDetail.mockResolvedValue(result);

      await controller.getPostDetail(req, res, next);

      expect(guestPostsService.getPostDetail).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { post_id: 'P1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('getPostDetail failed');

      guestPostsService.getPostDetail.mockRejectedValue(err);

      await controller.getPostDetail(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('投稿作成', () => {
    test('ioを渡してサービスを呼び、結果をjsonで返す', async () => {
      const body = { floor_id: 'F001', content: 'hi' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { _id: 'PNEW' };

      req.io = io;
      guestPostsService.createPost.mockResolvedValue(result);

      await controller.createPost(req, res, next);

      expect(guestPostsService.createPost).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { floor_id: 'F001', content: 'oops' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const err = new Error('createPost failed');

      req.io = io;
      guestPostsService.createPost.mockRejectedValue(err);

      await controller.createPost(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });

    test('リクエストの io が使われる', async () => {
      const body = { floor_id: 'F001', content: 'latest' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const io = { emit: jest.fn() };
      const result = { _id: 'P2' };

      req.io = io;
      guestPostsService.createPost.mockResolvedValue(result);

      await controller.createPost(req, res, next);

      expect(guestPostsService.createPost).toHaveBeenCalledWith(body, io);
      expect(res.json).toHaveBeenCalledWith(result);
    });
  });
});
