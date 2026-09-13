jest.mock('../../../../services/analysis/settings/setting.service', () => ({
  getDefaultResultUser: jest.fn(),
  getScopedDefaultResultUser: jest.fn(),
  listCommon: jest.fn(),
  paginateCommon: jest.fn(),
  createCommon: jest.fn(),
  updateCommon: jest.fn(),
  deleteCommon: jest.fn(),
  listScoped: jest.fn(),
  createFloor: jest.fn(),
  createRoom: jest.fn(),
  updateScoped: jest.fn(),
  deleteScoped: jest.fn(),
  searchScopedResultUsers: jest.fn(),
}));

const settingService = require('../../../../services/analysis/settings/setting.service');
const controller = require('../../../../controllers/analysis/aiAnalysisSetting.controller');

const makeResponse = () => ({
  headersSent: false,
  writableEnded: false,
  json: jest.fn(),
});

describe('AI解析設定コントローラ', () => {
  const body = { _id: 'setting-1', floor_id: 'floor-1', room_id: 'room-1' };
  const jwtPayload = { user_id: 'user-1', user_role: 'Administrator' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ['getDefaultResultUser', 'getDefaultResultUser', [jwtPayload]],
    ['getFloorDefaultResultUser', 'getScopedDefaultResultUser', ['floor', body, jwtPayload]],
    ['getRoomDefaultResultUser', 'getScopedDefaultResultUser', ['room', body, jwtPayload]],
    ['listCommon', 'listCommon', [jwtPayload]],
    ['paginateCommon', 'paginateCommon', [body, jwtPayload]],
    ['createCommon', 'createCommon', [body, jwtPayload]],
    ['updateCommon', 'updateCommon', [body, jwtPayload]],
    ['deleteCommon', 'deleteCommon', [body, jwtPayload]],
    ['listFloor', 'listScoped', ['floor', body, jwtPayload]],
    ['createFloor', 'createFloor', [body, jwtPayload]],
    ['updateFloor', 'updateScoped', ['floor', body, jwtPayload]],
    ['deleteFloor', 'deleteScoped', ['floor', body, jwtPayload]],
    ['searchFloorResultUsers', 'searchScopedResultUsers', ['floor', body, jwtPayload]],
    ['listRoom', 'listScoped', ['room', body, jwtPayload]],
    ['createRoom', 'createRoom', [body, jwtPayload]],
    ['updateRoom', 'updateScoped', ['room', body, jwtPayload]],
    ['deleteRoom', 'deleteScoped', ['room', body, jwtPayload]],
    ['searchRoomResultUsers', 'searchScopedResultUsers', ['room', body, jwtPayload]],
  ])('%s は対応サービスへリクエスト値を渡してJSONを返す', async (controllerName, serviceName, expectedArgs) => {
    const result = { action: controllerName };
    settingService[serviceName].mockResolvedValue(result);
    const req = { body, jwtPayload };
    const res = makeResponse();
    const next = jest.fn();

    await controller[controllerName](req, res, next);

    expect(settingService[serviceName]).toHaveBeenCalledWith(...expectedArgs);
    expect(res.json).toHaveBeenCalledWith(result);
    expect(next).not.toHaveBeenCalled();
  });

  test('サービス例外をnextへ渡す', async () => {
    const error = new Error('setting service failed');
    settingService.createCommon.mockRejectedValue(error);
    const res = makeResponse();
    const next = jest.fn();

    await controller.createCommon({ body, jwtPayload }, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});
