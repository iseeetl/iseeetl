jest.mock('../../../../services/timeline/role.service', () => ({
  resolveTimelineRole: jest.fn(),
}));

const roleService = require('../../../../services/timeline/role.service');
const controller = require('../../../../controllers/timeline/role.controller.js');

describe('タイムライン権限のコントローラ', () => {
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

  describe('タイムラインの権限判定', () => {
    test('body と jwt を渡してサービスを呼び、結果を返す', async () => {
      const body = { floor_id: 'F001', room_id: 'R001' };
      const jwt = { sub: 'u1', user_id: 'u1', role: 'user' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { ok: true };

      roleService.resolveTimelineRole.mockResolvedValue(result);

      await controller.resolveTimelineRole(req, res, next);

      expect(roleService.resolveTimelineRole).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { floor_id: 'F001', room_id: 'R001' };
      const req = makeReq(body, { sub: 'u1', user_id: 'u1' });
      const res = makeRes();
      const next = makeNext();
      const err = new Error('resolveTimelineRole failed');

      roleService.resolveTimelineRole.mockRejectedValue(err);

      await controller.resolveTimelineRole(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
