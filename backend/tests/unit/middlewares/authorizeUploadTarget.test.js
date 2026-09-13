const mockAuthorizeRoomAccess = jest.fn();

jest.mock('../../../models/FloorMember', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../../services/_shared/activeResource', () => ({
  findActiveFloor: jest.fn(),
  findRoomWithFloor: jest.fn(),
}));
jest.mock('../../../services/_shared/floorAccess', () => ({
  hasFloorAccess: jest.fn(),
  isAdminOrCreator: jest.fn(),
}));
jest.mock('../../../services/room/roomAccess.service', () => ({
  authorizeRoomAccess: mockAuthorizeRoomAccess,
}));

const AppError = require('../../../utils/appError');
const FloorMember = require('../../../models/FloorMember');
const { findActiveFloor, findRoomWithFloor } = require('../../../services/_shared/activeResource');
const { hasFloorAccess, isAdminOrCreator } = require('../../../services/_shared/floorAccess');
const {
  authorizeFloorImageUpload,
  authorizeRoomImageUpload,
  authorizeV1TimelineUpload,
  requireMatchingUploadBody,
} = require('../../../middlewares/authorizeUploadTarget');

describe('通常アップロードのID正規化', () => {
  const userId = '507f1f77bcf86cd799439011';
  const floorId = '507f1f77bcf86cd799439012';
  const roomId = '507f1f77bcf86cd799439013';
  const jwtPayload = { user_id: userId, user_role: 'Editor' };

  beforeEach(() => {
    jest.clearAllMocks();
    findActiveFloor.mockResolvedValue({ _id: floorId, user: userId });
    findRoomWithFloor.mockResolvedValue({
      room: { _id: roomId },
      floor: { _id: floorId, user: userId },
    });
    isAdminOrCreator.mockReturnValue(true);
    hasFloorAccess.mockReturnValue(true);
    FloorMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    mockAuthorizeRoomAccess.mockResolvedValue({
      foundRoom: { _id: roomId },
      foundFloor: { _id: floorId },
    });
  });

  test.each([
    ['Floor画像', authorizeFloorImageUpload, { floor_id: floorId.toUpperCase() }],
    ['Room画像', authorizeRoomImageUpload, {
      floor_id: floorId.toUpperCase(),
      room_id: roomId.toUpperCase(),
    }],
  ])('%sは大文字クエリをDB由来IDへ正規化する', async (_label, middleware, query) => {
    const req = { query, jwtPayload };
    const next = jest.fn();

    await middleware(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.uploadTarget).toEqual(expect.objectContaining({
      floorId,
      roomId: query.room_id ? roomId : null,
    }));
  });

  test.each([
    [{ floorId, roomId: null }, { _id: floorId.toUpperCase() }, { _id: floorId }],
    [
      { floorId, roomId },
      { floor_id: floorId.toUpperCase(), _id: roomId.toUpperCase() },
      { floor_id: floorId, _id: roomId },
    ],
  ])('multipartの_idも認可済みDB由来IDへ正規化する', (uploadTarget, body, expected) => {
    const req = { uploadTarget, body };
    const next = jest.fn();

    requireMatchingUploadBody(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual(expected);
  });
});

describe('v1のタイムラインアップロード認可', () => {
  const userId = '507f1f77bcf86cd799439011';
  const floorId = '507f1f77bcf86cd799439012';
  const roomId = '507f1f77bcf86cd799439013';

  const createRequest = (query = { room_id: roomId }) => ({
    query,
    jwtPayload: { user_id: userId, user_role: 'developer' },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthorizeRoomAccess.mockResolvedValue({
      foundUser: { _id: userId },
      foundRoom: { _id: roomId },
      foundFloor: { _id: { toString: () => floorId } },
    });
  });

  test('クエリのルームを認可し、所属フロアからuploadTargetを作る', async () => {
    const req = createRequest();
    const next = jest.fn();

    await authorizeV1TimelineUpload(req, {}, next);

    expect(mockAuthorizeRoomAccess).toHaveBeenCalledWith(userId, 'developer', roomId);
    expect(req.uploadTarget).toEqual(
      expect.objectContaining({
        floorId,
        roomId,
        foundRoom: expect.objectContaining({ _id: roomId }),
        foundFloor: expect.any(Object),
      })
    );
    expect(next).toHaveBeenCalledWith();
  });

  test('クエリのfloor_idは所属フロアと一致する場合だけ受理する', async () => {
    const req = createRequest({ room_id: roomId, floor_id: floorId });
    const next = jest.fn();

    await authorizeV1TimelineUpload(req, {}, next);

    expect(req.uploadTarget).toEqual(expect.objectContaining({ floorId, roomId }));
    expect(next).toHaveBeenCalledWith();
  });

  test('大文字の同値IDをDB由来の正規形へ統一する', async () => {
    const req = createRequest({ room_id: roomId.toUpperCase(), floor_id: floorId.toUpperCase() });
    const next = jest.fn();

    await authorizeV1TimelineUpload(req, {}, next);

    expect(mockAuthorizeRoomAccess).toHaveBeenCalledWith(
      userId,
      'developer',
      roomId.toUpperCase()
    );
    expect(req.uploadTarget).toEqual(expect.objectContaining({ floorId, roomId }));
    expect(next).toHaveBeenCalledWith();
  });

  test('multipart bodyの同値IDも正規化して後続サービスへ渡す', () => {
    const req = {
      body: { floor_id: floorId.toUpperCase(), room_id: roomId.toUpperCase() },
      uploadTarget: { floorId, roomId },
    };
    const next = jest.fn();

    requireMatchingUploadBody(req, {}, next);

    expect(req.body).toEqual({ floor_id: floorId, room_id: roomId });
    expect(next).toHaveBeenCalledWith();
  });

  test.each([
    ['未指定', {}],
    ['24桁16進数でない値', { room_id: 'abcdefghijkl' }],
    ['配列', { room_id: [roomId] }],
  ])('不正なroom_id（%s）はルーム照会前に拒否する', async (_label, query) => {
    const req = createRequest(query);
    const next = jest.fn();

    await authorizeV1TimelineUpload(req, {}, next);

    expect(mockAuthorizeRoomAccess).not.toHaveBeenCalled();
    expect(req.uploadTarget).toBeUndefined();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'INVALID_PARAMS', status: 400 });
  });

  test('クエリのfloor_idが所属フロアと異なる場合は拒否する', async () => {
    const req = createRequest({
      room_id: roomId,
      floor_id: '507f1f77bcf86cd799439099',
    });
    const next = jest.fn();

    await authorizeV1TimelineUpload(req, {}, next);

    expect(req.uploadTarget).toBeUndefined();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'INVALID_PARAMS', status: 400 });
  });

  test('ルーム認可エラーをそのまま後続へ渡す', async () => {
    const error = new AppError({ code: 'INVALID_PERMISSION' });
    mockAuthorizeRoomAccess.mockRejectedValue(error);
    const req = createRequest();
    const next = jest.fn();

    await authorizeV1TimelineUpload(req, {}, next);

    expect(req.uploadTarget).toBeUndefined();
    expect(next).toHaveBeenCalledWith(error);
  });

  test('認可結果から有効なフロアIDを導出できない場合は拒否する', async () => {
    mockAuthorizeRoomAccess.mockResolvedValue({
      foundRoom: { _id: roomId },
      foundFloor: { _id: 'invalid-floor' },
    });
    const req = createRequest();
    const next = jest.fn();

    await authorizeV1TimelineUpload(req, {}, next);

    expect(req.uploadTarget).toBeUndefined();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'INVALID_PARAMS', status: 400 });
  });
});
