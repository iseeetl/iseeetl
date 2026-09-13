jest.mock('../../../services/soundTag.service', () => ({
  getSoundTag: jest.fn(),
  createSoundTag: jest.fn(),
  updateSoundTag: jest.fn(),
}));

const soundTagService = require('../../../services/soundTag.service');
const controller = require('../../../controllers/soundTag.controller.js');

describe('音タグのコントローラ', () => {
  const makeReq = (body = {}, jwtPayload = { user_id: 'user1' }) => ({ body, jwtPayload });
  const makeRes = () => {
    const res = {};
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };
  const makeNext = () => jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('音タグ取得', () => {
    test('body と jwtPayload を渡す', async () => {
      const body = { floor_id: 'F1' };
      const jwt = { user_id: 'U1' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { tag: 'bell' };

      soundTagService.getSoundTag.mockResolvedValue(result);

      await controller.getSoundTag(req, res, next);

      expect(soundTagService.getSoundTag).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { floor_id: 'F1' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('getSoundTag failed');

      soundTagService.getSoundTag.mockRejectedValue(err);

      await controller.getSoundTag(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('音タグ作成', () => {
    test('body と jwtPayload を渡す', async () => {
      const body = { floor_id: 'F1', tag: 'ping' };
      const jwt = { user_id: 'U9' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { created: true };

      soundTagService.createSoundTag.mockResolvedValue(result);

      await controller.createSoundTag(req, res, next);

      expect(soundTagService.createSoundTag).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { floor_id: 'F1', tag: 'ping' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('createSoundTag failed');

      soundTagService.createSoundTag.mockRejectedValue(err);

      await controller.createSoundTag(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('音タグ更新', () => {
    test('body と jwtPayload を渡す', async () => {
      const body = { floor_id: 'F1', tag: 'beep' };
      const jwt = { user_id: 'U2' };
      const req = makeReq(body, jwt);
      const res = makeRes();
      const next = makeNext();
      const result = { updated: true };

      soundTagService.updateSoundTag.mockResolvedValue(result);

      await controller.updateSoundTag(req, res, next);

      expect(soundTagService.updateSoundTag).toHaveBeenCalledWith(body, jwt);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const body = { floor_id: 'F1', tag: 'beep' };
      const req = makeReq(body);
      const res = makeRes();
      const next = makeNext();
      const err = new Error('updateSoundTag failed');

      soundTagService.updateSoundTag.mockRejectedValue(err);

      await controller.updateSoundTag(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
