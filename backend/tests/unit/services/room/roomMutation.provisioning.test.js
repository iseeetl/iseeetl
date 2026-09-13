const mockFindActiveUser = jest.fn();
const mockFindActiveFloor = jest.fn();
const mockFindRoomWithFloor = jest.fn();
const mockHasFloorAccess = jest.fn();
const mockProvisionRoomResources = jest.fn();
const mockRollbackRoomProvisioning = jest.fn();
const mockIsGoogleTranslateEnabled = jest.fn(() => true);

jest.mock('../../../../models/FloorMember', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/Room', () => ({
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../../../../services/translation.service', () => ({
  translateTitleAndDescription: jest.fn(),
}));
jest.mock('../../../../services/_shared/activeResource', () => ({
  findActiveUser: mockFindActiveUser,
  findActiveFloor: mockFindActiveFloor,
  findRoomWithFloor: mockFindRoomWithFloor,
}));
jest.mock('../../../../services/_shared/floorAccess', () => ({
  hasFloorAccess: mockHasFloorAccess,
}));
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));
jest.mock('../../../../services/room/roomProvisioning.service', () => ({
  provisionRoomResources: mockProvisionRoomResources,
  rollbackRoomProvisioning: mockRollbackRoomProvisioning,
}));

const FloorMember = require('../../../../models/FloorMember');
const Room = require('../../../../models/Room');
const translationService = require('../../../../services/translation.service');
const roomMutationService = require('../../../../services/room/roomMutation.service');

describe('ルーム作成失敗時の後処理', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockFindActiveUser.mockResolvedValue({ _id: 'user-1', username: 'owner' });
    mockFindActiveFloor.mockResolvedValue({ _id: 'floor-1', user: 'user-1', target_langs: ['en'] });
    mockHasFloorAccess.mockReturnValue(true);
    FloorMember.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    translationService.translateTitleAndDescription.mockResolvedValue([]);
    mockRollbackRoomProvisioning.mockResolvedValue();
  });

  test('付随リソース作成に失敗した場合は作成済みルームを補償削除する', async () => {
    const provisioningError = new Error('provisioning failed');
    const createdRoom = {
      _id: 'room-1',
      populate: jest.fn().mockResolvedValue(),
    };
    Room.create.mockResolvedValue(createdRoom);
    mockProvisionRoomResources.mockRejectedValue(provisioningError);

    await expect(
      roomMutationService.create(
        {
          floor_id: 'floor-1',
          title: 'Room',
          description: 'Description',
          lang: 'ja',
          guest_reaction_only: false,
          member_only: false,
          room_display_hidden: false,
          notification: false,
          external_sns_button: false,
        },
        { user_id: 'user-1', user_role: 'Administrator' }
      )
    ).rejects.toBe(provisioningError);

    expect(mockRollbackRoomProvisioning).toHaveBeenCalledWith({ floorId: 'floor-1', roomId: 'room-1' });
  });

  test('有効ユーザ検証に失敗した場合はルームを作成しない', async () => {
    const inactiveUserError = new Error('inactive user');
    mockFindActiveUser.mockRejectedValueOnce(inactiveUserError);

    await expect(
      roomMutationService.create(
        {
          floor_id: 'floor-1',
          title: 'Room',
          description: 'Description',
          lang: 'ja',
          guest_reaction_only: false,
          member_only: false,
          room_display_hidden: false,
          notification: false,
          external_sns_button: false,
        },
        { user_id: 'user-1', user_role: 'Administrator' }
      )
    ).rejects.toBe(inactiveUserError);

    expect(mockFindActiveUser).toHaveBeenCalledWith('user-1');
    expect(mockFindActiveFloor).not.toHaveBeenCalled();
    expect(Room.create).not.toHaveBeenCalled();
    expect(mockProvisionRoomResources).not.toHaveBeenCalled();
  });

  test('Google翻訳無効時の新規ルームは翻訳を空で保存する', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);
    const createdRoom = {
      _id: 'room-1',
      populate: jest.fn().mockResolvedValue(),
    };
    Room.create.mockResolvedValue(createdRoom);
    mockProvisionRoomResources.mockResolvedValue();

    await roomMutationService.create(
      {
        floor_id: 'floor-1',
        title: 'Room',
        description: 'Description',
        lang: 'ja',
        guest_reaction_only: false,
        member_only: false,
        room_display_hidden: false,
        notification: false,
        external_sns_button: false,
      },
      { user_id: 'user-1', user_role: 'Administrator' }
    );

    expect(translationService.translateTitleAndDescription).not.toHaveBeenCalled();
    expect(Room.create).toHaveBeenCalledWith(expect.objectContaining({ translations: [] }));
  });

  test('Google翻訳無効時のルーム更新は保存済み翻訳を変更しない', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);
    mockFindRoomWithFloor.mockResolvedValue({
      room: {
        _id: 'room-1',
        floor: 'floor-1',
        title: 'Old',
        description: 'Old description',
        lang: 'ja',
        translations: [{ lang: 'en', title: 'Old EN' }],
        image_name: null,
      },
      floor: { _id: 'floor-1', user: 'user-1', target_langs: ['en'] },
    });
    Room.findByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ _id: 'room-1', image_name: null }),
    });

    await roomMutationService.update(
      {
        _id: 'room-1',
        title: 'New',
        description: 'New description',
        lang: 'ja',
        image_name: null,
        guest_reaction_only: false,
        member_only: false,
        room_display_hidden: false,
        notification: false,
        external_sns_button: false,
      },
      { user_id: 'user-1', user_role: 'Administrator' }
    );

    const update = Room.findByIdAndUpdate.mock.calls[0][1];
    expect(update).not.toHaveProperty('translations');
    expect(translationService.translateTitleAndDescription).not.toHaveBeenCalled();
  });
});
