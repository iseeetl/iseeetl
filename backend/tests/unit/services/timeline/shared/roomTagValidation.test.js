jest.mock('../../../../../models/RoomTag', () => ({ countDocuments: jest.fn() }));

const RoomTag = require('../../../../../models/RoomTag');
const AppError = require('../../../../../utils/appError');
const { validateRoomTagsForRoom } = require('../../../../../services/timeline/shared/roomTagValidation');

describe('roomTagValidationの検証', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('空配列はDB照合せず許可する', async () => {
    await expect(validateRoomTagsForRoom([], { floorId: 'floor1', roomId: 'room1' })).resolves.toEqual([]);
    expect(RoomTag.countDocuments).not.toHaveBeenCalled();
  });

  test('対象フロア・ルームに属する有効なタグだけなら許可する', async () => {
    RoomTag.countDocuments.mockResolvedValue(2);
    const tags = ['tag1', 'tag2'];

    await expect(validateRoomTagsForRoom(tags, { floorId: 'floor1', roomId: 'room1' })).resolves.toBe(tags);

    expect(RoomTag.countDocuments).toHaveBeenCalledWith({
      _id: { $in: ['tag1', 'tag2'] },
      floor: 'floor1',
      room: 'room1',
      delete_flg: false,
    });
  });

  test('重複IDは一意化して存在件数を照合し、入力配列は維持する', async () => {
    RoomTag.countDocuments.mockResolvedValue(1);
    const tags = ['tag1', 'tag1'];

    await expect(validateRoomTagsForRoom(tags, { floorId: 'floor1', roomId: 'room1' })).resolves.toBe(tags);
    expect(RoomTag.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: ['tag1'] } })
    );
  });

  test('別ルーム・削除済み・不存在タグを含み件数が一致しなければ拒否する', async () => {
    RoomTag.countDocuments.mockResolvedValue(1);

    await expect(
      validateRoomTagsForRoom(['tag1', 'invalid-scope-tag'], { floorId: 'floor1', roomId: 'room1' })
    ).rejects.toBeInstanceOf(AppError);
  });

  test('配列またはRoom/Floorコンテキストが不正なら拒否する', async () => {
    await expect(validateRoomTagsForRoom(null, { floorId: 'floor1', roomId: 'room1' })).rejects.toBeInstanceOf(
      AppError
    );
    await expect(validateRoomTagsForRoom([], { floorId: null, roomId: 'room1' })).rejects.toBeInstanceOf(AppError);
  });
});
