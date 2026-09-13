jest.mock('../../../../services/media/reference', () => ({
  validateMediaChanges: jest.fn(),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
  isOneSignalEnabled: jest.fn(() => true),
  getOneSignalConfig: jest.fn(() => ({
    appId: 'test-app',
    externalIdSecret: 'test-onesignal-external-id-secret-32-bytes',
  })),
}));

const { ObjectId } = require('mongodb');

jest.mock('../../../../models/Chat', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../../../../models/User.js', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/PushFilter.js', () => ({ find: jest.fn() }));

jest.mock('../../../../services/room/roomAccess.service', () => ({
  authorizeRoomAccess: jest.fn(),
  filterAuthorizedRoomUserIds: jest.fn(async (userIds) => userIds),
}));
jest.mock('../../../../services/timeline/shared/timelineSerializer', () => jest.fn());
jest.mock('../../../../services/media/fileCleanup', () => ({
  deleteMediaDiff: jest.fn(),
  deleteMediaItem: jest.fn(),
}));
jest.mock('../../../../utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../../../services/spam.service', () => ({
  replaceSpams: jest.fn(async (v) => v),
}));
jest.mock('../../../../services/timeline/timelineTranslation.service', () => ({
  translateReplySupplementIfNeeded: jest.fn().mockResolvedValue(),
}));
jest.mock('../../../../integrations/onesignal/notification.client', () => ({
  dispatchNotification: jest.fn(),
}));
jest.mock('../../../../services/timeline/shared/matchConditions', () => jest.fn());

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const replySuppService = require('../../../../services/timeline/replySupplements.service');
const { validateMediaChanges } = require('../../../../services/media/reference');
const Chat = require('../../../../models/Chat');
const { authorizeRoomAccess } = require('../../../../services/room/roomAccess.service');
const serializeTimeline = require('../../../../services/timeline/shared/timelineSerializer');
const { deleteMediaDiff, deleteMediaItem } = require('../../../../services/media/fileCleanup');
const { translateReplySupplementIfNeeded } = require('../../../../services/timeline/timelineTranslation.service');
const AppError = require('../../../../utils/appError');

