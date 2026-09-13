jest.mock('../../../models/SoundTag', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../../../models/RoomTag', () => ({ countDocuments: jest.fn() }));
jest.mock('../../../services/room/roomAccess.service', () => ({ authorizeRoomAccess: jest.fn() }));

const soundTagService = require('../../../services/soundTag.service');
const SoundTag = require('../../../models/SoundTag');
const RoomTag = require('../../../models/RoomTag');
const { authorizeRoomAccess } = require('../../../services/room/roomAccess.service');
const AppError = require('../../../utils/appError');

describe('soundTagのサービス', () => {
  const jwtPayload = { user_id: 'u1', user_role: 'Author' };
  const context = {
    foundUser: { _id: 'u1' },
    foundRoom: { _id: 'r1', floor: 'f1' },
    foundFloor: { _id: 'f1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authorizeRoomAccess.mockResolvedValue(context);
    RoomTag.countDocuments.mockResolvedValue(2);
  });

  describe('音タグ取得', () => {
    const body = { floor_id: 'f1', room_id: 'r1' };

    test('有効なルームアクセスを確認して本人の設定を取得する', async () => {
      const fakeTag = { _id: 'st1' };
      SoundTag.findOne.mockResolvedValue(fakeTag);

      const result = await soundTagService.getSoundTag(body, jwtPayload);

      expect(authorizeRoomAccess).toHaveBeenCalledWith('u1', 'Author', 'r1');
      expect(SoundTag.findOne).toHaveBeenCalledWith({
        floor: 'f1',
        room: 'r1',
        user: 'u1',
      });
      expect(result).toBe(fakeTag);
    });

    test('指定フロアとルームの所属フロアが一致しない場合は取得しない', async () => {
      await expect(soundTagService.getSoundTag({ ...body, floor_id: 'other' }, jwtPayload)).rejects.toMatchObject({
        status: 400,
      });

      expect(SoundTag.findOne).not.toHaveBeenCalled();
    });
  });

  describe('音タグ作成', () => {
    const body = { floor_id: 'f1', room_id: 'r1', tags: ['t1', 't1', 't2'] };

    test('有効なルームタグだけに正規化し、フロア・ルーム・ユーザ単位でupsertする', async () => {
      const saved = { _id: 'st1', tags: ['t1', 't2'] };
      SoundTag.findOneAndUpdate.mockResolvedValue(saved);

      const result = await soundTagService.createSoundTag(body, jwtPayload);

      expect(RoomTag.countDocuments).toHaveBeenCalledWith({
        _id: { $in: ['t1', 't2'] },
        floor: 'f1',
        room: 'r1',
        delete_flg: false,
      });
      expect(SoundTag.findOneAndUpdate).toHaveBeenCalledWith(
        { floor: 'f1', room: 'r1', user: 'u1' },
        {
          $set: { tags: ['t1', 't2'], updated_at: expect.any(Number) },
          $setOnInsert: {
            floor: 'f1',
            room: 'r1',
            user: 'u1',
            created_at: expect.any(Number),
          },
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      expect(result).toBe(saved);
    });

    test('他ルームまたは論理削除済みのルームタグを含む場合は保存しない', async () => {
      RoomTag.countDocuments.mockResolvedValue(1);

      await expect(soundTagService.createSoundTag(body, jwtPayload)).rejects.toMatchObject({ status: 400 });

      expect(SoundTag.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('ルームアクセスが拒否された場合は保存しない', async () => {
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'INVALID_PERMISSION' }));

      await expect(soundTagService.createSoundTag(body, jwtPayload)).rejects.toMatchObject({ status: 401 });

      expect(RoomTag.countDocuments).not.toHaveBeenCalled();
      expect(SoundTag.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('音タグ更新', () => {
    const id = 'st99';
    const tags = ['t1', 't2'];

    const buildFindByIdMock = (doc) =>
      SoundTag.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(doc),
      });

    test('保存済みフロア・ルームのアクセスとルームタグを確認して更新する', async () => {
      const found = { _id: id, floor: 'f1', room: 'r1', user: 'u1' };
      const updated = { _id: id, user: 'u1', tags };

      buildFindByIdMock(found);
      SoundTag.findOneAndUpdate.mockResolvedValue(updated);

      const result = await soundTagService.updateSoundTag({ _id: id, tags }, jwtPayload);

      expect(SoundTag.findById).toHaveBeenCalledWith(id);
      expect(authorizeRoomAccess).toHaveBeenCalledWith('u1', 'Author', 'r1');
      expect(SoundTag.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, floor: 'f1', room: 'r1', user: 'u1' },
        { $set: { tags, updated_at: expect.any(Number) } },
        { new: true, runValidators: true }
      );
      expect(result).toBe(updated);
    });

    test('設定が存在しない場合は404', async () => {
      buildFindByIdMock(null);

      await expect(soundTagService.updateSoundTag({ _id: id, tags }, jwtPayload)).rejects.toMatchObject({ status: 404 });
    });

    test('他人の設定は更新しない', async () => {
      buildFindByIdMock({ _id: id, user: 'someoneElse' });

      await expect(soundTagService.updateSoundTag({ _id: id, tags }, jwtPayload)).rejects.toMatchObject({ status: 401 });

      expect(authorizeRoomAccess).not.toHaveBeenCalled();
      expect(SoundTag.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('無効なルームタグを含む場合は更新しない', async () => {
      buildFindByIdMock({ _id: id, floor: 'f1', room: 'r1', user: 'u1' });
      RoomTag.countDocuments.mockResolvedValue(1);

      await expect(soundTagService.updateSoundTag({ _id: id, tags }, jwtPayload)).rejects.toMatchObject({ status: 400 });

      expect(SoundTag.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
