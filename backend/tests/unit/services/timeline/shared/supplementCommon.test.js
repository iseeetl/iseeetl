const ROLES = require('../../../../../constants/roles');
const AppError = require('../../../../../utils/appError');

jest.mock('../../../../../services/timeline/shared/reactionHelpers', () => ({
  findChatOrThrow: jest.fn(),
}));

jest.mock('../../../../../services/timeline/shared/roomConsistency', () => ({
  ensureChatBelongsToRoom: jest.fn(),
  toIdString: (value) => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      if (typeof value.toHexString === 'function') return value.toHexString();
      if (value._id && value._id !== value) return value._id.toString();
    }
    return typeof value.toString === 'function' ? value.toString() : null;
  },
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
jest.mock('../../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
}));

const { findChatOrThrow } = require('../../../../../services/timeline/shared/reactionHelpers');
const { ensureChatBelongsToRoom } = require('../../../../../services/timeline/shared/roomConsistency');
const {
  buildMediaState,
  buildSupplementPayload,
  buildUpdatedSupplementPayload,
  canEditSupplement,
  findChatInRoomOrThrow,
  findReplyInChatOrThrow,
  findSupplementOrThrow,
} = require('../../../../../services/timeline/shared/supplementCommon');

describe('付加情報の共通処理', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
  });

  describe('ルーム内の投稿取得', () => {
    test('投稿取得後にルーム整合を検証して返す', async () => {
      const chat = { _id: 'post1', room: 'room1' };
      findChatOrThrow.mockResolvedValue(chat);

      await expect(findChatInRoomOrThrow({ postId: 'post1', room: 'room1' })).resolves.toBe(chat);
      expect(findChatOrThrow).toHaveBeenCalledWith('post1');
      expect(ensureChatBelongsToRoom).toHaveBeenCalledWith(chat, 'room1', 'INVALID_PARAMS');
    });

    test('findChatOrThrow の AppError を指定コードへ変換', async () => {
      findChatOrThrow.mockRejectedValue(new AppError({ code: 'INVALID_PARAMS' }));
      await expect(
        findChatInRoomOrThrow({ postId: 'post1', room: 'room1', notFoundCode: 'NOT_FOUND' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    test('AppError以外のエラーはそのまま再送出する', async () => {
      const error = new Error('db down');
      findChatOrThrow.mockRejectedValue(error);
      await expect(findChatInRoomOrThrow({ postId: 'post1', room: 'room1' })).rejects.toBe(error);
    });
  });

  describe('付加情報の編集権限', () => {
    const floor = { user: 'owner1' };

    test('管理者は許可', () => {
      expect(
        canEditSupplement({
          role: ROLES.ADMINISTRATOR,
          floor,
          floorMember: null,
          supplementUser: 'u2',
          userId: 'u1',
        })
      ).toBe(true);
    });

    test('フロア編集ユーザかつ floor.user 一致は許可', () => {
      expect(
        canEditSupplement({
          role: ROLES.EDITOR,
          floor,
          floorMember: null,
          supplementUser: 'u2',
          userId: 'owner1',
        })
      ).toBe(true);
    });

    test('floorMember 非 null は許可', () => {
      expect(
        canEditSupplement({
          role: 'User',
          floor,
          floorMember: { _id: 'member1' },
          supplementUser: 'u2',
          userId: 'u1',
        })
      ).toBe(true);
    });

    test('付加情報作成者本人は許可', () => {
      expect(
        canEditSupplement({
          role: 'User',
          floor,
          floorMember: null,
          supplementUser: { _id: 'u1' },
          userId: 'u1',
        })
      ).toBe(true);
    });

    test('それ以外は拒否', () => {
      expect(
        canEditSupplement({
          role: 'User',
          floor,
          floorMember: null,
          supplementUser: 'u2',
          userId: 'u1',
        })
      ).toBe(false);
    });
  });

  describe('投稿内の返信取得', () => {
    test('返信を返す', () => {
      const reply = { _id: 'r1', delete_flg: false };
      const chat = { replies: [reply] };
      expect(findReplyInChatOrThrow({ chat, replyId: 'r1' })).toBe(reply);
    });

    test('excludeDeleted=true で delete_flg=true は除外', () => {
      const chat = { replies: [{ _id: 'r1', delete_flg: true }] };
      expect(() =>
        findReplyInChatOrThrow({ chat, replyId: 'r1', code: 'NOT_FOUND', excludeDeleted: true })
      ).toThrow(AppError);
    });
  });

  describe('付加情報取得', () => {
    test('付加情報を返す', () => {
      const supplement = { _id: 's1', delete_flg: false };
      expect(findSupplementOrThrow({ supplementaries: [supplement], supplementId: 's1' })).toBe(supplement);
    });

    test('excludeDeleted=true で delete_flg=true は除外', () => {
      expect(() =>
        findSupplementOrThrow({
          supplementaries: [{ _id: 's1', delete_flg: true }],
          supplementId: 's1',
          code: 'NOT_FOUND',
          excludeDeleted: true,
        })
      ).toThrow(AppError);
    });
  });

  describe('付加情報のデータ生成', () => {
    test('buildSupplementPayload: 入力を付加情報形式へ変換', () => {
      expect(
        buildSupplementPayload({
          userId: 'u1',
          replacedContent: 'clean',
          lang: 'ja',
          imageName: 'i',
          imageThumbnailName: 'it',
          imageCaption: 'ic',
          videoName: 'v',
          videoThumbnailName: 'vt',
          videoSubtitleOriginalname: 'vso',
          videoSubtitleName: 'vs',
          audioName: 'a',
          audioTitle: 'at',
          audioDescription: 'ad',
        })
      ).toEqual(
        expect.objectContaining({
          user: 'u1',
          content: 'clean',
          lang: 'ja',
          image_name: 'i',
          video_subtitle_name: 'vs',
          audio_description: 'ad',
        })
      );
    });

    test('buildUpdatedSupplementPayload: 内容変更時は翻訳をクリア', () => {
      const supplement = {
        content: 'before',
        lang: 'ja',
        toObject() {
          return { content: 'before', lang: 'ja', translations: [{ lang: 'en', content: 'x' }] };
        },
      };
      const updated = buildUpdatedSupplementPayload({
        supplement,
        replacedContent: 'after',
        lang: 'ja',
        imageName: '',
        imageThumbnailName: '',
        imageCaption: '',
        videoName: '',
        videoThumbnailName: '',
        videoSubtitleOriginalname: '',
        videoSubtitleName: '',
        audioName: '',
        audioTitle: '',
        audioDescription: '',
      });
      expect(updated.translations).toEqual([]);
      expect(updated.updated_at).toEqual(expect.any(Number));
    });

    test('buildUpdatedSupplementPayload: 内容同一時は翻訳を維持', () => {
      const supplement = {
        content: 'same',
        lang: 'ja',
        toObject() {
          return { content: 'same', lang: 'ja', translations: [{ lang: 'en', content: 'x' }] };
        },
      };
      const updated = buildUpdatedSupplementPayload({
        supplement,
        replacedContent: 'same',
        lang: 'ja',
        imageName: '',
        imageThumbnailName: '',
        imageCaption: '',
        videoName: '',
        videoThumbnailName: '',
        videoSubtitleOriginalname: '',
        videoSubtitleName: '',
        audioName: '',
        audioTitle: '',
        audioDescription: '',
      });
      expect(updated.translations).toEqual([{ lang: 'en', content: 'x' }]);
    });

    test('buildUpdatedSupplementPayload: lang変更時は翻訳をクリア', () => {
      const supplement = {
        content: 'same',
        lang: 'en',
        toObject() {
          return { content: 'same', lang: 'en', translations: [{ lang: 'ja', content: '以前' }] };
        },
      };
      const updated = buildUpdatedSupplementPayload({
        supplement,
        replacedContent: 'same',
        lang: 'ja',
        imageName: '',
        imageThumbnailName: '',
        imageCaption: '',
        videoName: '',
        videoThumbnailName: '',
        videoSubtitleOriginalname: '',
        videoSubtitleName: '',
        audioName: '',
        audioTitle: '',
        audioDescription: '',
      });
      expect(updated.translations).toEqual([]);
    });

    test('buildUpdatedSupplementPayload: 翻訳無効時は内容変更後も保存済み翻訳を維持', () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      const supplement = {
        content: 'before',
        lang: 'ja',
        toObject() {
          return { content: 'before', lang: 'ja', translations: [{ lang: 'en', content: 'x' }] };
        },
      };

      const updated = buildUpdatedSupplementPayload({
        supplement,
        replacedContent: 'after',
        lang: 'ja',
        imageName: '',
        imageThumbnailName: '',
        imageCaption: '',
        videoName: '',
        videoThumbnailName: '',
        videoSubtitleOriginalname: '',
        videoSubtitleName: '',
        audioName: '',
        audioTitle: '',
        audioDescription: '',
      });

      expect(updated.translations).toEqual([{ lang: 'en', content: 'x' }]);
    });

    test('buildMediaState: deleteMediaDiff 用の構造を返す', () => {
      expect(
        buildMediaState({
          imageName: 'i',
          imageThumbnailName: 'it',
          videoName: 'v',
          videoThumbnailName: 'vt',
          videoSubtitleName: 'vs',
          audioName: 'a',
        })
      ).toEqual({
        image: { main: 'i', thumb: 'it' },
        video: { main: 'v', thumb: 'vt', subtitle: 'vs' },
        audio: { main: 'a' },
      });
    });
  });
});
