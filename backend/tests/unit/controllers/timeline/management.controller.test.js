jest.mock('../../../../services/timeline/management.service', () => ({
  paginate: jest.fn(),
  timeline: jest.fn(),
  timelineMedia: jest.fn(),
}));

const managementService = require('../../../../services/timeline/management.service');
const controller = require('../../../../controllers/timeline/management.controller.js');

describe('タイムライン管理のコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { sub: 'user1', user_id: 'user1', role: 'user' }) => ({ body, jwtPayload });
  const makeRes = () => {
    const res = {};
    res.json = jest.fn().mockReturnValue(res);
    res.sendStatus = jest.fn().mockReturnValue(res);
    return res;
  };
  const makeNext = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ページ単位の一覧取得', () => {
    test('サービスの結果を json で返す', async () => {
      const body = { page: 1, search: 'search-x' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { total: 2, docs: [{ _id: 'p1' }, { _id: 'p2' }] };

      managementService.paginate.mockResolvedValue(result);

      await controller.paginate(req, res, next);

      expect(managementService.paginate).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { page: 1, search: '' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('paginate failed');

      managementService.paginate.mockRejectedValue(err);

      await controller.paginate(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('タイムライン取得', () => {
    test('サービスの結果を json で返す', async () => {
      const body = { floor_id: 'F001', room_id: 'R001' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const result = { docs: [{ _id: 't1' }] };

      managementService.timeline.mockResolvedValue(result);

      await controller.timeline(req, res, next);

      expect(managementService.timeline).toHaveBeenCalledWith(body);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { floor_id: 'F001', room_id: 'R001' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('timeline failed');

      managementService.timeline.mockRejectedValue(err);

      await controller.timeline(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('タイムラインのメディア取得', () => {
    test('サービスが生成したアーカイブをHTTP応答で返す', async () => {
      const body = { floor_id: 'F001', room_id: 'R001' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const archive = {
        on: jest.fn(),
        pipe: jest.fn(),
        finalize: jest.fn().mockResolvedValue(),
        destroy: jest.fn(),
      };
      res.setHeader = jest.fn();
      res.attachment = jest.fn();
      res.end = jest.fn();
      res.on = jest.fn((event, callback) => {
        if (event === 'finish') callback();
      });

      managementService.timelineMedia.mockResolvedValue({ archive, fileName: 'timeline_media.zip' });

      await controller.timelineMedia(req, res, next);

      expect(managementService.timelineMedia).toHaveBeenCalledWith(body);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
      expect(res.attachment).toHaveBeenCalledWith('timeline_media.zip');
      expect(archive.pipe).toHaveBeenCalledWith(res);
      expect(archive.finalize).toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(res.sendStatus).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { floor_id: 'F001', room_id: 'R001' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('timelineMedia failed');

      managementService.timelineMedia.mockRejectedValue(err);

      await controller.timelineMedia(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
