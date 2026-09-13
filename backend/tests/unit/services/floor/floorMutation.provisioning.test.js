const mockFindActiveUser = jest.fn();
const mockFindActiveFloor = jest.fn();
const mockIsAdminOrCreator = jest.fn();
const mockProvisionFloorResources = jest.fn();
const mockRefreshFloorResourceTranslations = jest.fn();
const mockRollbackFloorProvisioning = jest.fn();
const mockIsGoogleTranslateEnabled = jest.fn(() => true);

jest.mock('../../../../models/Floor', () => ({
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../../../../services/translation.service', () => ({
  translateTitleAndDescription: jest.fn(),
}));
jest.mock('../../../../services/_shared/activeResource', () => ({
  findActiveUser: mockFindActiveUser,
  findActiveFloor: mockFindActiveFloor,
}));
jest.mock('../../../../services/_shared/floorAccess', () => ({
  isAdminOrCreator: mockIsAdminOrCreator,
}));
jest.mock('../../../../services/floor/floorProvisioning.service', () => ({
  provisionFloorResources: mockProvisionFloorResources,
  refreshFloorResourceTranslations: mockRefreshFloorResourceTranslations,
  rollbackFloorProvisioning: mockRollbackFloorProvisioning,
  targetLanguagesChanged: jest.fn(),
}));
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));

const Floor = require('../../../../models/Floor');
const translationService = require('../../../../services/translation.service');
const floorMutationService = require('../../../../services/floor/floorMutation.service');

describe('フロア作成失敗時の後処理', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockFindActiveUser.mockResolvedValue({ _id: 'user-1', username: 'owner' });
    mockIsAdminOrCreator.mockReturnValue(true);
    translationService.translateTitleAndDescription.mockResolvedValue([]);
    mockRollbackFloorProvisioning.mockResolvedValue();
  });

  test('付随リソース作成に失敗した場合は作成済みフロアを補償削除する', async () => {
    const provisioningError = new Error('provisioning failed');
    const createdFloor = {
      _id: 'floor-1',
      populate: jest.fn().mockResolvedValue({ _id: 'floor-1' }),
    };
    Floor.create.mockResolvedValue(createdFloor);
    mockProvisionFloorResources.mockRejectedValue(provisioningError);

    await expect(
      floorMutationService.create(
        {
          title: 'Floor',
          description: 'Description',
          floor_display_hidden: false,
          lang: 'ja',
          target_langs: ['en'],
        },
        { user_id: 'user-1', user_role: 'Administrator' }
      )
    ).rejects.toBe(provisioningError);

    expect(mockRollbackFloorProvisioning).toHaveBeenCalledWith({ floorId: 'floor-1' });
  });

  test('有効ユーザ検証に失敗した場合はフロアを作成しない', async () => {
    const inactiveUserError = new Error('inactive user');
    mockFindActiveUser.mockRejectedValueOnce(inactiveUserError);

    await expect(
      floorMutationService.create(
        {
          title: 'Floor',
          description: 'Description',
          floor_display_hidden: false,
          lang: 'ja',
          target_langs: ['en'],
        },
        { user_id: 'user-1', user_role: 'Administrator' }
      )
    ).rejects.toBe(inactiveUserError);

    expect(mockFindActiveUser).toHaveBeenCalledWith('user-1', {
      error: { code: 'INVALID_PERMISSION' },
    });
    expect(translationService.translateTitleAndDescription).not.toHaveBeenCalled();
    expect(Floor.create).not.toHaveBeenCalled();
    expect(mockProvisionFloorResources).not.toHaveBeenCalled();
  });

  test('Google翻訳無効時の新規フロアはtarget_langsと翻訳を空で保存する', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);
    const createdFloor = {
      _id: 'floor-1',
      populate: jest.fn().mockResolvedValue({ _id: 'floor-1' }),
    };
    Floor.create.mockResolvedValue(createdFloor);
    mockProvisionFloorResources.mockResolvedValue();

    await floorMutationService.create(
      {
        title: 'Floor',
        description: 'Description',
        floor_display_hidden: false,
        lang: 'ja',
        target_langs: ['en'],
      },
      { user_id: 'user-1', user_role: 'Administrator' }
    );

    expect(translationService.translateTitleAndDescription).not.toHaveBeenCalled();
    expect(Floor.create).toHaveBeenCalledWith(
      expect.objectContaining({ target_langs: [], translations: [] })
    );
    expect(mockProvisionFloorResources).toHaveBeenCalledWith({
      floorId: 'floor-1',
      userId: 'user-1',
      targetLangs: [],
    });
  });

  test('Google翻訳無効時のフロア更新はtarget_langsと保存済み翻訳を変更しない', async () => {
    mockIsGoogleTranslateEnabled.mockReturnValue(false);
    mockFindActiveFloor.mockResolvedValue({
      _id: 'floor-1',
      user: { toString: () => 'user-1' },
      title: 'Old',
      description: 'Old description',
      lang: 'ja',
      target_langs: ['en'],
      translations: [{ lang: 'en', title: 'Old EN' }],
      image_name: null,
    });
    Floor.findByIdAndUpdate.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ _id: 'floor-1', image_name: null }),
    });

    await floorMutationService.update(
      {
        _id: 'floor-1',
        title: 'New',
        description: 'New description',
        lang: 'ja',
        target_langs: [],
        image_name: null,
        floor_display_hidden: false,
      },
      { user_id: 'user-1', user_role: 'Editor' }
    );

    const update = Floor.findByIdAndUpdate.mock.calls[0][1];
    expect(update.target_langs).toEqual(['en']);
    expect(update).not.toHaveProperty('translations');
    expect(translationService.translateTitleAndDescription).not.toHaveBeenCalled();
    expect(mockRefreshFloorResourceTranslations).not.toHaveBeenCalled();
  });
});
