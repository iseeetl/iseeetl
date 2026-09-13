jest.mock('../../../../models/User', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/FloorMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/RoomMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../../services/_shared/activeResource', () => ({
  findActiveUser: jest.fn(),
  findActiveFloor: jest.fn(),
  findActiveRoom: jest.fn(),
}));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const roleService = require('../../../../services/timeline/role.service');
const FloorMember = require('../../../../models/FloorMember');
const RoomMember = require('../../../../models/RoomMember');
const AppError = require('../../../../utils/appError');
const { findActiveUser, findActiveFloor, findActiveRoom } = require('../../../../services/_shared/activeResource');

describe('タイムラインの権限判定', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseBody = { floor_id: 'f1', room_id: 'r1' };
  const baseJwt = { user_role: 'User', user_id: 'uid' };

  const setBaseMocks = ({
    user = { _id: 'uid' },
    floor = { _id: 'f1', user: 'owner', delete_flg: false },
    room = { _id: 'r1', floor: 'f1', delete_flg: false },
    floorMember = null,
    roomMember = null,
  } = {}) => {
    findActiveUser.mockResolvedValue(user);
    findActiveFloor.mockResolvedValue(floor);
    findActiveRoom.mockResolvedValue(room);
    FloorMember.findOne.mockResolvedValue(floorMember);
    RoomMember.findOne.mockResolvedValue(roomMember);
  };

  test('管理者にはAdministratorを返す', async () => {
    setBaseMocks();
    const jwt = { ...baseJwt, user_role: 'Administrator' };

    const res = await roleService.resolveTimelineRole(baseBody, jwt);

    expect(res).toEqual({ role: 'Administrator' });
  });

  test('フロアを作成した編集ユーザにはFloorEditorを返す', async () => {
    setBaseMocks({ floor: { _id: 'f1', user: 'uid', delete_flg: false } });
    const jwt = { ...baseJwt, user_role: 'Editor' };

    const res = await roleService.resolveTimelineRole(baseBody, jwt);

    expect(res).toEqual({ role: 'FloorEditor' });
  });

  test('フロアメンバーにはFloorMemberを返す', async () => {
    setBaseMocks({ floorMember: { _id: 'fm1' } });
    const jwt = { ...baseJwt, user_role: 'User' };

    const res = await roleService.resolveTimelineRole(baseBody, jwt);

    expect(res).toEqual({ role: 'FloorMember' });
  });

  test('ルームメンバーにはRoomMemberを返す', async () => {
    setBaseMocks({ roomMember: { _id: 'rm1' } });
    const jwt = { ...baseJwt, user_role: 'User' };

    const res = await roleService.resolveTimelineRole(baseBody, jwt);

    expect(res).toEqual({ role: 'RoomMember' });
  });

  test('所属がない一般ユーザにはAuthorを返す', async () => {
    setBaseMocks();
    const jwt = { ...baseJwt, user_role: 'User' };

    const res = await roleService.resolveTimelineRole(baseBody, jwt);

    expect(res).toEqual({ role: 'Author' });
  });

  test('ユーザが存在しない場合は AppError', async () => {
    findActiveUser.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
    const jwt = { ...baseJwt, user_role: 'User' };

    await expect(roleService.resolveTimelineRole(baseBody, jwt)).rejects.toBeInstanceOf(AppError);
  });

  test('フロアが存在しない場合は AppError', async () => {
    findActiveFloor.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
    const jwt = { ...baseJwt, user_role: 'User' };

    await expect(roleService.resolveTimelineRole(baseBody, jwt)).rejects.toBeInstanceOf(AppError);
  });

  test('ルームが存在しない場合は AppError', async () => {
    findActiveRoom.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
    const jwt = { ...baseJwt, user_role: 'User' };

    await expect(roleService.resolveTimelineRole(baseBody, jwt)).rejects.toBeInstanceOf(AppError);
  });

  test('ルームとフロアの整合性が取れない場合は AppError', async () => {
    setBaseMocks({ room: { _id: 'r1', floor: 'otherFloor', delete_flg: false } });
    const jwt = { ...baseJwt, user_role: 'User' };

    await expect(roleService.resolveTimelineRole(baseBody, jwt)).rejects.toBeInstanceOf(AppError);
  });
});
