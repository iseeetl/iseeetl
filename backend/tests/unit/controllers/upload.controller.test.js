jest.mock('../../../services/upload.service', () => ({
  uploadProfileImage: jest.fn(),
  uploadFloorImage: jest.fn(),
  uploadRoomImage: jest.fn(),
}));

const uploadService = require('../../../services/upload.service');
const controller = require('../../../controllers/upload.controller.js');

describe('アップロードのコントローラ', () => {
  const makeReq = (body = {}, files = {}, jwtPayload = { user_id: 'u1', user_role: 'member' }) => ({
    body,
    files,
    jwtPayload,
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

  describe('プロフィール画像のアップロード', () => {
    test('body/files/jwtPayload をサービスに渡す', async () => {
      const req = makeReq({ a: 1 }, { image_file: [{ filename: 'x.png', path: '/tmp/x.png' }] });
      const res = makeRes();
      const next = makeNext();
      const result = { image_name: 'x.png' };

      uploadService.uploadProfileImage.mockResolvedValue(result);

      await controller.uploadProfileImage(req, res, next);

      expect(uploadService.uploadProfileImage).toHaveBeenCalledWith(req.files, req.jwtPayload);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq();
      const res = makeRes();
      const next = makeNext();
      const err = new Error('profile upload failed');

      uploadService.uploadProfileImage.mockRejectedValue(err);

      await controller.uploadProfileImage(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('フロア画像のアップロード', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ _id: 'floor1' }, { image_file: [{ filename: 'f.png', path: '/tmp/f.png' }] });
      const res = makeRes();
      const next = makeNext();
      const result = { image_name: 'f.png' };

      uploadService.uploadFloorImage.mockResolvedValue(result);

      await controller.uploadFloorImage(req, res, next);

      expect(uploadService.uploadFloorImage).toHaveBeenCalledWith(req.body, req.files, req.jwtPayload);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq();
      const res = makeRes();
      const next = makeNext();
      const err = new Error('floor upload failed');

      uploadService.uploadFloorImage.mockRejectedValue(err);

      await controller.uploadFloorImage(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('ルーム画像のアップロード', () => {
    test('サービスへ引数を渡して結果を返す', async () => {
      const req = makeReq({ floor_id: 'f1', _id: 'r1' }, { image_file: [{ filename: 'r.png', path: '/tmp/r.png' }] });
      const res = makeRes();
      const next = makeNext();
      const result = { image_name: 'r.png' };

      uploadService.uploadRoomImage.mockResolvedValue(result);

      await controller.uploadRoomImage(req, res, next);

      expect(uploadService.uploadRoomImage).toHaveBeenCalledWith(req.body, req.files, req.jwtPayload);
      expect(res.json).toHaveBeenCalledWith(result);
      expect(next).not.toHaveBeenCalled();
    });

    test('サービスのエラーをnextへ渡す', async () => {
      const req = makeReq();
      const res = makeRes();
      const next = makeNext();
      const err = new Error('room upload failed');

      uploadService.uploadRoomImage.mockRejectedValue(err);

      await controller.uploadRoomImage(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });

});