describe('replySupplementsのサービス', () => {
  const ORIGINAL_ENV = process.env;
  const MEDIA_PATH = '/tmp/media';

  const floorId = new ObjectId().toString();
  const roomId = new ObjectId().toString();
  const postId = new ObjectId().toString();
  const replyId = new ObjectId().toString();
  const suppId = new ObjectId().toString();

  const baseBody = {
    floor_id: floorId,
    floor_title: 'Floor',
    room_id: roomId,
    room_title: 'Room',
    user_id: 'u1',
    user_name: 'User1',
    post_id: postId,
    reply_id: replyId,
    target_langs: [],
  };

  const foundUser = { _id: 'creator', username: 'Creator' };
  const foundFloor = { _id: floorId, user: 'creator', floor_display_hidden: false, title: 'Floor' };
  const foundRoom = { _id: roomId, room_display_hidden: false, title: 'Room' };

  const ioFactory = () => {
    const roomSocket = { emit: jest.fn() };
    const io = { to: jest.fn(() => roomSocket) };
    return { io, roomSocket };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    process.env = {
      ...ORIGINAL_ENV,
      MEDIA_PATH,
      ONESIGNAL_APP_ID: 'dummy',
      ONESIGNAL_REST_API_KEYS: 'rest-key',
      ONESIGNAL_HOST: 'onesignal.test',
      ONESIGNAL_PORT: '443',
      ONESIGNAL_PATH: '/api/v1/notifications',
      ONESIGNAL_EXTERNAL_ID_SECRET: 'test-onesignal-external-id-secret-32-bytes',
      VUE_APP_APPURL: 'https://example.com',
    };

    authorizeRoomAccess.mockResolvedValue({
      foundUser,
      foundRoom,
      foundFloor,
      foundFloorMember: null,
    });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  describe('返信の付加情報作成', () => {
    const jwt = { user_role: 'User', user_id: 'u1' };

    test('返信に付加情報を追加してSocket通知とログ記録を行う', async () => {
      const updatedChat = {
        _id: postId,
        room: { _id: roomId },
        replies: [
          {
            _id: replyId,
            supplementaries: [{ _id: suppId, content: 'hello', lang: 'ja' }],
            delete_flg: false,
          },
        ],
      };

      Chat.findOne.mockResolvedValue({
        _id: postId,
        room: roomId,
        replies: [{ _id: replyId, user: 'replyAuthor', supplementaries: [], delete_flg: false }],
      });
      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(updatedChat),
      }));
      serializeTimeline.mockReturnValue(updatedChat);

      const { io, roomSocket } = ioFactory();

      const body = {
        ...baseBody,
        content: 'hello',
        lang: 'ja',
        target_langs: ['en'],
      };

      await expect(replySuppService.createReplySupplement(body, jwt, io)).resolves.toEqual(updatedChat);

      expect(validateMediaChanges).toHaveBeenCalledWith(
        expect.objectContaining({ userId: jwt.user_id, newItem: body })
      );
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: postId,
          room: roomId,
          delete_flg: false,
          replies: { $elemMatch: { _id: replyId, delete_flg: false } },
        },
        expect.objectContaining({ $push: expect.any(Object) }),
        expect.objectContaining({ arrayFilters: expect.any(Array), new: true, runValidators: true })
      );

      expect(io.to).toHaveBeenCalledWith(roomId);
      expect(roomSocket.emit).toHaveBeenCalledWith('REPLY_SUPPLEMENT_CREATE', updatedChat, {
        _id: suppId,
        content: 'hello',
        lang: 'ja',
      });

      expect(translateReplySupplementIfNeeded).toHaveBeenCalledWith({
        chatId: postId,
        replyId,
        supplementId: suppId,
        content: 'hello',
        lang: 'ja',
        targetLangs: ['en'],
        userId: 'u1',
        io,
      });
    });

    test('Google翻訳無効時も付加情報を保存し、翻訳処理を起動しない', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      const updatedChat = {
        _id: postId,
        room: { _id: roomId },
        replies: [
          {
            _id: replyId,
            supplementaries: [{ _id: suppId, content: 'hello', lang: 'ja' }],
            delete_flg: false,
          },
        ],
      };
      Chat.findOne.mockResolvedValue({
        _id: postId,
        room: roomId,
        replies: [{ _id: replyId, user: 'replyAuthor', supplementaries: [], delete_flg: false }],
      });
      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(updatedChat),
      }));
      serializeTimeline.mockReturnValue(updatedChat);
      const { io } = ioFactory();

      await expect(
        replySuppService.createReplySupplement(
          { ...baseBody, content: 'hello', lang: 'ja', target_langs: ['en'] },
          jwt,
          io
        )
      ).resolves.toEqual(updatedChat);

      expect(Chat.findOneAndUpdate).toHaveBeenCalled();
      expect(translateReplySupplementIfNeeded).not.toHaveBeenCalled();
    });

    test('投稿が存在しない', async () => {
      Chat.findOne.mockResolvedValue(null);
      const { io } = ioFactory();
      await expect(
        replySuppService.createReplySupplement({ ...baseBody, content: '' }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);
    });

    test('返信が存在しない', async () => {
      Chat.findOne.mockResolvedValue({ _id: postId, room: roomId, replies: [], delete_flg: false });
      const { io } = ioFactory();
      await expect(
        replySuppService.createReplySupplement({ ...baseBody, content: '' }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);
    });

    test('論理削除済み返信には付加情報を作成しない', async () => {
      Chat.findOne.mockResolvedValue({
        _id: postId,
        room: roomId,
        replies: [{ _id: replyId, delete_flg: true, supplementaries: [] }],
        delete_flg: false,
      });
      const { io } = ioFactory();

      await expect(
        replySuppService.createReplySupplement(
          { ...baseBody, content: 'hello', lang: 'ja' },
          jwt,
          io
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('ルーム認可エラー', async () => {
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'FORBIDDEN' }));
      const { io } = ioFactory();

      await expect(
        replySuppService.createReplySupplement({ ...baseBody, content: 'hello', lang: 'ja' }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOne).not.toHaveBeenCalled();
    });

    test('更新後の投稿が取得できない', async () => {
      Chat.findOne.mockResolvedValue({
        _id: postId,
        room: roomId,
        replies: [{ _id: replyId, user: 'replyAuthor', supplementaries: [], delete_flg: false }],
      });
      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(null),
      }));
      const { io } = ioFactory();

      await expect(
        replySuppService.createReplySupplement({ ...baseBody, content: 'hello', lang: 'ja' }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      Chat.findOne.mockResolvedValue({
        _id: postId,
        room: 'another-room',
        replies: [{ _id: replyId, user: 'replyAuthor', supplementaries: [], delete_flg: false }],
      });
      const { io } = ioFactory();

      await expect(
        replySuppService.createReplySupplement({ ...baseBody, content: 'hello', lang: 'ja' }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('返信の付加情報更新', () => {
    const supplementObj = {
      _id: suppId,
      user: 'author',
      content: 'orig',
      lang: 'ja',
      image_name: null,
      image_thumbnail_name: null,
      video_name: null,
      video_thumbnail_name: null,
      video_subtitle_name: null,
      audio_name: null,
      delete_flg: false,
      toObject() {
        return { ...this };
      },
    };

    const chatBefore = {
      _id: postId,
      room: roomId,
      replies: [
        {
          _id: replyId,
          delete_flg: false,
          supplementaries: [supplementObj],
        },
      ],
      delete_flg: false,
    };

    const chatAfter = {
      ...chatBefore,
      replies: [
        {
          ...chatBefore.replies[0],
          supplementaries: [{ ...supplementObj, content: 'updated' }],
        },
      ],
      room: { _id: roomId },
    };

    beforeEach(() => {
      Chat.findOne.mockResolvedValue(chatBefore);
      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(chatAfter),
      }));
      serializeTimeline.mockReturnValue(chatAfter);
    });

    test('管理者が更新', async () => {
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io, roomSocket } = ioFactory();

      const body = { ...baseBody, _id: suppId, content: 'updated', lang: 'ja', target_langs: ['en'] };

      await expect(replySuppService.updateReplySupplement(body, jwtAdmin, io)).resolves.toEqual(chatAfter);

      const [queryArg, updateArg] = Chat.findOneAndUpdate.mock.calls[0];
      expect(queryArg.replies.$elemMatch.supplementaries.$elemMatch).toEqual({
        _id: suppId,
        delete_flg: false,
        content: 'orig',
        lang: 'ja',
      });
      expect(updateArg.$set).toEqual({
        'replies.$[reply].supplementaries.$[supplement].updated_at': expect.any(Number),
        'replies.$[reply].supplementaries.$[supplement].content': 'updated',
        'replies.$[reply].supplementaries.$[supplement].lang': 'ja',
        'replies.$[reply].supplementaries.$[supplement].translations': [],
      });

      expect(deleteMediaDiff).toHaveBeenCalled();

      expect(roomSocket.emit).toHaveBeenCalledWith('REPLY_SUPPLEMENT_UPDATE', chatAfter);

      expect(translateReplySupplementIfNeeded).toHaveBeenCalledWith({
        chatId: postId,
        replyId,
        supplementId: suppId,
        content: 'updated',
        lang: 'ja',
        targetLangs: ['en'],
        userId: 'admin',
        io,
      });
    });

    test('内容同一でもlang変更時は翻訳をクリアして再翻訳する', async () => {
      const storedSupplement = {
        ...supplementObj,
        lang: 'en',
        translations: [{ lang: 'ja', content: '以前' }],
      };
      Chat.findOne.mockResolvedValue({
        ...chatBefore,
        replies: [{ ...chatBefore.replies[0], supplementaries: [storedSupplement] }],
      });
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await replySuppService.updateReplySupplement(
        {
          ...baseBody,
          _id: suppId,
          content: 'orig',
          lang: 'ja',
          target_langs: ['en'],
        },
        jwtAdmin,
        io
      );

      expect(Chat.findOneAndUpdate.mock.calls[0][1].$set).toEqual(
        expect.objectContaining({
          'replies.$[reply].supplementaries.$[supplement].lang': 'ja',
          'replies.$[reply].supplementaries.$[supplement].translations': [],
        })
      );
      expect(translateReplySupplementIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'orig', lang: 'ja', targetLangs: ['en'] })
      );
    });

    test('順方向に解決し、指定項目だけを保存して同時更新されたメディア等を維持する', async () => {
      const imageName = '1_507f1f77bcf86cd799439011.jpg';
      const thumbnailName = '1_507f1f77bcf86cd799439011_thumbnail.jpg';
      const storedSupplement = {
        ...supplementObj,
        image_name: imageName,
        image_thumbnail_name: thumbnailName,
      };
      const before = {
        ...chatBefore,
        replies: [{ ...chatBefore.replies[0], supplementaries: [storedSupplement] }],
      };
      const after = {
        ...before,
        room: { _id: roomId },
        replies: [
          {
            ...before.replies[0],
            supplementaries: [{ ...storedSupplement, content: 'updated' }],
          },
        ],
      };
      Chat.findOne.mockResolvedValue(before);
      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(after),
      }));
      serializeTimeline.mockReturnValue(after);

      const { io } = ioFactory();
      await replySuppService.updateReplySupplement(
        { ...baseBody, _id: suppId, content: 'updated', lang: 'ja' },
        { user_role: 'developer', user_id: 'author' },
        io
      );

      expect(Chat.findOne).toHaveBeenCalledWith({ _id: postId, delete_flg: false });
      expect(validateMediaChanges).toHaveBeenCalledWith(
        expect.objectContaining({
          oldItem: storedSupplement,
          newItem: expect.objectContaining({
            image_name: imageName,
            image_thumbnail_name: thumbnailName,
          }),
        })
      );
      const [queryArg, updateArg] = Chat.findOneAndUpdate.mock.calls[0];
      expect(queryArg.replies.$elemMatch.supplementaries.$elemMatch).toEqual({
        _id: suppId,
        delete_flg: false,
        content: 'orig',
        lang: 'ja',
      });
      expect(updateArg.$set).toEqual({
        'replies.$[reply].supplementaries.$[supplement].updated_at': expect.any(Number),
        'replies.$[reply].supplementaries.$[supplement].content': 'updated',
        'replies.$[reply].supplementaries.$[supplement].lang': 'ja',
        'replies.$[reply].supplementaries.$[supplement].translations': [],
      });
      expect(deleteMediaDiff).toHaveBeenCalledWith(
        expect.objectContaining({
          oldMedia: expect.objectContaining({ image: { main: imageName, thumb: thumbnailName } }),
          newMedia: expect.objectContaining({ image: { main: imageName, thumb: thumbnailName } }),
        })
      );
    });

    test('本文未指定でもlang変更時は翻訳だけをクリアし、本文・リアクションを上書きしない', async () => {
      const storedSupplement = {
        ...supplementObj,
        translations: [{ lang: 'en', content: 'translated' }],
        reactions: [{ type: 'like' }],
      };
      Chat.findOne.mockResolvedValue({
        ...chatBefore,
        replies: [{ ...chatBefore.replies[0], supplementaries: [storedSupplement] }],
      });
      const { io } = ioFactory();

      await replySuppService.updateReplySupplement(
        { ...baseBody, _id: suppId, lang: 'en' },
        { user_role: 'Administrator', user_id: 'admin' },
        io
      );

      const [queryArg, updateArg] = Chat.findOneAndUpdate.mock.calls[0];
      expect(queryArg.replies.$elemMatch.supplementaries.$elemMatch).toEqual({
        _id: suppId,
        delete_flg: false,
        lang: 'ja',
      });
      expect(updateArg.$set).toEqual({
        'replies.$[reply].supplementaries.$[supplement].updated_at': expect.any(Number),
        'replies.$[reply].supplementaries.$[supplement].lang': 'en',
        'replies.$[reply].supplementaries.$[supplement].translations': [],
      });
      expect(require('../../../../services/spam.service').replaceSpams).not.toHaveBeenCalled();
    });

    test('スナップショットと同じ項目が競合した場合は更新失敗として扱う', async () => {
      Chat.findOneAndUpdate.mockResolvedValue(null);
      const { io, roomSocket } = ioFactory();

      await expect(
        replySuppService.updateReplySupplement(
          { ...baseBody, _id: suppId, content: 'updated' },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(Chat.findOneAndUpdate.mock.calls[0][0].replies.$elemMatch.supplementaries.$elemMatch).toEqual({
        _id: suppId,
        delete_flg: false,
        content: 'orig',
        lang: 'ja',
      });
      expect(deleteMediaDiff).not.toHaveBeenCalled();
      expect(roomSocket.emit).not.toHaveBeenCalled();
    });

    test('開発者のフロアメンバーは他ユーザの付加情報を通常API権限で更新できる', async () => {
      authorizeRoomAccess.mockResolvedValue({
        foundUser,
        foundRoom,
        foundFloor,
        foundFloorMember: { _id: 'membership-1' },
      });
      const { io } = ioFactory();

      await expect(
        replySuppService.updateReplySupplement(
          { ...baseBody, _id: suppId, content: 'updated', lang: 'ja' },
          { user_role: 'developer', user_id: 'other' },
          io
        )
      ).resolves.toEqual(chatAfter);

      expect(Chat.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    test('翻訳条件: 内容変更なしなら呼ばれない', async () => {
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      const chatAfterSame = {
        ...chatBefore,
        replies: [
          {
            ...chatBefore.replies[0],
            supplementaries: [{ ...supplementObj, content: 'orig' }],
          },
        ],
        room: { _id: roomId },
      };

      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(chatAfterSame),
      }));
      serializeTimeline.mockReturnValue(chatAfterSame);

      const body = { ...baseBody, _id: suppId, content: 'orig', lang: 'ja', target_langs: ['en'] };

      await expect(replySuppService.updateReplySupplement(body, jwtAdmin, io)).resolves.toEqual(chatAfterSame);

      expect(translateReplySupplementIfNeeded).not.toHaveBeenCalled();
    });

    test('投稿が存在しない', async () => {
      Chat.findOne.mockResolvedValue(null);
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await expect(
        replySuppService.updateReplySupplement({ ...baseBody, _id: suppId, content: 'x', lang: 'ja' }, jwtAdmin, io)
      ).rejects.toBeInstanceOf(AppError);
    });

    test('返信が存在しない', async () => {
      Chat.findOne.mockResolvedValue({ _id: postId, room: roomId, replies: [], delete_flg: false });
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await expect(
        replySuppService.updateReplySupplement({ ...baseBody, _id: suppId, content: 'x', lang: 'ja' }, jwtAdmin, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('付加情報が存在しない', async () => {
      Chat.findOne.mockResolvedValue({
        _id: postId,
        room: roomId,
        replies: [{ _id: replyId, delete_flg: false, supplementaries: [] }],
        delete_flg: false,
      });
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await expect(
        replySuppService.updateReplySupplement({ ...baseBody, _id: suppId, content: 'x', lang: 'ja' }, jwtAdmin, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('更新後の投稿が取得できない', async () => {
      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(null),
      }));
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await expect(
        replySuppService.updateReplySupplement({ ...baseBody, _id: suppId, content: 'x', lang: 'ja' }, jwtAdmin, io)
      ).rejects.toBeInstanceOf(AppError);
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      Chat.findOne.mockResolvedValue({
        ...chatBefore,
        room: 'another-room',
      });
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await expect(
        replySuppService.updateReplySupplement({ ...baseBody, _id: suppId, content: 'x', lang: 'ja' }, jwtAdmin, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('権限のないユーザは 401', async () => {
      authorizeRoomAccess.mockResolvedValue({
        foundUser,
        foundRoom,
        foundFloor,
        foundFloorMember: null,
      });

      const jwtOther = { user_role: 'User', user_id: 'other' };
      const { io } = ioFactory();
      await expect(
        replySuppService.updateReplySupplement({ ...baseBody, _id: suppId, content: 'x', lang: 'ja' }, jwtOther, io)
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('返信の付加情報削除', () => {
    const chatBefore = {
      _id: postId,
      room: roomId,
      replies: [
        {
          _id: replyId,
          delete_flg: false,
          supplementaries: [
            {
              _id: suppId,
              user: 'author',
              delete_flg: false,
            },
          ],
        },
      ],
      delete_flg: false,
    };
    const chatAfter = {
      ...chatBefore,
      replies: [],
      room: { _id: roomId },
    };

    beforeEach(() => {
      Chat.findOne.mockResolvedValue(chatBefore);
      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(chatAfter),
      }));
      serializeTimeline.mockReturnValue(chatAfter);
    });

    test('フロア編集ユーザ (フロア作成者) が削除', async () => {
      authorizeRoomAccess.mockResolvedValue({
        foundUser,
        foundRoom,
        foundFloor,
        foundFloorMember: null,
      });

      const jwtEditor = { user_role: 'Editor', user_id: 'creator' };
      const { io, roomSocket } = ioFactory();

      const body = { ...baseBody, _id: suppId };

      await expect(replySuppService.deleteReplySupplement(body, jwtEditor, io)).resolves.toEqual(chatAfter);

      expect(deleteMediaItem).toHaveBeenCalled();

      expect(roomSocket.emit).toHaveBeenCalledWith('REPLY_SUPPLEMENT_DELETE', chatAfter);

    });

    test('active 返信と有効な付加情報を親クエリへ固定して削除する', async () => {
      const { io } = ioFactory();

      await replySuppService.deleteReplySupplement(
        { ...baseBody, _id: suppId },
        { user_role: 'Administrator', user_id: 'admin' },
        io
      );

      const [queryArg, , optionsArg] = Chat.findOneAndUpdate.mock.calls[0];
      expect(queryArg).toEqual(expect.objectContaining({ _id: postId, room: roomId }));
      expect(queryArg.replies.$elemMatch).toEqual(expect.objectContaining({
        _id: replyId,
        delete_flg: false,
      }));
      expect(queryArg.replies.$elemMatch.supplementaries.$elemMatch).toEqual(
        expect.objectContaining({
          _id: suppId,
          delete_flg: false,
          image_name: null,
          video_name: null,
          audio_name: null,
        })
      );
      expect(optionsArg.arrayFilters[1]).toEqual(expect.objectContaining({
        'supplement.image_name': null,
        'supplement.video_name': null,
        'supplement.audio_name': null,
      }));
    });

    test('メディア更新との競合時は後処理とSocket通知を行わない', async () => {
      Chat.findOneAndUpdate.mockResolvedValue(null);
      const { io, roomSocket } = ioFactory();

      await expect(
        replySuppService.deleteReplySupplement(
          { ...baseBody, _id: suppId },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(deleteMediaItem).not.toHaveBeenCalled();
      expect(roomSocket.emit).not.toHaveBeenCalled();
    });

    test('論理削除済み付加情報は更新せず拒否する', async () => {
      Chat.findOne.mockResolvedValue({
        ...chatBefore,
        replies: [
          {
            ...chatBefore.replies[0],
            supplementaries: [{ ...chatBefore.replies[0].supplementaries[0], delete_flg: true }],
          },
        ],
      });
      const { io } = ioFactory();

      await expect(
        replySuppService.deleteReplySupplement(
          { ...baseBody, _id: suppId },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test.each([
      ['管理者', { jwt: { user_role: 'Administrator', user_id: 'admin' }, floorMember: null }],
      ['フロアメンバー', { jwt: { user_role: 'User', user_id: 'member' }, floorMember: { _id: 'member1' } }],
      ['補助情報作成者', { jwt: { user_role: 'User', user_id: 'author' }, floorMember: null }],
    ])('%s が削除', async (_, { jwt, floorMember }) => {
      authorizeRoomAccess.mockResolvedValue({
        foundRoom,
        foundFloor,
        foundFloorMember: floorMember,
      });

      const { io } = ioFactory();
      const body = { ...baseBody, _id: suppId };

      await expect(replySuppService.deleteReplySupplement(body, jwt, io)).resolves.toEqual(chatAfter);
      expect(deleteMediaItem).toHaveBeenCalled();
    });

    test('権限のないユーザは 401', async () => {
      authorizeRoomAccess.mockResolvedValue({
        foundUser,
        foundRoom,
        foundFloor,
        foundFloorMember: null,
      });

      const jwtNoPerm = { user_role: 'User', user_id: 'x' };
      const { io } = ioFactory();

      await expect(
        replySuppService.deleteReplySupplement({ ...baseBody, _id: suppId }, jwtNoPerm, io)
      ).rejects.toBeInstanceOf(AppError);
    });

    test('投稿が存在しない', async () => {
      Chat.findOne.mockResolvedValue(null);
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await expect(
        replySuppService.deleteReplySupplement({ ...baseBody, _id: suppId }, jwtAdmin, io)
      ).rejects.toBeInstanceOf(AppError);
    });

    test('返信が存在しない', async () => {
      Chat.findOne.mockResolvedValue({ _id: postId, room: roomId, replies: [], delete_flg: false });
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await expect(
        replySuppService.deleteReplySupplement({ ...baseBody, _id: suppId }, jwtAdmin, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('付加情報が存在しない', async () => {
      Chat.findOne.mockResolvedValue({
        _id: postId,
        room: roomId,
        replies: [{ _id: replyId, delete_flg: false, supplementaries: [] }],
        delete_flg: false,
      });
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await expect(
        replySuppService.deleteReplySupplement({ ...baseBody, _id: suppId }, jwtAdmin, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('更新後の投稿が取得できない', async () => {
      Chat.findOneAndUpdate.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(null),
      }));
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await expect(
        replySuppService.deleteReplySupplement({ ...baseBody, _id: suppId }, jwtAdmin, io)
      ).rejects.toBeInstanceOf(AppError);
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      Chat.findOne.mockResolvedValue({
        ...chatBefore,
        room: 'another-room',
      });
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await expect(
        replySuppService.deleteReplySupplement({ ...baseBody, _id: suppId }, jwtAdmin, io)
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
