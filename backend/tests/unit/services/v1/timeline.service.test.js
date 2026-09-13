jest.mock('../../../../services/room/roomTag.service', () => ({ list: jest.fn() }));
jest.mock('../../../../services/timeline/posts.service', () => ({ list: jest.fn() }));

const mongoose = require('mongoose');

const AppError = require('../../../../utils/appError');
const roomTagService = require('../../../../services/room/roomTag.service');
const postsService = require('../../../../services/timeline/posts.service');
const timelineService = require('../../../../services/v1/timeline.service');

const V1_ROOM_ACCESS_ERRORS = {
  user: { code: 'TOKEN_INVALID' },
  room: { code: 'NOT_FOUND' },
  floor: { code: 'NOT_FOUND' },
  kicked: { code: 'FORBIDDEN' },
  permission: { code: 'FORBIDDEN' },
};

describe('v1 timelineのサービス', () => {
  const floorId = new mongoose.Types.ObjectId().toString();
  const roomId = new mongoose.Types.ObjectId().toString();
  const legacyByteString = 'abcdefghijkl';
  const legacyConvertedId = Buffer.from(legacyByteString, 'utf8').toString('hex');
  const jwtPayload = { user_id: new mongoose.Types.ObjectId().toString(), user_role: 'developer' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ルームのタイムライン取得', () => {
    test('パスを正本として通常APIサービスへ最小入力だけを渡し、配列応答を維持する', async () => {
      const chats = [{ _id: 'post-1' }];
      postsService.list.mockResolvedValue(chats);

      const result = await timelineService.listRoomTimeline({
        params: { floor_id: floorId, room_id: roomId },
        body: {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-02T00:00:00.000Z',
          server_query: { keyword: '転送しない' },
        },
        jwtPayload,
      });

      expect(postsService.list).toHaveBeenCalledTimes(1);
      expect(postsService.list).toHaveBeenCalledWith(
        { floor_id: floorId, room_id: roomId },
        jwtPayload,
        { errors: V1_ROOM_ACCESS_ERRORS }
      );
      expect(result).toEqual({ result: chats });
    });

    test('同値の旧GET bodyはObjectId正規化後に互換入力として受け付ける', async () => {
      const canonicalFloorId = '507f1f77bcf86cd799439011';
      const canonicalRoomId = '507f191e810c19729de860ea';
      postsService.list.mockResolvedValue([]);

      await timelineService.listRoomTimeline({
        params: {
          floor_id: canonicalFloorId.toUpperCase(),
          room_id: canonicalRoomId.toUpperCase(),
        },
        body: { floor_id: canonicalFloorId, room_id: canonicalRoomId },
        jwtPayload,
      });

      expect(postsService.list).toHaveBeenCalledWith(
        { floor_id: canonicalFloorId, room_id: canonicalRoomId },
        jwtPayload,
        { errors: V1_ROOM_ACCESS_ERRORS }
      );
    });

    test.each([
      [
        'path floor_idが不正',
        { floor_id: 'invalid', room_id: roomId },
        {},
      ],
      [
        'path room_idが不正',
        { floor_id: floorId, room_id: 'invalid' },
        {},
      ],
      [
        'path floor_idが12文字の非16進文字列',
        { floor_id: legacyByteString, room_id: roomId },
        {},
      ],
      [
        'path room_idが12文字の非16進文字列',
        { floor_id: floorId, room_id: legacyByteString },
        {},
      ],
      [
        'body floor_idが不正',
        { floor_id: floorId, room_id: roomId },
        { floor_id: 'invalid' },
      ],
      [
        'body room_idがnull',
        { floor_id: floorId, room_id: roomId },
        { room_id: null },
      ],
      [
        'body floor_idが12文字の非16進文字列',
        { floor_id: legacyConvertedId, room_id: roomId },
        { floor_id: legacyByteString },
      ],
      [
        'body room_idが12文字の非16進文字列',
        { floor_id: floorId, room_id: legacyConvertedId },
        { room_id: legacyByteString },
      ],
      [
        'body floor_idがpathと不一致',
        { floor_id: floorId, room_id: roomId },
        { floor_id: new mongoose.Types.ObjectId().toString() },
      ],
      [
        'body room_idがpathと不一致',
        { floor_id: floorId, room_id: roomId },
        { room_id: new mongoose.Types.ObjectId().toString() },
      ],
    ])('%sなら通常APIサービスを呼ばずINVALID_PARAMSにする', async (_label, params, body) => {
      await expect(
        timelineService.listRoomTimeline({ params, body, jwtPayload })
      ).rejects.toMatchObject({ code: 'INVALID_PARAMS' });

      expect(postsService.list).not.toHaveBeenCalled();
    });

    test('通常APIサービスのエラーをそのまま伝播する', async () => {
      const error = new AppError({ code: 'NOT_FOUND' });
      postsService.list.mockRejectedValue(error);

      await expect(
        timelineService.listRoomTimeline({
          params: { floor_id: floorId, room_id: roomId },
          body: {},
          jwtPayload,
        })
      ).rejects.toBe(error);
    });
  });

  describe('ルームタグ一覧取得', () => {
    test('旧形式の入力からroom_idだけを通常APIサービスへ渡し、v1応答形式を維持する', async () => {
      const tags = [{ _id: 'tag-1', name: 'feature' }];
      roomTagService.list.mockResolvedValue(tags);

      const result = await timelineService.listRoomTags({
        body: { floor_id: floorId, room_id: roomId, ignored: 'legacy-only' },
        jwtPayload,
      });

      expect(roomTagService.list).toHaveBeenCalledTimes(1);
      expect(roomTagService.list).toHaveBeenCalledWith(
        { room_id: roomId },
        {
          jwtPayload,
          errors: V1_ROOM_ACCESS_ERRORS,
        }
      );
      expect(result).toEqual({ result: tags });
    });

    test('開発者以外は通常APIサービスを呼ばず拒否する', async () => {
      await expect(
        timelineService.listRoomTags({
          body: { floor_id: floorId, room_id: roomId },
          jwtPayload: { ...jwtPayload, user_role: 'Author' },
        })
      ).rejects.toBeInstanceOf(AppError);

      expect(roomTagService.list).not.toHaveBeenCalled();
    });

    test.each([
      [{ room_id: roomId }],
      [{ floor_id: floorId }],
      [{ floor_id: 'invalid', room_id: roomId }],
      [{ floor_id: floorId, room_id: 'invalid' }],
      [{ floor_id: legacyByteString, room_id: roomId }],
      [{ floor_id: floorId, room_id: legacyByteString }],
    ])('旧形式の入力が不正なら通常APIサービスを呼ばず拒否する: %p', async (body) => {
      await expect(
        timelineService.listRoomTags({ body, jwtPayload })
      ).rejects.toBeInstanceOf(AppError);

      expect(roomTagService.list).not.toHaveBeenCalled();
    });

    test('通常APIサービスの認可エラーをそのまま伝播する', async () => {
      const error = new AppError({ code: 'INVALID_PERMISSION' });
      roomTagService.list.mockRejectedValue(error);

      await expect(
        timelineService.listRoomTags({
          body: { floor_id: floorId, room_id: roomId },
          jwtPayload,
        })
      ).rejects.toBe(error);
    });
  });
});
