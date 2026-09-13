jest.mock('../../../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../../services/_shared/activeResource', () => ({
  findActiveRoom: jest.fn(),
  findActiveFloor: jest.fn(),
}));

jest.mock(
  '../../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const AppError = require('../../../../../utils/appError');
const { findActiveRoom, findActiveFloor } = require('../../../../../services/_shared/activeResource');
const { ensureGuestRoomContext } = require('../../../../../services/timeline/shared/guestAccess');

const objId = (val) => ({ toString: () => val });

describe('guestAccessの検証', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ルームと所属フロアを返す', async () => {
    const room = { _id: 'r1', floor: objId('f1'), member_only: false };
    const floor = { _id: 'f1' };
    findActiveRoom.mockResolvedValue(room);
    findActiveFloor.mockResolvedValue(floor);

    const res = await ensureGuestRoomContext('r1');

    expect(findActiveRoom).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ error: { code: 'NOT_FOUND' } })
    );
    expect(findActiveFloor).toHaveBeenCalledWith(
      'f1',
      expect.objectContaining({ error: { code: 'NOT_FOUND' } })
    );
    expect(res).toEqual({ room, floor });
  });

  test('ルームが無い場合は 404', async () => {
    findActiveRoom.mockRejectedValue(new AppError({ code: 'NOT_FOUND' }));

    await expect(ensureGuestRoomContext('r1')).rejects.toBeInstanceOf(AppError);
  });

  test('member_only は 403', async () => {
    findActiveRoom.mockResolvedValue({ _id: 'r1', floor: objId('f1'), member_only: true });

    await expect(ensureGuestRoomContext('r1')).rejects.toBeInstanceOf(AppError);
  });

  test('フロアが無い場合は 404', async () => {
    findActiveRoom.mockResolvedValue({ _id: 'r1', floor: objId('f1'), member_only: false });
    findActiveFloor.mockRejectedValue(new AppError({ code: 'NOT_FOUND' }));

    await expect(ensureGuestRoomContext('r1')).rejects.toBeInstanceOf(AppError);
  });

  test('roomDoc 指定時は Room.findOne を呼ばない', async () => {
    const room = { _id: 'r1', floor: objId('f1'), member_only: false };
    const floor = { _id: 'f1' };
    findActiveFloor.mockResolvedValue(floor);

    const res = await ensureGuestRoomContext('r1', { roomDoc: room });

    expect(findActiveRoom).not.toHaveBeenCalled();
    expect(res).toEqual({ room, floor });
  });
});
