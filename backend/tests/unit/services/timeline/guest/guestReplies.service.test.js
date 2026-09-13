jest.mock('../../../../../services/spam.service', () => ({
  replaceSpams: jest.fn().mockImplementation(async (txt) => (txt ? 'CLEAN_' + txt : txt)),
}));

jest.mock('../../../../../services/timeline/timelineTranslation.service', () => ({
  translateGuestReplyIfNeeded: jest.fn().mockResolvedValue(true),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));

jest.mock('../../../../../utils/logger', () => ({ warn: jest.fn() }));

jest.mock('../../../../../services/timeline/shared/timelineSerializer', () => jest.fn((d) => d));

jest.mock('../../../../../services/timeline/shared/matchConditions', () => jest.fn(() => false));

jest.mock(
  '../../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

jest.mock('../../../../../models/Chat', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));

jest.mock('../../../../../models/User', () => ({
  findOne: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../../../../../models/Floor', () => ({ findOne: jest.fn() }));
jest.mock('../../../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../../../models/PushFilter', () => ({ find: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/replyParticipantNotifications', () => ({
  notifyReplyPostAuthor: jest.fn().mockResolvedValue(),
  notifyReplyRepliers: jest.fn().mockResolvedValue(),
}));

const guestRepliesService = require('../../../../../services/timeline/guest/guestReplies.service');
const Chat = require('../../../../../models/Chat');
const User = require('../../../../../models/User');
const Floor = require('../../../../../models/Floor');
const Room = require('../../../../../models/Room');
const PushFilter = require('../../../../../models/PushFilter');
const {
  notifyReplyPostAuthor,
  notifyReplyRepliers,
} = require('../../../../../services/timeline/shared/replyParticipantNotifications');
const { replaceSpams } = require('../../../../../services/spam.service');
const translationService = require('../../../../../services/timeline/timelineTranslation.service');
const AppError = require('../../../../../utils/appError');
const logger = require('../../../../../utils/logger');
const { drainBackgroundTasks, getPendingTaskCount } = require('../../../../../services/backgroundTaskRunner');

describe('guestRepliesのサービス', () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    process.env = {
      ...ORIGINAL_ENV,
      ONESIGNAL_APP_ID: 'APPID',
      ONESIGNAL_REST_API_KEYS: 'rest-key',
      ONESIGNAL_HOST: 'onesignal.test',
      ONESIGNAL_PORT: '443',
      ONESIGNAL_PATH: '/api/v1/notifications',
      ONESIGNAL_EXTERNAL_ID_SECRET: 'test-onesignal-external-id-secret-32-bytes',
      VUE_APP_APPURL: 'https://example.com',
    };
  });

  afterEach(async () => {
    await drainBackgroundTasks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  describe('返信作成', () => {
    const BASE_BODY = {
      floor_id: 'floor1',
      floor_title: 'フロア',
      room_id: 'room1',
      room_title: 'ルーム',
      post_id: 'post1',
      guest_id: 'guest123',
      guest_name: 'ゲスト',
      content: 'こんにちは',
      lang: 'ja',
      room_tags: [],
      animation: null,
      keyup: null,
      target_langs: ['en'],
    };

    const setupHappyPathMocks = () => {
      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: false,
        guest_reaction_only: false,
      });

      Floor.findOne.mockResolvedValue({ _id: 'floor1', delete_flg: false });

      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        room: 'room1',
        user: 'authorId',
        replies: [],
        delete_flg: false,
      });

      const populatedChat = {
        _id: 'post1',
        room: { _id: 'room1' },
        replies: [{ guest_id: 'guest123', content: 'CLEAN_こんにちは' }],
      };
      const updatedChat = {
        _id: 'post1',
        user: 'authorId',
        replies: populatedChat.replies,
        populate: jest.fn().mockResolvedValue(populatedChat),
      };
      Chat.findOneAndUpdate.mockResolvedValue(updatedChat);

      User.findOne.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue({
          _id: 'authorId',
          push_enabled: true,
          reply_push_enabled: true,
        }),
      }));

      User.find.mockImplementation(() => ({
        select: jest.fn().mockResolvedValue([]),
      }));

      PushFilter.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });
    };

    const getIoMock = () => {
      const emit = jest.fn();
      const to = jest.fn(() => ({ emit }));
      return { to, _emit: emit };
    };

    test('ゲスト返信を作成し通知・Socketへ通知する', async () => {
      setupHappyPathMocks();
      const io = getIoMock();

      const result = await guestRepliesService.createReply({ ...BASE_BODY }, io);

      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'post1', delete_flg: false },
        {
          $push: expect.objectContaining({
            replies: expect.objectContaining({
              guest_id: 'guest123',
              content: 'CLEAN_こんにちは',
              lang: 'ja',
            }),
          }),
        },
        { new: true, runValidators: true }
      );

      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io._emit).toHaveBeenCalledWith('REPLY_CREATE', result);

      expect(replaceSpams).toHaveBeenCalledWith('こんにちは');

      expect(notifyReplyPostAuthor).toHaveBeenCalledTimes(1);
      expect(notifyReplyPostAuthor).toHaveBeenCalledWith(expect.objectContaining({ senderName: 'ゲスト' }));
      expect(notifyReplyRepliers).toHaveBeenCalledTimes(1);

      await drainBackgroundTasks();
      expect(translationService.translateGuestReplyIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 'post1',
          guestId: 'guest123',
        })
      );
    });

    test('翻訳が未完了でも返信を返し、翻訳処理をdrainまで追跡する', async () => {
      setupHappyPathMocks();
      let finish;
      translationService.translateGuestReplyIfNeeded.mockImplementationOnce(() => new Promise((resolve) => {
        finish = resolve;
      }));
      let result;
      const response = guestRepliesService.createReply(BASE_BODY, getIoMock()).then((value) => { result = value; });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      try {
        expect(result).toEqual(expect.objectContaining({ _id: 'post1' }));
        expect(getPendingTaskCount()).toBe(1);
      } finally {
        finish();
        await response;
        await drainBackgroundTasks();
      }
      expect(getPendingTaskCount()).toBe(0);
    });

    test('翻訳失敗を記録し、保存した返信を成功として返す', async () => {
      setupHappyPathMocks();
      translationService.translateGuestReplyIfNeeded.mockRejectedValueOnce(new Error('translation failed'));
      await expect(guestRepliesService.createReply(BASE_BODY, getIoMock())).resolves.toEqual(
        expect.objectContaining({ _id: 'post1' })
      );
      await drainBackgroundTasks();
      expect(logger.warn).toHaveBeenCalledWith('[background:timeline.guestReplies.create] failed',
        expect.objectContaining({ postId: 'post1', error: 'translation failed' }));
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(getPendingTaskCount()).toBe(0);
    });

    test.each(['to', 'emit'])('Socketの%sが失敗しても保存した返信を返し翻訳を実行する', async (stage) => {
      setupHappyPathMocks();
      const io = getIoMock();
      (stage === 'to' ? io.to : io._emit).mockImplementationOnce(() => { throw new Error('socket failed'); });
      await expect(guestRepliesService.createReply(BASE_BODY, io)).resolves.toEqual(
        expect.objectContaining({ _id: 'post1' })
      );
      await drainBackgroundTasks();
      expect(Chat.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(translationService.translateGuestReplyIfNeeded).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith('[SOCKET] publication failed', { event: 'REPLY_CREATE' });
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    test('Google翻訳無効時も返信を保存し、翻訳クライアント経路を呼ばない', async () => {
      setupHappyPathMocks();
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      const io = getIoMock();

      await expect(guestRepliesService.createReply(BASE_BODY, io)).resolves.toEqual(
        expect.objectContaining({ _id: 'post1' })
      );

      expect(translationService.translateGuestReplyIfNeeded).not.toHaveBeenCalled();
    });

    test('ルームが存在しないと 400', async () => {
      Room.findOne.mockResolvedValue(null);
      await expect(guestRepliesService.createReply({ ...BASE_BODY }, getIoMock())).rejects.toBeInstanceOf(AppError);
    });

    test('メンバー限定ルームにゲストは 401', async () => {
      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: true,
      });
      await expect(guestRepliesService.createReply({ ...BASE_BODY }, getIoMock())).rejects.toBeInstanceOf(AppError);
    });

    test('guest_reaction_only なのに絵文字以外 + move-and-erase は 400', async () => {
      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: false,
        guest_reaction_only: true,
      });
      await expect(
        guestRepliesService.createReply({ ...BASE_BODY, animation: 'move-and-erase' }, getIoMock())
      ).rejects.toBeInstanceOf(AppError);
    });

    test('guest_reaction_only なのに絵文字以外 + animation=null は 400', async () => {
      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: false,
        guest_reaction_only: true,
      });
      await expect(guestRepliesService.createReply({ ...BASE_BODY, animation: null }, getIoMock())).rejects.toBeInstanceOf(
        AppError
      );
    });

    test('フロアが存在しないと 400', async () => {
      Room.findOne.mockResolvedValue({
        _id: 'room1',
        floor: 'floor1',
        delete_flg: false,
        member_only: false,
        guest_reaction_only: false,
      });
      Floor.findOne.mockResolvedValue(null);

      await expect(guestRepliesService.createReply({ ...BASE_BODY }, getIoMock())).rejects.toBeInstanceOf(AppError);
    });

    test('投稿が存在しないと 400', async () => {
      setupHappyPathMocks();
      Chat.findOne.mockResolvedValue(null);

      await expect(guestRepliesService.createReply({ ...BASE_BODY }, getIoMock())).rejects.toBeInstanceOf(AppError);
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      setupHappyPathMocks();
      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        room: 'another-room',
        user: 'authorId',
        replies: [],
        delete_flg: false,
      });

      await expect(guestRepliesService.createReply({ ...BASE_BODY }, getIoMock())).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
