jest.mock('../../../../models/PushFilter', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
  deleteOne: jest.fn(),
}));

jest.mock('../../../../services/room/roomAccess.service', () => ({ authorizeRoomAccess: jest.fn() }));
const mockIsOneSignalEnabled = jest.fn(() => true);
jest.mock('../../../../config/featureFlags', () => ({
  isOneSignalEnabled: mockIsOneSignalEnabled,
}));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const service = require('../../../../services/timeline/pushFilter.service');
const PushFilter = require('../../../../models/PushFilter');
const { authorizeRoomAccess } = require('../../../../services/room/roomAccess.service');
const AppError = require('../../../../utils/appError');

describe('pushFilterのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOneSignalEnabled.mockReturnValue(true);
  });

  test('OneSignal無効時は新規絞り込み条件作成をDB変更前に拒否する', async () => {
    mockIsOneSignalEnabled.mockReturnValue(false);

    await expect(
      service.create({ floor_id: 'f1', room_id: 'r1', conditions: {} }, { user_id: 'u1' })
    ).rejects.toMatchObject({
      message: {
        code: 'EXTERNAL_FEATURE_DISABLED',
        details: { feature: 'oneSignalPush' },
      },
    });
    expect(authorizeRoomAccess).not.toHaveBeenCalled();
    expect(PushFilter.findOne).not.toHaveBeenCalled();
    expect(PushFilter.findById).not.toHaveBeenCalled();
    expect(PushFilter.findOneAndUpdate).not.toHaveBeenCalled();
    expect(PushFilter.create).not.toHaveBeenCalled();
    expect(PushFilter.deleteOne).not.toHaveBeenCalled();
  });

  describe('作成', () => {
    const body = {
      floor_id: 'floor1',
      room_id: 'room1',
      conditions: { keyword: 'hello' },
    };
    const jwt = { user_id: 'uid1', user_role: 'User' };

    test('新規作成', async () => {
      PushFilter.findOne.mockResolvedValue(null);
      PushFilter.create.mockResolvedValue({ _id: 'pf1' });
      authorizeRoomAccess.mockResolvedValue({});

      await expect(service.create(body, jwt)).resolves.toEqual({ _id: 'pf1' });

      expect(PushFilter.findOne).toHaveBeenCalledWith({
        user: 'uid1',
        room: 'room1',
        conditions: body.conditions,
      });
      expect(PushFilter.create).toHaveBeenCalledWith({
        user: 'uid1',
        floor: 'floor1',
        room: 'room1',
        conditions: body.conditions,
      });
    });

    test('二重登録（CONFLICT）', async () => {
      PushFilter.findOne.mockResolvedValue({ _id: 'exists' });
      authorizeRoomAccess.mockResolvedValue({});

      await expect(service.create(body, jwt)).rejects.toBeInstanceOf(AppError);
    });

    test('ルームアクセス拒否', async () => {
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'FORBIDDEN' }));

      await expect(service.create(body, jwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('更新', () => {
    const id = 'pf1';
    const conditions = { keyword: 'world' };
    const jwt = { user_id: 'owner', user_role: 'User' };

    test('所有者が更新', async () => {
      PushFilter.findById.mockResolvedValue({ _id: id, user: 'owner', room: 'roomX' });
      authorizeRoomAccess.mockResolvedValue({});

      await expect(service.update(id, conditions, jwt)).resolves.toEqual({ _id: id });

      expect(PushFilter.findOneAndUpdate).toHaveBeenCalledWith({ _id: id }, { $set: { conditions } }, { new: false });
    });

    test('ドキュメント無し (404)', async () => {
      PushFilter.findById.mockResolvedValue(null);

      await expect(service.update(id, conditions, jwt)).rejects.toBeInstanceOf(AppError);
    });

    test('所有者以外は 401', async () => {
      PushFilter.findById.mockResolvedValue({ _id: id, user: 'someoneElse', room: 'roomX' });

      await expect(service.update(id, conditions, jwt)).rejects.toBeInstanceOf(AppError);
    });

    test('ルームアクセス拒否', async () => {
      PushFilter.findById.mockResolvedValue({ _id: id, user: 'owner', room: 'roomX' });
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'FORBIDDEN' }));

      await expect(service.update(id, conditions, jwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('削除', () => {
    const id = 'pf1';
    const jwt = { user_id: 'owner', user_role: 'User' };

    test('所有者が削除', async () => {
      PushFilter.findOne.mockResolvedValue({ _id: id, user: 'owner', room: 'roomX' });

      await expect(service.remove(id, jwt)).resolves.toBeUndefined();

      expect(authorizeRoomAccess).not.toHaveBeenCalled();
      expect(PushFilter.deleteOne).toHaveBeenCalledWith({ _id: id, user: 'owner' });
    });

    test('ドキュメント無し', async () => {
      PushFilter.findOne.mockResolvedValue(null);

      await expect(service.remove(id, jwt)).rejects.toBeInstanceOf(AppError);
    });

    test('所有者以外は 401', async () => {
      PushFilter.findOne.mockResolvedValue({ _id: id, user: 'other', room: 'roomX' });

      expect(PushFilter.deleteOne).not.toHaveBeenCalled();
      await expect(service.remove(id, jwt)).rejects.toBeInstanceOf(AppError);
    });

    test('ルームアクセス権を失った所有者も削除できる', async () => {
      PushFilter.findOne.mockResolvedValue({ _id: id, user: 'owner', room: 'roomX' });
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'FORBIDDEN' }));
      PushFilter.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await expect(service.remove(id, jwt)).resolves.toBeUndefined();
      expect(authorizeRoomAccess).not.toHaveBeenCalled();
      expect(PushFilter.deleteOne).toHaveBeenCalledWith({ _id: id, user: 'owner' });
    });
  });
});
