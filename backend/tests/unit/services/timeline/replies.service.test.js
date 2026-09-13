jest.mock('../../../../services/media/reference', () => ({
  validateMediaChanges: jest.fn(),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
const mockIsOpenAIAnalysisEnabled = jest.fn(() => true);
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
  isOneSignalEnabled: jest.fn(() => true),
}));
jest.mock('../../../../services/analysis/settings/capability', () => ({
  isAIAnalysisExecutionEnabled: mockIsOpenAIAnalysisEnabled,
}));

const { ObjectId } = require('mongodb');

jest.mock('../../../../models/Chat', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../../../../models/User.js', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/PushFilter.js', () => ({ find: jest.fn() }));
jest.mock('../../../../models/RoomTag', () => ({ find: jest.fn(), countDocuments: jest.fn() }));

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
  translateReplyIfNeeded: jest.fn().mockResolvedValue(),
}));
jest.mock('../../../../services/analysis.service', () => ({
  runReplyAnalyses: jest.fn(),
}));
jest.mock('../../../../services/timeline/shared/replyPostProcess', () => ({
  attachReplyNotificationEvent: jest.fn((reply, notifyAll) => {
    if (!reply) return reply;
    reply.notify_all = !!notifyAll;
    if (notifyAll) {
      reply.notification_event_id = 'notification-event-1';
      reply.notified_at = '2026-07-18T00:00:00.000Z';
    }
    return reply;
  }),
  emitReplyCreate: jest.fn(),
  translateReplyAfterCreate: jest.fn(),
}));
jest.mock('../../../../services/timeline/shared/replyParticipantNotifications', () => ({
  notifyReplyPostAuthor: jest.fn().mockResolvedValue(),
  notifyReplyRepliers: jest.fn().mockResolvedValue(),
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

const repliesService = require('../../../../services/timeline/replies.service');
const { validateMediaChanges } = require('../../../../services/media/reference');
const Chat = require('../../../../models/Chat');
const RoomTag = require('../../../../models/RoomTag');
const { authorizeRoomAccess } = require('../../../../services/room/roomAccess.service');
const serializeTimeline = require('../../../../services/timeline/shared/timelineSerializer');
const { deleteMediaDiff, deleteMediaItem } = require('../../../../services/media/fileCleanup');
const { translateReplyIfNeeded } = require('../../../../services/timeline/timelineTranslation.service');
const {
  attachReplyNotificationEvent,
  emitReplyCreate,
  translateReplyAfterCreate,
} = require('../../../../services/timeline/shared/replyPostProcess');
const {
  notifyReplyRepliers,
} = require('../../../../services/timeline/shared/replyParticipantNotifications');
const { runReplyAnalyses } = require('../../../../services/analysis.service');
const AppError = require('../../../../utils/appError');

describe('repliesのサービス', () => {
  const ORIGINAL_ENV = process.env;
  const MEDIA_PATH = '/tmp/media';

  const floorId = new ObjectId().toString();
  const roomId = new ObjectId().toString();
  const postId = new ObjectId().toString();
  const replyId = new ObjectId().toString();

  const foundUser = { _id: 'creator', username: 'Creator' };
  const foundFloor = { _id: floorId, user: 'creator', floor_display_hidden: false, title: 'Floor' };
  const foundRoom = { _id: roomId, room_display_hidden: false, title: 'Room' };

  const baseBody = {
    floor_id: floorId,
    floor_title: 'Floor',
    room_id: roomId,
    room_title: 'Room',
    user_id: 'creator',
    user_name: 'Creator',
    post_id: postId,
  };

  const ioFactory = () => {
    const roomSocket = { emit: jest.fn() };
    const io = { to: jest.fn(() => roomSocket) };
    return { io, roomSocket };
  };

  const makePopulateQuery = (result) => {
    const query = {
      populate: jest.fn(() => query), // 連続したpopulate呼び出しを再現する。
      then: (resolve) => resolve(result), // await可能なクエリを再現する。
      catch: jest.fn(),
    };
    return query;
  };

  const makePopulateLeanQuery = (result) => {
    const query = {
      populate: jest.fn(() => query),
      lean: jest.fn().mockResolvedValue(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      catch: (reject) => Promise.resolve(result).catch(reject),
    };
    return query;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockIsOpenAIAnalysisEnabled.mockReturnValue(true);
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
    RoomTag.countDocuments.mockResolvedValue(1);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  describe('作成', () => {
    const jwt = { user_role: 'User', user_id: 'creator' };

    test('返信を作成してSocket通知とログ記録を行う', async () => {
      const chatBefore = { _id: postId, room: roomId, user: 'postAuthor', replies: [] };
      const chatAfterPlain = {
        _id: postId,
        room: { _id: roomId },
        replies: [{ _id: replyId, content: 'hi', lang: 'ja' }],
      };

      const populatedStub = {
        ...chatAfterPlain,
        populate: jest.fn().mockResolvedValue(chatAfterPlain),
      };

      Chat.findOne.mockResolvedValue(chatBefore);
      Chat.findOneAndUpdate.mockResolvedValue(populatedStub);
      serializeTimeline.mockReturnValue(chatAfterPlain);

      const { io } = ioFactory();

      const body = { ...baseBody, content: 'hi', lang: 'ja', room_tags: [], target_langs: [] };

      await expect(repliesService.create(body, jwt, io)).resolves.toEqual(chatAfterPlain);

      expect(validateMediaChanges).toHaveBeenCalledWith(
        expect.objectContaining({ userId: jwt.user_id, newItem: body })
      );
      expect(Chat.findOne).toHaveBeenCalledWith({ _id: postId, room: roomId, delete_flg: false });
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: postId, delete_flg: false },
        { $push: { replies: expect.any(Object) } },
        { new: true, runValidators: true }
      );
      expect(emitReplyCreate).toHaveBeenCalledWith(io, expect.any(Object), expect.objectContaining({ includeNotifyAll: true }));
      const { buildContents } = notifyReplyRepliers.mock.calls[0][0];
      expect(buildContents({ senderName: 'Creator', snippet: 'hi' })).toEqual({
        ja: 'Creator: 「hi」',
        en: 'Creator: “hi”',
      });
    });

    test.each(['成功', '失敗'])('翻訳%s後も解析を実行する', async (translationState) => {
      if (translationState === '失敗') translateReplyAfterCreate.mockRejectedValueOnce(new Error('translation failed'));
      const chatBefore = { _id: postId, room: roomId, user: 'postAuthor', replies: [] };
      const chatAfterPlain = {
        _id: postId,
        room: { _id: roomId },
        replies: [{ _id: replyId, content: 'hi', lang: 'ja' }],
      };

      const populatedStub = {
        ...chatAfterPlain,
        populate: jest.fn().mockResolvedValue(chatAfterPlain),
      };

      Chat.findOne.mockResolvedValue(chatBefore);
      Chat.findOneAndUpdate.mockResolvedValue(populatedStub);
      serializeTimeline.mockReturnValue(chatAfterPlain);

      const originalSetImmediate = global.setImmediate;
      let immediatePromise;
      global.setImmediate = (fn) => {
        immediatePromise = fn();
      };
      try {
        const { io } = ioFactory();
        const body = { ...baseBody, content: 'hi', lang: 'ja', room_tags: [], target_langs: ['en'] };

        await repliesService.create(body, jwt, io);
        await immediatePromise;

        expect(translateReplyAfterCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            result: chatAfterPlain,
            targetLangs: ['en'],
            actor: { type: 'user', id: 'creator' },
          })
        );
        expect(runReplyAnalyses).toHaveBeenCalledTimes(1);
        expect(runReplyAnalyses).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: postId,
            replyId,
            targetLangs: ['en'],
            io,
            signal: expect.anything(),
          })
        );
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('翻訳とAI解析が両方無効でも返信を保存し、バックグラウンド処理を作らない', async () => {
      const chatBefore = { _id: postId, room: roomId, user: 'postAuthor', replies: [] };
      const chatAfterPlain = {
        _id: postId,
        room: { _id: roomId },
        replies: [{ _id: replyId, content: 'hi', lang: 'ja' }],
      };
      Chat.findOne.mockResolvedValue(chatBefore);
      Chat.findOneAndUpdate.mockResolvedValue({
        ...chatAfterPlain,
        populate: jest.fn().mockResolvedValue(chatAfterPlain),
      });
      serializeTimeline.mockReturnValue(chatAfterPlain);
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      mockIsOpenAIAnalysisEnabled.mockReturnValue(false);
      const originalSetImmediate = global.setImmediate;
      global.setImmediate = jest.fn();
      try {
        const { io } = ioFactory();
        const body = { ...baseBody, content: 'hi', lang: 'ja', room_tags: [], target_langs: ['en'] };

        await expect(repliesService.create(body, jwt, io)).resolves.toEqual(chatAfterPlain);

        expect(global.setImmediate).not.toHaveBeenCalled();
        expect(translateReplyAfterCreate).not.toHaveBeenCalled();
        expect(runReplyAnalyses).not.toHaveBeenCalled();
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('投稿が存在しない', async () => {
      Chat.findOne.mockResolvedValue(null);
      const { io } = ioFactory();

      await expect(repliesService.create({ ...baseBody, content: '' }, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      Chat.findOne.mockResolvedValue({ _id: postId, room: 'another-room', user: 'postAuthor', replies: [] });
      const { io } = ioFactory();

      await expect(repliesService.create({ ...baseBody, content: 'hi' }, jwt, io)).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('競合で findOneAndUpdate が null を返す', async () => {
      Chat.findOne.mockResolvedValue({ _id: postId, room: roomId, user: 'postAuthor', replies: [] });
      Chat.findOneAndUpdate.mockResolvedValue(null);
      const { io } = ioFactory();

      await expect(repliesService.create({ ...baseBody, content: 'hi' }, jwt, io)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('更新', () => {
    const replyObj = {
      _id: replyId,
      user: 'creator',
      content: 'old',
      lang: 'ja',
      translations: [{ lang: 'en', content: 'Old' }],
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
      replies: [replyObj],
      delete_flg: false,
    };
    const chatAfterPlain = {
      ...chatBefore,
      replies: [{ ...replyObj, content: 'new' }],
      room: { _id: roomId },
    };

    beforeEach(() => {
      Chat.findOne.mockResolvedValue(chatBefore);
      Chat.findOneAndUpdate.mockResolvedValue({
        ...chatAfterPlain,
        populate: jest.fn().mockResolvedValue(chatAfterPlain),
      });
      serializeTimeline.mockReturnValue(chatAfterPlain);
    });

    test('管理者が更新', async () => {
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io, roomSocket } = ioFactory();

      const body = { ...baseBody, _id: replyId, content: 'new', lang: 'ja', room_tags: [] };
      const expectedEmit = JSON.parse(JSON.stringify(chatAfterPlain));
      expectedEmit.replies[0].notify_all = false;

      await expect(repliesService.update(body, jwtAdmin, io)).resolves.toEqual(chatAfterPlain);

      expect(deleteMediaDiff).toHaveBeenCalled();
      expect(roomSocket.emit).toHaveBeenCalledWith('REPLY_UPDATE', expectedEmit);
    });

    test('メディア部分更新は検証時のグループ状態を返信更新条件へ固定する', async () => {
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await repliesService.update(
        {
          ...baseBody,
          _id: replyId,
          content: 'new',
          lang: 'ja',
          room_tags: [],
          image_caption: null,
        },
        jwtAdmin,
        io
      );

      const query = Chat.findOneAndUpdate.mock.calls[0][0];
      expect(query.replies.$elemMatch).toEqual(expect.objectContaining({
        image_name: null,
        image_thumbnail_name: null,
        image_caption: null,
        video_name: null,
        video_thumbnail_name: null,
        video_subtitle_originalname: null,
        video_subtitle_name: null,
        audio_name: null,
        audio_title: null,
        audio_description: null,
      }));
      expect(Chat.findOneAndUpdate.mock.calls[0][2].arrayFilters[0]).toEqual(
        expect.objectContaining({
          'reply.image_name': null,
          'reply.image_caption': null,
          'reply.audio_name': null,
        })
      );
    });

    test('内容同一でもlang変更時は翻訳をクリアして再翻訳する', async () => {
      const originalSetImmediate = global.setImmediate;
      let immediatePromise;
      global.setImmediate = (fn) => {
        immediatePromise = fn();
      };
      try {
        const storedReply = {
          ...replyObj,
          content: 'same',
          lang: 'en',
          translations: [{ lang: 'ja', content: '以前' }],
        };
        const before = { ...chatBefore, replies: [storedReply] };
        const after = {
          ...before,
          room: { _id: roomId },
          replies: [{ ...storedReply, lang: 'ja', translations: [] }],
        };
        Chat.findOne.mockResolvedValue(before);
        Chat.findOneAndUpdate.mockResolvedValue({
          ...after,
          populate: jest.fn().mockResolvedValue(after),
        });
        serializeTimeline.mockReturnValue(after);
        const { io } = ioFactory();

        await repliesService.update(
          {
            ...baseBody,
            _id: replyId,
            content: 'same',
            lang: 'ja',
            target_langs: ['en'],
          },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        );
        await immediatePromise;

        expect(Chat.findOneAndUpdate.mock.calls[0][1].$set).toEqual(
          expect.objectContaining({
            'replies.$[reply].lang': 'ja',
            'replies.$[reply].translations': [],
          })
        );
        expect(translateReplyIfNeeded).toHaveBeenCalledWith(
          expect.objectContaining({
            reply: expect.objectContaining({ content: 'same', lang: 'ja' }),
            targetLangs: ['en'],
          })
        );
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('post_idから返信を順方向に解決し、省略したメディアを維持する', async () => {
      const imageName = '1_507f1f77bcf86cd799439011.jpg';
      const thumbnailName = '1_507f1f77bcf86cd799439011_thumbnail.jpg';
      const storedReply = {
        ...replyObj,
        room_tags: [],
        image_name: imageName,
        image_thumbnail_name: thumbnailName,
      };
      const before = { ...chatBefore, replies: [storedReply] };
      const after = {
        ...before,
        room: { _id: roomId },
        replies: [{ ...storedReply, content: 'new' }],
      };
      Chat.findOne.mockResolvedValue(before);
      Chat.findOneAndUpdate.mockResolvedValue({
        ...after,
        populate: jest.fn().mockResolvedValue(after),
      });
      serializeTimeline.mockReturnValue(after);

      const { io } = ioFactory();
      await repliesService.update(
        { ...baseBody, _id: replyId, content: 'new', lang: 'ja' },
        { user_role: 'developer', user_id: 'creator' },
        io
      );

      expect(Chat.findOne).toHaveBeenCalledWith({ _id: postId, room: roomId, delete_flg: false });
      expect(validateMediaChanges).toHaveBeenCalledWith(
        expect.objectContaining({
          oldItem: storedReply,
          newItem: expect.objectContaining({
            image_name: imageName,
            image_thumbnail_name: thumbnailName,
          }),
        })
      );
      const setFields = Chat.findOneAndUpdate.mock.calls[0][1].$set;
      expect(setFields).not.toHaveProperty('replies.$[reply].image_name');
      expect(setFields).not.toHaveProperty('replies.$[reply].image_thumbnail_name');
      expect(deleteMediaDiff).toHaveBeenCalledWith(
        expect.objectContaining({
          oldMedia: expect.objectContaining({ image: { main: imageName, thumb: thumbnailName } }),
          newMedia: expect.objectContaining({ image: { main: imageName, thumb: thumbnailName } }),
        })
      );
    });

    test('開発者のフロアメンバーは他ユーザの返信を通常API権限で更新できる', async () => {
      authorizeRoomAccess.mockResolvedValue({
        foundUser,
        foundRoom,
        foundFloor,
        foundFloorMember: { _id: 'membership-1' },
      });
      const { io } = ioFactory();

      await expect(
        repliesService.update(
          { ...baseBody, _id: replyId, content: 'new', lang: 'ja', room_tags: [] },
          { user_role: 'developer', user_id: 'other' },
          io
        )
      ).resolves.toEqual(chatAfterPlain);

      expect(Chat.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    test('Google翻訳無効時は内容更新後も保存済み翻訳を変更しない', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      await repliesService.update(
        { ...baseBody, _id: replyId, content: 'new', lang: 'ja', room_tags: [] },
        jwtAdmin,
        io
      );

      const replyUpdate = Chat.findOneAndUpdate.mock.calls[0][1].$set;
      expect(replyUpdate).not.toHaveProperty('replies.$[reply].translations');
    });

    test('全員通知を指定した更新に一時的な通知イベント情報を付与', async () => {
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io, roomSocket } = ioFactory();
      const body = {
        ...baseBody,
        _id: replyId,
        content: 'new',
        lang: 'ja',
        room_tags: [],
        target_langs: [],
        notify_all: true,
      };

      await repliesService.update(body, jwtAdmin, io);

      expect(attachReplyNotificationEvent).toHaveBeenCalledWith(
        expect.objectContaining({ _id: replyId }),
        true
      );
      expect(roomSocket.emit).toHaveBeenCalledWith(
        'REPLY_UPDATE',
        expect.objectContaining({
          replies: [
            expect.objectContaining({
              _id: replyId,
              notify_all: true,
              notification_event_id: 'notification-event-1',
              notified_at: '2026-07-18T00:00:00.000Z',
            }),
          ],
        })
      );
      expect(chatAfterPlain.replies[0]).not.toHaveProperty('notification_event_id');
    });

    test.each(['成功', '失敗'])('翻訳%s後も解析を実行する', async (translationState) => {
      if (translationState === '失敗') translateReplyIfNeeded.mockRejectedValueOnce(new Error('translation failed'));
      const jwtAdmin = { user_role: 'Administrator', user_id: 'admin' };
      const { io } = ioFactory();

      const originalSetImmediate = global.setImmediate;
      let immediatePromise;
      global.setImmediate = (fn) => {
        immediatePromise = fn();
      };
      try {
        const body = {
          ...baseBody,
          _id: replyId,
          content: 'new',
          lang: 'ja',
          room_tags: [],
          target_langs: ['en'],
        };

        await repliesService.update(body, jwtAdmin, io);
        await immediatePromise;

        expect(translateReplyIfNeeded).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: postId,
            reply: expect.objectContaining({ _id: replyId, content: 'new', lang: 'ja' }),
            targetLangs: ['en'],
            io,
            userId: 'admin',
          })
        );
        expect(runReplyAnalyses).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: postId,
            replyId,
            targetLangs: ['en'],
            io,
            signal: expect.anything(),
          })
        );
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('認可したroom_idと返信のChat.roomが不一致', async () => {
      Chat.findOne.mockResolvedValue({ ...chatBefore, room: new ObjectId().toString() });
      const { io } = ioFactory();

      await expect(
        repliesService.update(
          { ...baseBody, _id: replyId, content: 'x', room_tags: [] },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('post_idとreply_idの親Chatが不一致', async () => {
      const { io } = ioFactory();

      await expect(
        repliesService.update(
          { ...baseBody, post_id: new ObjectId().toString(), _id: replyId, content: 'x', room_tags: [] },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('ソースが実際に変わらない更新では解析を起動しない', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      const { io } = ioFactory();
      const originalSetImmediate = global.setImmediate;
      global.setImmediate = jest.fn();
      try {
        await repliesService.update(
          { ...baseBody, _id: replyId, content: 'old', lang: 'ja', room_tags: [] },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        );

        expect(global.setImmediate).not.toHaveBeenCalled();
        expect(runReplyAnalyses).not.toHaveBeenCalled();
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('解析対象が変わっても保存済みのAI付加情報を削除しない', async () => {
      const originalSetImmediate = global.setImmediate;
      try {
        global.setImmediate = jest.fn();

        const body = {
          ...baseBody,
          _id: replyId,
          content: 'new',
          lang: 'ja',
          room_tags: [],
          image_name: null,
          image_thumbnail_name: null,
          video_name: null,
          video_thumbnail_name: null,
          video_subtitle_name: null,
          audio_name: null,
          target_langs: [],
        };

        const supplementaries = [
          { _id: 's-speech', user: { _id: 'support-user' }, meta: { analysis_kind: 'speech' }, delete_flg: false },
        ];

        const buildSelectLeanChain = (doc) => ({
          select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(doc) })),
        });

        let repliesServiceWithSupport;
        let ChatWithSupport;
        let RoomTagWithSupport;
        let updatePromise;

        jest.isolateModules(() => {
          repliesServiceWithSupport = require('../../../../services/timeline/replies.service');
          ChatWithSupport = require('../../../../models/Chat');
          RoomTagWithSupport = require('../../../../models/RoomTag');
          const { authorizeRoomAccess: authorizeRoomAccessWithSupport } = require('../../../../services/room/roomAccess.service');

          authorizeRoomAccessWithSupport.mockResolvedValue({
            foundRoom: { _id: roomId, title: 'Room', room_display_hidden: false },
            foundFloor: { _id: floorId, title: 'Floor', user: 'creator' },
            foundFloorMember: {},
          });

          const replyObj = {
            _id: replyId,
            user: 'creator',
            content: 'old',
            lang: 'ja',
            image_name: null,
            image_thumbnail_name: null,
            video_name: 'old.mp4',
            video_thumbnail_name: 'old_thumbnail.png',
            video_subtitle_name: null,
            audio_name: null,
            delete_flg: false,
            toObject() {
              return { ...this };
            },
          };

          const chatBefore = { _id: postId, room: roomId, replies: [replyObj], delete_flg: false };
          const chatAfterPlain = {
            ...chatBefore,
            replies: [{ ...replyObj, content: 'new', video_name: null, video_thumbnail_name: null }],
            room: { _id: roomId },
          };

          ChatWithSupport.findOne.mockResolvedValue(chatBefore);
          ChatWithSupport.findOneAndUpdate.mockResolvedValue({
            ...chatAfterPlain,
            populate: jest.fn().mockResolvedValue(chatAfterPlain),
          });
          ChatWithSupport.findById.mockReturnValue(
            buildSelectLeanChain({
              replies: [{ _id: replyId, supplementaries }],
              room: { _id: roomId },
            })
          );

          RoomTagWithSupport.find
            .mockReturnValueOnce(buildSelectLeanChain([]))
            .mockReturnValueOnce(buildSelectLeanChain([]));

          ChatWithSupport.updateOne.mockResolvedValue({});
          serializeTimeline.mockReturnValue(chatAfterPlain);

          updatePromise = repliesServiceWithSupport.update(body, { user_role: 'Administrator', user_id: 'admin' }, ioFactory().io);
        });

        await updatePromise;

        expect(ChatWithSupport.updateOne).not.toHaveBeenCalled();
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('OpenAI解析無効時はメディア変更後も保存済みAI付加情報を削除しない', async () => {
      const originalSetImmediate = global.setImmediate;
      try {
        mockIsOpenAIAnalysisEnabled.mockReturnValue(false);
        global.setImmediate = jest.fn();

        let isolatedService;
        let isolatedChat;
        jest.isolateModules(() => {
          isolatedService = require('../../../../services/timeline/replies.service');
          isolatedChat = require('../../../../models/Chat');
          const { authorizeRoomAccess: isolatedAuthorize } = require('../../../../services/room/roomAccess.service');
          const isolatedRemoveDeletedData = require('../../../../services/timeline/shared/timelineSerializer');

          isolatedChat.findOne.mockReset();
          isolatedChat.findOneAndUpdate.mockReset();
          isolatedChat.findById.mockReset();
          isolatedChat.updateOne.mockReset();
          isolatedAuthorize.mockResolvedValue({
            foundRoom,
            foundFloor,
            foundFloorMember: null,
          });

          const storedReply = {
            _id: replyId,
            user: 'creator',
            content: 'old',
            lang: 'ja',
            translations: [{ lang: 'en', content: 'Old' }],
            room_tags: [],
            image_name: null,
            image_thumbnail_name: null,
            video_name: 'old.mp4',
            video_thumbnail_name: 'old_thumbnail.png',
            video_subtitle_name: null,
            audio_name: null,
            supplementaries: [
              {
                _id: 's-video',
                user: { _id: 'support-user' },
                meta: { analysis_kind: 'video' },
                delete_flg: false,
              },
            ],
            delete_flg: false,
            toObject() {
              return { ...this };
            },
          };
          const before = { _id: postId, room: roomId, replies: [storedReply], delete_flg: false };
          const after = {
            ...before,
            room: { _id: roomId },
            replies: [{ ...storedReply, content: 'new', video_name: null, video_thumbnail_name: null }],
          };
          isolatedChat.findOne.mockResolvedValue(before);
          isolatedChat.findOneAndUpdate.mockReturnValue(makePopulateQuery(after));
          isolatedRemoveDeletedData.mockReturnValue(after);
        });

        const { io } = ioFactory();
        await isolatedService.update(
          {
            ...baseBody,
            _id: replyId,
            content: 'new',
            lang: 'ja',
            room_tags: [],
            image_name: null,
            image_thumbnail_name: null,
            video_name: null,
            video_thumbnail_name: null,
            video_subtitle_name: null,
            audio_name: null,
            target_langs: [],
          },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        );

        expect(isolatedChat.findOneAndUpdate).toHaveBeenCalled();
        expect(isolatedChat.updateOne).not.toHaveBeenCalled();
      } finally {
        mockIsOpenAIAnalysisEnabled.mockReturnValue(true);
        global.setImmediate = originalSetImmediate;
      }
    });

    test('権限のないユーザは 401', async () => {
      const jwtOther = { user_role: 'User', user_id: 'other' };
      const { io } = ioFactory();

      await expect(
        repliesService.update({ ...baseBody, _id: replyId, content: 'x' }, jwtOther, io)
      ).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('削除', () => {
    const replyObj = { _id: replyId, user: 'creator', delete_flg: false };
    const chatBefore = { _id: postId, room: roomId, replies: [replyObj], delete_flg: false };
    const chatAfterPlain = { _id: postId, replies: [], room: { _id: roomId } };

    beforeEach(() => {
      Chat.findOne.mockResolvedValue(chatBefore);
      Chat.findOneAndUpdate.mockReturnValue(makePopulateQuery(chatAfterPlain));
      serializeTimeline.mockReturnValue(chatAfterPlain);
    });

    test('フロア編集ユーザ (フロア作成者) が削除', async () => {
      const jwtEditor = { user_role: 'Editor', user_id: 'creator' };
      const { io, roomSocket } = ioFactory();

      const body = { ...baseBody, _id: replyId };

      await expect(repliesService.delete(body, jwtEditor, io)).resolves.toEqual(chatAfterPlain);

      expect(deleteMediaItem).toHaveBeenCalled();
      expect(roomSocket.emit).toHaveBeenCalledWith('REPLY_DELETE', chatAfterPlain);
    });

    test('post_idから有効な返信を順方向に解決して削除する', async () => {
      const { io } = ioFactory();

      await repliesService.delete(
        { ...baseBody, _id: replyId },
        { user_role: 'developer', user_id: 'creator' },
        io
      );

      expect(Chat.findOne).toHaveBeenCalledWith({ _id: postId, room: roomId, delete_flg: false });
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: postId,
          room: roomId,
          replies: {
            $elemMatch: expect.objectContaining({
              _id: replyId,
              delete_flg: false,
              image_name: null,
              image_thumbnail_name: null,
              video_name: null,
              audio_name: null,
            }),
          },
        }),
        expect.any(Object),
        expect.any(Object)
      );
    });

    test('メディア更新との競合時は後処理とSocket通知を行わない', async () => {
      Chat.findOneAndUpdate.mockReturnValue(makePopulateQuery(null));
      const { io, roomSocket } = ioFactory();

      await expect(
        repliesService.delete(
          { ...baseBody, _id: replyId },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(deleteMediaItem).not.toHaveBeenCalled();
      expect(roomSocket.emit).not.toHaveBeenCalled();
    });

    test('論理削除済み返信は更新せず拒否する', async () => {
      Chat.findOne.mockResolvedValue({
        ...chatBefore,
        replies: [{ ...replyObj, delete_flg: true }],
      });
      const { io } = ioFactory();

      await expect(
        repliesService.delete(
          { ...baseBody, _id: replyId },
          { user_role: 'developer', user_id: 'creator' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('認可したroom_idと返信のChat.roomが不一致', async () => {
      Chat.findOne.mockResolvedValue({ ...chatBefore, room: new ObjectId().toString() });
      const { io } = ioFactory();

      await expect(
        repliesService.delete(
          { ...baseBody, _id: replyId },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('post_idとreply_idの親Chatが不一致', async () => {
      const { io } = ioFactory();

      await expect(
        repliesService.delete(
          { ...baseBody, post_id: new ObjectId().toString(), _id: replyId },
          { user_role: 'Administrator', user_id: 'admin' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('権限のないユーザは 401', async () => {
      const jwtOther = { user_role: 'User', user_id: 'x' };
      const { io } = ioFactory();

      await expect(repliesService.delete({ ...baseBody, _id: replyId }, jwtOther, io)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('タグの更新', () => {
    const chatAfterPlain = {
      _id: postId,
      replies: [{ _id: replyId, room_tags: ['tag1'] }],
      room: { _id: roomId },
    };

    beforeEach(() => {
      Chat.findOne.mockReturnValue(
        makePopulateLeanQuery({
          _id: postId,
          room: roomId,
          replies: [{ _id: replyId, room_tags: [] }],
        })
      );
      Chat.findOneAndUpdate.mockReturnValue(makePopulateQuery(chatAfterPlain));
      Chat.findById.mockReturnValue(makePopulateQuery(chatAfterPlain));
      serializeTimeline.mockReturnValue(chatAfterPlain);
    });

    test('タグを更新してSocket通知とログ記録を行う', async () => {
      const jwt = { user_role: 'User', user_id: 'creator' };
      const { io, roomSocket } = ioFactory();

      const body = { ...baseBody, _id: replyId, room_tags: ['tag1'] };

      await expect(repliesService.updateTag(body, jwt, io)).resolves.toEqual(chatAfterPlain);

      expect(Chat.findOneAndUpdate).toHaveBeenCalled();
      expect(roomSocket.emit).toHaveBeenCalledWith('TAG_UPDATE', chatAfterPlain);
    });

    test('OpenAI解析無効時はタグ変更後も保存済みAI付加情報を削除しない', async () => {
      const originalSetImmediate = global.setImmediate;
      try {
        mockIsOpenAIAnalysisEnabled.mockReturnValue(false);
        global.setImmediate = jest.fn();

        let isolatedService;
        let isolatedChat;
        jest.isolateModules(() => {
          isolatedService = require('../../../../services/timeline/replies.service');
          isolatedChat = require('../../../../models/Chat');
          const { authorizeRoomAccess: isolatedAuthorize } = require('../../../../services/room/roomAccess.service');
          const isolatedRemoveDeletedData = require('../../../../services/timeline/shared/timelineSerializer');

          isolatedChat.findOne.mockReset();
          isolatedChat.findOneAndUpdate.mockReset();
          isolatedChat.findById.mockReset();
          isolatedChat.updateOne.mockReset();
          isolatedAuthorize.mockResolvedValue({ foundRoom, foundFloor });

          const before = {
            _id: postId,
            room: roomId,
            replies: [
              {
                _id: replyId,
                room_tags: [{ name: '任意解析タグ' }],
                supplementaries: [
                  {
                    _id: 's-vision',
                    user: { _id: 'support-user' },
                    meta: { analysis_kind: 'vision' },
                    delete_flg: false,
                  },
                ],
              },
            ],
          };
          const after = {
            _id: postId,
            room: { _id: roomId },
            replies: [
              {
                _id: replyId,
                room_tags: [],
                supplementaries: before.replies[0].supplementaries,
              },
            ],
          };
          isolatedChat.findOne.mockReturnValue(makePopulateLeanQuery(before));
          isolatedChat.findOneAndUpdate.mockReturnValue(makePopulateQuery(after));
          isolatedChat.findById.mockReturnValue(makePopulateQuery(after));
          isolatedRemoveDeletedData.mockReturnValue(after);
        });

        const { io } = ioFactory();
        await isolatedService.updateTag(
          { ...baseBody, _id: replyId, room_tags: [] },
          { user_role: 'User', user_id: 'creator' },
          io
        );

        expect(isolatedChat.findOneAndUpdate).toHaveBeenCalled();
        expect(isolatedChat.updateOne).not.toHaveBeenCalled();
      } finally {
        mockIsOpenAIAnalysisEnabled.mockReturnValue(true);
        global.setImmediate = originalSetImmediate;
      }
    });

    test('認可したroom_idと返信のChat.roomが不一致', async () => {
      Chat.findOne.mockReturnValue(
        makePopulateLeanQuery({
          _id: postId,
          room: new ObjectId().toString(),
          replies: [{ _id: replyId, room_tags: [] }],
        })
      );
      const { io } = ioFactory();

      await expect(
        repliesService.updateTag(
          { ...baseBody, _id: replyId, room_tags: [] },
          { user_role: 'User', user_id: 'creator' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('setImmediate で解析を起動', async () => {
      const jwt = { user_role: 'User', user_id: 'creator' };
      const { io } = ioFactory();

      const originalSetImmediate = global.setImmediate;
      let immediatePromise;
      global.setImmediate = (fn) => {
        immediatePromise = fn();
      };
      try {
        const body = { ...baseBody, _id: replyId, room_tags: ['tag1'] };

        await repliesService.updateTag(body, jwt, io);
        await immediatePromise;

        expect(runReplyAnalyses).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: postId,
            replyId,
            io,
            signal: expect.anything(),
          })
        );
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('タグが実際に変わらない更新では解析を起動しない', async () => {
      const jwt = { user_role: 'User', user_id: 'creator' };
      const { io } = ioFactory();
      const originalSetImmediate = global.setImmediate;
      global.setImmediate = jest.fn();
      try {
        await repliesService.updateTag(
          { ...baseBody, _id: replyId, room_tags: [] },
          jwt,
          io
        );

        expect(global.setImmediate).not.toHaveBeenCalled();
        expect(runReplyAnalyses).not.toHaveBeenCalled();
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('該当返信が見つからず 400', async () => {
      Chat.findOneAndUpdate.mockReturnValue(makePopulateQuery(null));
      const jwt = { user_role: 'User', user_id: 'creator' };
      const { io } = ioFactory();

      await expect(
        repliesService.updateTag({ ...baseBody, _id: replyId, room_tags: ['tag1'] }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);
    });
  });
});
