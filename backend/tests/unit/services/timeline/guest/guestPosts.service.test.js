jest.mock('../../../../../models/Chat', () => ({
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../../../../../models/Room', () => ({ findOne: jest.fn() }));
jest.mock('../../../../../config/application', () => ({
  getApplicationConfig: () => ({ appUrl: 'https://example.invalid' }),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));
jest.mock('../../../../../services/_shared/activeResource', () => ({
  findActiveRoom: jest.fn(),
}));

jest.mock('../../../../../services/timeline/shared/timelineSerializer', () => jest.fn((v) => v));

jest.mock('../../../../../services/spam.service', () => ({ replaceSpams: jest.fn() }));
jest.mock('../../../../../services/timeline/timelineTranslation.service', () => ({
  translateGuestMainContentIfNeeded: jest.fn().mockResolvedValue(),
}));
jest.mock('../../../../../services/backgroundTaskRunner', () => ({
  runBackgroundTask: jest.fn((_label, task) => task()),
}));

jest.mock('../../../../../services/timeline/shared/timelineList', () => ({ listTimelineChats: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/guestAccess', () => ({ ensureGuestRoomContext: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/guestRules', () => ({ containsOnlyAllowedEmojis: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/pushFilterNotification', () => ({
  buildSnippet: jest.fn(() => 'snippet'),
  notifyPushFilterUsers: jest.fn(),
}));

jest.mock(
  '../../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

const Chat = require('../../../../../models/Chat');
const { findActiveRoom } = require('../../../../../services/_shared/activeResource');
const serializeTimeline = require('../../../../../services/timeline/shared/timelineSerializer');
const { replaceSpams } = require('../../../../../services/spam.service');
const { translateGuestMainContentIfNeeded } = require('../../../../../services/timeline/timelineTranslation.service');
const { listTimelineChats } = require('../../../../../services/timeline/shared/timelineList');
const { ensureGuestRoomContext } = require('../../../../../services/timeline/shared/guestAccess');
const { containsOnlyAllowedEmojis } = require('../../../../../services/timeline/shared/guestRules');
const { notifyPushFilterUsers } = require('../../../../../services/timeline/shared/pushFilterNotification');
const { runBackgroundTask } = require('../../../../../services/backgroundTaskRunner');
const { TIMELINE_POPULATE_WITH_REACTIONS, TIMELINE_POPULATE_WITH_REPLIES } = require('../../../../../services/timeline/shared/chatPopulate');
const AppError = require('../../../../../utils/appError');

const service = require('../../../../../services/timeline/guest/guestPosts.service');

const objId = (val) => ({ toString: () => val });

const buildChatDoc = (doc) => ({
  ...doc,
  populate: jest.fn().mockResolvedValue(doc),
});

describe('guestPostsのサービス', () => {
  const io = { to: jest.fn(() => ({ emit: jest.fn() })) };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
  });

  describe('投稿一覧取得', () => {
    test('ゲストルームチェック後に一覧取得', async () => {
      ensureGuestRoomContext.mockResolvedValue({});
      listTimelineChats.mockResolvedValue([{ _id: 'p1' }]);

      const res = await service.getPosts({ room_id: 'r1' });

      expect(ensureGuestRoomContext).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ notFound: expect.any(Object), memberOnly: expect.any(Object) })
      );
      expect(listTimelineChats).toHaveBeenCalledWith({
        body: { room_id: 'r1' },
        populate: TIMELINE_POPULATE_WITH_REACTIONS,
      });
      expect(res).toEqual([{ _id: 'p1' }]);
    });
  });

  describe('投稿詳細取得', () => {
    test('null の場合は null を返す', async () => {
      Chat.findOne.mockResolvedValue(null);

      const res = await service.getPostDetail({ post_id: 'p1' });

      expect(res).toBeNull();
      expect(ensureGuestRoomContext).not.toHaveBeenCalled();
    });

    test('投稿詳細を返す', async () => {
      const doc = buildChatDoc({ _id: 'p1', room: objId('r1') });
      Chat.findOne.mockResolvedValue(doc);
      ensureGuestRoomContext.mockResolvedValue({});
      serializeTimeline.mockReturnValue(doc);

      const res = await service.getPostDetail({ post_id: 'p1' });

      expect(Chat.findOne).toHaveBeenCalledWith({ _id: 'p1', delete_flg: false });
      expect(doc.populate).toHaveBeenCalledWith(TIMELINE_POPULATE_WITH_REPLIES);
      expect(ensureGuestRoomContext).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ notFound: expect.any(Object), memberOnly: expect.any(Object) })
      );
      expect(res).toEqual(doc);
    });
  });

  describe('投稿作成', () => {
    const baseBody = {
      floor_id: 'f1',
      floor_title: 'F',
      room_id: 'r1',
      room_title: 'R',
      guest_id: 'g1',
      guest_name: 'Guest',
      content: 'hello',
      lang: 'ja',
      room_tags: [],
      animation: null,
      keyup: null,
      target_langs: ['en'],
    };

    test('ルームが無い場合は 400', async () => {
      findActiveRoom.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
      await expect(service.createPost(baseBody, io)).rejects.toBeInstanceOf(AppError);
    });

    test('guest_reaction_only で不正本文', async () => {
      findActiveRoom.mockResolvedValue({ _id: 'r1', guest_reaction_only: true });
      containsOnlyAllowedEmojis.mockReturnValue(false);

      await expect(
        service.createPost({ ...baseBody, animation: 'move-and-erase', content: 'text' }, io)
      ).rejects.toBeInstanceOf(AppError);
    });

    test('guest_reaction_only で animation=null でも不正本文を拒否', async () => {
      findActiveRoom.mockResolvedValue({ _id: 'r1', guest_reaction_only: true });
      containsOnlyAllowedEmojis.mockReturnValue(false);

      await expect(service.createPost({ ...baseBody, animation: null, content: 'text' }, io)).rejects.toBeInstanceOf(
        AppError
      );
    });

    test('作成して通知/翻訳を呼ぶ', async () => {
      const foundRoom = { _id: 'r1', guest_reaction_only: false };
      const foundFloor = { _id: 'f1' };
      findActiveRoom.mockResolvedValue(foundRoom);
      ensureGuestRoomContext.mockResolvedValue({ floor: foundFloor });
      replaceSpams.mockResolvedValue('REPLACED');
      Chat.create.mockResolvedValue({ _id: 'p1', room: objId('r1') });

      await service.createPost(baseBody, io);

      expect(Chat.create).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'REPLACED', guest_name: 'Guest', room: 'r1' })
      );
      expect(notifyPushFilterUsers).toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith('r1');
      expect(translateGuestMainContentIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: 'p1', guestId: 'g1', content: 'REPLACED' })
      );
    });

    test('Google翻訳無効時も作成を成功させ、翻訳処理を登録しない', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      const foundRoom = { _id: 'r1', guest_reaction_only: false };
      findActiveRoom.mockResolvedValue(foundRoom);
      ensureGuestRoomContext.mockResolvedValue({ floor: { _id: 'f1' } });
      replaceSpams.mockResolvedValue('REPLACED');
      Chat.create.mockResolvedValue({ _id: 'p1', room: objId('r1') });

      await expect(service.createPost(baseBody, io)).resolves.toEqual(
        expect.objectContaining({ _id: 'p1' })
      );

      expect(runBackgroundTask).not.toHaveBeenCalled();
      expect(translateGuestMainContentIfNeeded).not.toHaveBeenCalled();
    });
  });
});
