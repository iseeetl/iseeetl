jest.mock('../../../../services/timeline/pushFilter.service', () => ({
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
}));

const pushFilterService = require('../../../../services/timeline/pushFilter.service');
const controller = require('../../../../controllers/timeline/pushFilter.controller.js');

describe('通知条件のコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { sub: 'user1', user_id: 'user1', role: 'user' }) => ({
    body,
    jwtPayload,
    params: {},
  });
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
    test('body と jwt を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { name: 'filter-1', conditions: [] };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'PF1', ...body };

      pushFilterService.create.mockResolvedValue(result);

      await controller.create(req, res, next);

      expect(pushFilterService.create).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { name: 'x', conditions: [] };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('create failed');

      pushFilterService.create.mockRejectedValue(err);

      await controller.create(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('更新', () => {
    test('id, conditions, jwt を渡してサービスを呼び、結果を json で返す', async () => {
      const body = { conditions: [{ k: 'room_id', op: 'in', v: ['R1'] }] };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      req.params = { id: 'PF1' };
      const res = makeRes();
      const next = makeNext();
      const result = { _id: 'PF1', ...body };

      pushFilterService.update.mockResolvedValue(result);

      await controller.update(req, res, next);

      expect(pushFilterService.update).toHaveBeenCalledWith('PF1', body.conditions, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { conditions: [] };
      const req = makeReq(body);
      req.params = { id: 'PF1' };
      const res = makeRes();
      const next = makeNext();
      const err = new Error('update failed');

      pushFilterService.update.mockRejectedValue(err);

      await controller.update(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('削除', () => {
    test('id と jwt を渡してサービスを呼び、{ ok: true } を返す', async () => {
      const req = makeReq({}, { sub: 'u1', user_id: 'u1', role: 'user' });
      req.params = { id: 'PF1' };
      const res = makeRes();
      const next = makeNext();

      pushFilterService.remove.mockResolvedValue(undefined);

      await controller.remove(req, res, next);

      expect(pushFilterService.remove).toHaveBeenCalledWith('PF1', req.jwtPayload);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq({});
      req.params = { id: 'PF1' };
      const res = makeRes();
      const next = makeNext();
      const err = new Error('remove failed');

      pushFilterService.remove.mockRejectedValue(err);

      await controller.remove(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
