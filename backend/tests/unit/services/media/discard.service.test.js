const path = require('path');

const mockUnlink = jest.fn(() => Promise.resolve());
jest.mock('fs', () => ({
  promises: {
    unlink: mockUnlink,
  },
}));


const mockAuthorizeRoomAccess = jest.fn();
jest.mock('../../../../services/room/roomAccess.service', () => ({
  authorizeRoomAccess: mockAuthorizeRoomAccess,
}));

const mockIsMediaFileReferenced = jest.fn();
jest.mock('../../../../services/media/reference', () => ({
  isMediaFileReferenced: mockIsMediaFileReferenced,
  parseMediaFileName: (fileName) => {
    const match = /^(\d+)_([0-9a-fA-F]{24})(_thumbnail)?(\.[a-zA-Z0-9]+)$/.exec(fileName || '');
    if (!match) return null;
    return {
      userId: match[2],
      extension: match[4].toLowerCase(),
    };
  },
}));

const AppError = require('../../../../utils/appError');
const { discardTimelineMedia } = require('../../../../services/media/discard.service');

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439012';
const FLOOR_ID = '507f1f77bcf86cd799439013';
const ROOM_ID = '507f1f77bcf86cd799439014';
const IMAGE = `1700000000000_${USER_ID}.png`;
const THUMBNAIL = `1700000000000_${USER_ID}_thumbnail.png`;

describe('未使用メディアの削除', () => {
  const originalMediaPath = process.env.MEDIA_PATH;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MEDIA_PATH = '/test-fixtures/media-orphan/media';
    mockAuthorizeRoomAccess.mockResolvedValue({
      foundFloor: { _id: FLOOR_ID },
      foundRoom: { _id: ROOM_ID },
    });
    mockIsMediaFileReferenced.mockResolvedValue(false);
    mockUnlink.mockResolvedValue();
  });

  afterAll(() => {
    if (originalMediaPath === undefined) delete process.env.MEDIA_PATH;
    else process.env.MEDIA_PATH = originalMediaPath;
  });

  test('本人がアップロードした未参照ファイルを破棄する', async () => {
    const result = await discardTimelineMedia(
      { floor_id: FLOOR_ID, room_id: ROOM_ID, file_names: [IMAGE, THUMBNAIL] },
      { user_id: USER_ID, user_role: 'Author' }
    );

    expect(mockIsMediaFileReferenced).toHaveBeenCalledWith({ roomId: ROOM_ID, fileName: IMAGE });
    expect(mockUnlink).toHaveBeenCalledWith(
      path.resolve(process.env.MEDIA_PATH, FLOOR_ID, ROOM_ID, IMAGE)
    );
    expect(result.discarded_file_names).toEqual([IMAGE, THUMBNAIL]);
    expect(result.retained_file_names).toEqual([]);
  });

  test('大文字の同値IDをDB由来の小文字正規形として処理する', async () => {
    const result = await discardTimelineMedia(
      {
        floor_id: FLOOR_ID.toUpperCase(),
        room_id: ROOM_ID.toUpperCase(),
        file_names: [IMAGE],
      },
      { user_id: USER_ID.toUpperCase(), user_role: 'Author' }
    );

    expect(mockAuthorizeRoomAccess).toHaveBeenCalledWith(USER_ID, 'Author', ROOM_ID);
    expect(mockIsMediaFileReferenced).toHaveBeenCalledWith({ roomId: ROOM_ID, fileName: IMAGE });
    expect(mockUnlink).toHaveBeenCalledWith(
      path.resolve(process.env.MEDIA_PATH, FLOOR_ID, ROOM_ID, IMAGE)
    );
    expect(result.discarded_file_names).toEqual([IMAGE]);
  });

  test('有効なDB参照があるファイルは保持する', async () => {
    mockIsMediaFileReferenced.mockResolvedValue(true);

    const result = await discardTimelineMedia(
      { floor_id: FLOOR_ID, room_id: ROOM_ID, file_names: [IMAGE] },
      { user_id: USER_ID, user_role: 'Author' }
    );

    expect(mockUnlink).not.toHaveBeenCalled();
    expect(result.retained_file_names).toEqual([IMAGE]);
  });

  test('他ユーザの内部保存名は拒否する', async () => {
    const otherImage = `1700000000000_${OTHER_USER_ID}.png`;

    await expect(
      discardTimelineMedia(
        { floor_id: FLOOR_ID, room_id: ROOM_ID, file_names: [otherImage] },
        { user_id: USER_ID, user_role: 'Author' }
      )
    ).rejects.toEqual(expect.any(AppError));
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  test('参照確認に失敗した場合はファイルを保持してエラーを返す', async () => {
    mockIsMediaFileReferenced.mockRejectedValue(new Error('db failed'));

    await expect(
      discardTimelineMedia(
        { floor_id: FLOOR_ID, room_id: ROOM_ID, file_names: [IMAGE] },
        { user_id: USER_ID, user_role: 'Author' }
      )
    ).rejects.toThrow('db failed');
    expect(mockUnlink).not.toHaveBeenCalled();
  });
});
