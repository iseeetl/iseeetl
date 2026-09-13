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

const ORIGINAL_ENV = process.env;
process.env = {
  ...ORIGINAL_ENV,
  MEDIA_PATH: '/tmp/media',
  VUE_APP_APPURL: 'http://localhost:3000',
  ONESIGNAL_APP_ID: 'test-app',
  ONESIGNAL_REST_API_KEYS: 'rest-key',
  ONESIGNAL_HOST: 'onesignal.test',
  ONESIGNAL_PORT: '443',
  ONESIGNAL_PATH: '/api/v1/notifications',
  ONESIGNAL_EXTERNAL_ID_SECRET: 'test-onesignal-external-id-secret-32-bytes',
};

jest.mock('../../../../models/Chat', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../../../../models/User.js', () => ({ findOne: jest.fn() }));
jest.mock('../../../../models/PushFilter', () => ({ find: jest.fn() }));

jest.mock('../../../../services/room/roomAccess.service', () => ({
  authorizeRoomAccess: jest.fn(),
  filterAuthorizedRoomUserIds: jest.fn(async (userIds) => userIds),
}));
jest.mock('../../../../services/timeline/shared/timelineSerializer', () => jest.fn());
jest.mock('../../../../services/media/fileCleanup', () => ({
  deleteMediaDiff: jest.fn().mockResolvedValue(true),
  deleteMediaItem: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../../services/spam.service', () => ({ replaceSpams: jest.fn((v) => `clean-${v}`) }));
jest.mock('../../../../services/timeline/timelineTranslation.service', () => ({
  translateSupplementIfNeeded: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../../../integrations/onesignal/notification.client', () => ({
  dispatchNotification: jest.fn(),
}));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(message, statusCode) {
      this.message = message;
      this.statusCode = statusCode;
    }
);

jest.mock('../../../../services/timeline/shared/matchConditions', () => jest.fn(() => true));

const path = require('path');
const service = require('../../../../services/timeline/postSupplements.service');
const { validateMediaChanges } = require('../../../../services/media/reference');
const Chat = require('../../../../models/Chat');
const PushFilter = require('../../../../models/PushFilter');
const { authorizeRoomAccess } = require('../../../../services/room/roomAccess.service');
const serializeTimeline = require('../../../../services/timeline/shared/timelineSerializer');
const { deleteMediaDiff, deleteMediaItem } = require('../../../../services/media/fileCleanup');
const { dispatchNotification } = require('../../../../integrations/onesignal/notification.client');
const { buildOneSignalExternalId } = require('../../../../integrations/onesignal/identity');
const { translateSupplementIfNeeded } = require('../../../../services/timeline/timelineTranslation.service');
const AppError = require('../../../../utils/appError');

const chainPopulate = (doc) => ({
  populate: jest.fn().mockResolvedValue(doc),
});

const chainSelect = (val) => ({
  select: jest.fn().mockResolvedValue(val),
});

const chainPopulateForPushFilters = (arr) => ({
  populate: jest.fn().mockResolvedValue(arr),
});

describe('投稿の付加情報のサービス', () => {
  jest.useFakeTimers();

  const io = {
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
  };

  const authBase = {
    foundUser: { _id: 'uid1', username: 'Alice' },
    foundRoom: { _id: 'room1', title: 'Room' },
    foundFloor: { _id: 'floor1', title: 'Floor', user: 'editorId' },
    foundFloorMember: null,
  };

  const buildChat = (supplements = []) => ({
    _id: 'chat1',
    room: 'room1',
    user: 'authorId',
    supplementaries: supplements,
  });

  const populatedStub = {
    _id: 'chat1',
    room: { _id: 'room1' },
    supplementaries: [{ _id: 'sup1', content: 'clean-c', lang: 'ja' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    serializeTimeline.mockReturnValue(populatedStub);

    PushFilter.find.mockReturnValue(chainPopulateForPushFilters([]));

    const authorSelect = chainSelect({ _id: 'authorId' });
    require('../../../../models/User.js').findOne.mockReturnValue(authorSelect);
  });

  afterAll(() => {
    jest.useRealTimers();
    process.env = ORIGINAL_ENV;
  });

  const flushTimers = async () => {
    jest.runOnlyPendingTimers();
    await Promise.resolve();
  };

  describe('作成', () => {
    const baseBody = {
      floor_id: 'floor1',
      floor_title: 'Floor',
      room_id: 'room1',
      room_title: 'Room',
      user_id: 'uid1',
      user_name: 'Alice',
      post_id: 'chat1',
      content: 'c',
      lang: 'ja',
      keyup: '',
      image_name: '',
      image_thumbnail_name: '',
      image_caption: '',
      video_name: '',
      video_thumbnail_name: '',
      video_subtitle_originalname: '',
      video_subtitle_name: '',
      audio_name: '',
      audio_title: '',
      audio_description: '',
      target_langs: ['en'],
    };
    const jwt = { user_id: 'uid1', user_role: 'User' };

    test('付加情報を作成して通知・翻訳・Socket通知・無害化処理を行う', async () => {
      Chat.findOne.mockResolvedValue(buildChat());
      Chat.findOneAndUpdate.mockResolvedValue(chainPopulate({ any: 'populated' }));
      authorizeRoomAccess.mockResolvedValue(authBase);

      PushFilter.find.mockReturnValue(
        chainPopulateForPushFilters([
          { user: { _id: 'u1', push_enabled: true } },
          { user: { _id: 'uid1', push_enabled: true } },
        ])
      );

      await expect(service.create(baseBody, jwt, io)).resolves.toEqual(populatedStub);

      expect(validateMediaChanges).toHaveBeenCalledWith(
        expect.objectContaining({ userId: jwt.user_id, newItem: baseBody })
      );
      expect(Chat.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'chat1', room: 'room1', delete_flg: false },
        expect.objectContaining({
          $push: {
            supplementaries: expect.objectContaining({
              content: 'clean-c',
              lang: 'ja',
            }),
          },
        }),
        { new: true, runValidators: true }
      );

      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io.to().emit).toHaveBeenCalledWith('SUPPLEMENT_CREATE', populatedStub);

      expect(dispatchNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          app_id: 'test-app',
          include_external_user_ids: [buildOneSignalExternalId('authorId')],
          channel_for_external_user_ids: 'push',
          headings: expect.objectContaining({ ja: expect.any(String), en: expect.any(String) }),
          contents: expect.objectContaining({
            ja: expect.stringContaining('Alice'),
            en: expect.stringContaining('Alice'),
          }),
          url: 'http://localhost:3000/floor/floor1/room/room1',
        })
      );

      expect(dispatchNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          include_external_user_ids: [buildOneSignalExternalId('u1')],
          url: 'http://localhost:3000/floor/floor1/room/room1',
        })
      );

      await flushTimers();
      expect(translateSupplementIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: populatedStub._id,
          supplementId: expect.any(String),
          content: expect.any(String),
          lang: 'ja',
          targetLangs: ['en'],
          userId: 'uid1',
          io,
        })
      );
    });

    test('Google翻訳無効時も付加情報を保存し、翻訳処理を起動しない', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      Chat.findOne.mockResolvedValue(buildChat());
      Chat.findOneAndUpdate.mockResolvedValue(chainPopulate({ any: 'populated' }));
      authorizeRoomAccess.mockResolvedValue(authBase);

      await expect(service.create(baseBody, jwt, io)).resolves.toEqual(populatedStub);
      await flushTimers();

      expect(Chat.findOneAndUpdate).toHaveBeenCalled();
      expect(translateSupplementIfNeeded).not.toHaveBeenCalled();
    });

    test('target_langs省略時はフロア設定とルーム接続言語から翻訳先を解決する', async () => {
      Chat.findOne.mockResolvedValue(buildChat());
      Chat.findOneAndUpdate.mockResolvedValue(chainPopulate({ any: 'populated' }));
      authorizeRoomAccess.mockResolvedValue({
        ...authBase,
        foundFloor: { ...authBase.foundFloor, target_langs: ['en', 'ja'] },
      });
      const requestWithoutTargets = { ...baseBody };
      delete requestWithoutTargets.target_langs;
      const ioWithLanguages = {
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
        roomLanguageProvider: { getLanguages: jest.fn(() => ['fr', 'ja']) },
      };

      await service.create(requestWithoutTargets, jwt, ioWithLanguages);
      await flushTimers();

      expect(translateSupplementIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ targetLangs: ['en', 'fr'], io: ioWithLanguages })
      );
    });

    test('投稿が存在しない -> AppError', async () => {
      Chat.findOne.mockResolvedValue(null);
      authorizeRoomAccess.mockResolvedValue(authBase);
      await expect(service.create(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      Chat.findOne.mockResolvedValue({ ...buildChat(), room: 'another-room' });
      authorizeRoomAccess.mockResolvedValue(authBase);

      await expect(service.create(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('競合で findOneAndUpdate が null を返す', async () => {
      Chat.findOne.mockResolvedValue(buildChat());
      Chat.findOneAndUpdate.mockResolvedValue(null);
      authorizeRoomAccess.mockResolvedValue(authBase);

      await expect(service.create(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('ルームアクセス拒否 -> AppError', async () => {
      Chat.findOne.mockResolvedValue(buildChat());
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'FORBIDDEN' }));
      await expect(service.create(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('更新', () => {
    const baseBody = {
      floor_id: 'floor1',
      floor_title: 'Floor',
      room_id: 'room1',
      room_title: 'Room',
      user_id: 'uidSelf',
      user_name: 'Bob',
      post_id: 'chat1',
      _id: 'sup1',
      content: 'new',
      lang: 'en',
      keyup: '',
      image_name: '',
      image_thumbnail_name: '',
      image_caption: '',
      video_name: '',
      video_thumbnail_name: '',
      video_subtitle_originalname: '',
      video_subtitle_name: '',
      audio_name: '',
      audio_title: '',
      audio_description: '',
      target_langs: ['ja'],
    };

    const makeSuppl = (uid = 'uidSelf') => {
      const sup = {
        _id: 'sup1',
        user: uid,
        content: 'old',
        lang: 'en',
        image_name: 'old_i',
        image_thumbnail_name: 'old_it',
        video_name: 'old_v',
        video_thumbnail_name: 'old_vt',
        video_subtitle_name: 'old_vs',
        audio_name: 'old_a',
        toObject: function () {
          return { ...this };
        },
      };
      return sup;
    };

    beforeEach(() => {
      Chat.findOneAndUpdate.mockResolvedValue(chainPopulate({ any: 'populated' }));
    });

    test('管理者は翻訳の消去・不要メディアの削除・Socket通知・再翻訳を伴う更新ができる', async () => {
      const chat = buildChat([makeSuppl()]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue(authBase);
      const jwt = { user_id: 'admin', user_role: 'Administrator' };

      await expect(service.update(baseBody, jwt, io)).resolves.toEqual(populatedStub);

      const [queryArg, updateArg, opts] = Chat.findOneAndUpdate.mock.calls[0];
      expect(queryArg.supplementaries.$elemMatch).toEqual(
        expect.objectContaining({
          _id: 'sup1',
          delete_flg: false,
          content: 'old',
        })
      );
      expect(updateArg.$set).toEqual(
        expect.objectContaining({
          'supplementaries.$[supplement].content': 'clean-new',
          'supplementaries.$[supplement].lang': 'en',
          'supplementaries.$[supplement].translations': [],
          'supplementaries.$[supplement].updated_at': expect.any(Number),
        })
      );
      expect(Object.keys(updateArg.$set)).not.toContain('supplementaries.$[supplement]');
      expect(Object.keys(updateArg.$set)).not.toContain(
        'supplementaries.$[supplement].reactions'
      );
      expect(opts).toEqual({
        arrayFilters: [{ 'supplement._id': 'sup1', 'supplement.delete_flg': false }],
        new: true,
        runValidators: true,
      });

      expect(deleteMediaDiff).toHaveBeenCalledWith(
        expect.objectContaining({
          floorId: 'floor1',
          roomId: 'room1',
          oldMedia: expect.objectContaining({
            image: { main: 'old_i', thumb: 'old_it' },
            video: { main: 'old_v', thumb: 'old_vt', subtitle: 'old_vs' },
            audio: { main: 'old_a' },
          }),
          newMedia: expect.objectContaining({
            image: { main: '', thumb: '' },
            video: { main: '', thumb: '', subtitle: '' },
            audio: { main: '' },
          }),
        })
      );

      expect(io.to().emit).toHaveBeenCalledWith('SUPPLEMENT_UPDATE', populatedStub);

      await flushTimers();
      expect(translateSupplementIfNeeded).toHaveBeenCalled();
    });

    test('翻訳トリガ条件: 内容変更なしなら translateSupplementIfNeeded は呼ばれない', async () => {
      const sup = makeSuppl();
      sup.content = 'clean-same';
      const chat = buildChat([sup]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue(authBase);
      const jwt = { user_id: 'admin', user_role: 'Administrator' };

      const body = { ...baseBody, content: 'same' };
      translateSupplementIfNeeded.mockClear();

      await service.update(body, jwt, io);
      await flushTimers();
      expect(translateSupplementIfNeeded).not.toHaveBeenCalled();
    });

    test('翻訳トリガ条件: 内容同一でもlang変更時は翻訳をクリアして再翻訳する', async () => {
      const sup = makeSuppl();
      sup.content = 'clean-same';
      sup.lang = 'ja';
      sup.translations = [{ lang: 'en', content: 'before' }];
      const chat = buildChat([sup]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue(authBase);
      const jwt = { user_id: 'admin', user_role: 'Administrator' };

      await service.update({ ...baseBody, content: 'same', lang: 'en' }, jwt, io);

      expect(Chat.findOneAndUpdate.mock.calls[0][1].$set).toEqual(
        expect.objectContaining({
          'supplementaries.$[supplement].lang': 'en',
          'supplementaries.$[supplement].translations': [],
        })
      );
      await flushTimers();
      expect(translateSupplementIfNeeded).toHaveBeenCalled();
    });

    test('部分更新は指定項目だけを保存し、同時更新されたメディア・メタデータ・リアクションを保持する', async () => {
      const supplement = makeSuppl();
      supplement.lang = 'ja';
      supplement.video_name = null;
      supplement.video_thumbnail_name = null;
      supplement.video_subtitle_name = null;
      supplement.audio_name = null;
      supplement.meta = { source: 'existing' };
      supplement.reactions = [{ emoji: '👍' }];
      const chat = buildChat([supplement]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue({
        ...authBase,
        foundFloor: { ...authBase.foundFloor, target_langs: ['en', 'ja'] },
      });
      const ioWithLanguages = {
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
        roomLanguageProvider: { getLanguages: jest.fn(() => ['fr']) },
      };
      const partialBody = {
        room_id: 'room1',
        post_id: 'chat1',
        _id: 'sup1',
        content: 'new',
        lang: 'ja',
      };
      const jwt = { user_id: 'admin', user_role: 'Administrator' };

      await service.update(partialBody, jwt, ioWithLanguages);
      await flushTimers();

      expect(validateMediaChanges).toHaveBeenCalledWith(
        expect.objectContaining({
          oldItem: supplement,
          newItem: expect.objectContaining({
            image_name: 'old_i',
            image_thumbnail_name: 'old_it',
          }),
        })
      );
      const [queryArg, updateArg] = Chat.findOneAndUpdate.mock.calls[0];
      expect(queryArg.supplementaries.$elemMatch).toEqual({
        _id: 'sup1',
        delete_flg: false,
        content: 'old',
        lang: 'ja',
      });
      expect(updateArg.$set).toEqual({
        'supplementaries.$[supplement].updated_at': expect.any(Number),
        'supplementaries.$[supplement].content': 'clean-new',
        'supplementaries.$[supplement].lang': 'ja',
        'supplementaries.$[supplement].translations': [],
      });
      expect(deleteMediaDiff).toHaveBeenCalledWith(
        expect.objectContaining({
          newMedia: expect.objectContaining({ image: { main: 'old_i', thumb: 'old_it' } }),
        })
      );
      expect(translateSupplementIfNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ targetLangs: ['en', 'fr'], io: ioWithLanguages })
      );
    });

    test('本文未指定でもlang変更時は翻訳だけをクリアし、本文・リアクションを上書きしない', async () => {
      const supplement = makeSuppl();
      supplement.lang = 'ja';
      supplement.translations = [{ lang: 'en', content: 'translated' }];
      supplement.reactions = [{ emoji: '👍' }];
      Chat.findOne.mockResolvedValue(buildChat([supplement]));
      authorizeRoomAccess.mockResolvedValue(authBase);

      await service.update(
        { room_id: 'room1', post_id: 'chat1', _id: 'sup1', lang: 'en' },
        { user_id: 'admin', user_role: 'Administrator' },
        io
      );

      const [queryArg, updateArg] = Chat.findOneAndUpdate.mock.calls[0];
      expect(queryArg.supplementaries.$elemMatch).toEqual({
        _id: 'sup1',
        delete_flg: false,
        lang: 'ja',
      });
      expect(updateArg.$set).toEqual({
        'supplementaries.$[supplement].updated_at': expect.any(Number),
        'supplementaries.$[supplement].lang': 'en',
        'supplementaries.$[supplement].translations': [],
      });
      expect(require('../../../../services/spam.service').replaceSpams).not.toHaveBeenCalled();
      await flushTimers();
      expect(translateSupplementIfNeeded).not.toHaveBeenCalled();
    });

    test('スナップショットと同じ項目が競合した場合は更新失敗として扱う', async () => {
      const supplement = makeSuppl();
      supplement.lang = 'ja';
      Chat.findOne.mockResolvedValue(buildChat([supplement]));
      Chat.findOneAndUpdate.mockResolvedValue(null);
      authorizeRoomAccess.mockResolvedValue(authBase);

      await expect(
        service.update(
          { room_id: 'room1', post_id: 'chat1', _id: 'sup1', content: 'new' },
          { user_id: 'admin', user_role: 'Administrator' },
          io
        )
      ).rejects.toBeInstanceOf(AppError);

      expect(Chat.findOneAndUpdate.mock.calls[0][0].supplementaries.$elemMatch).toEqual({
        _id: 'sup1',
        delete_flg: false,
        content: 'old',
        lang: 'ja',
      });
      expect(deleteMediaDiff).not.toHaveBeenCalled();
      expect(io.to().emit).not.toHaveBeenCalledWith('SUPPLEMENT_UPDATE', expect.anything());
    });

    test('権限: 権限不足で 401', async () => {
      const chat = buildChat([makeSuppl('other')]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue({ ...authBase, foundFloorMember: null });

      const jwt = { user_id: 'uidX', user_role: 'User' };
      await expect(service.update(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('付加情報が存在しない', async () => {
      const chat = buildChat([]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue(authBase);

      const jwt = { user_id: 'admin', user_role: 'Administrator' };
      await expect(service.update(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      const chat = { ...buildChat([makeSuppl()]), room: 'another-room' };
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue(authBase);

      const jwt = { user_id: 'admin', user_role: 'Administrator' };
      await expect(service.update(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('競合で findOneAndUpdate が null を返す', async () => {
      const chat = buildChat([makeSuppl()]);
      Chat.findOne.mockResolvedValue(chat);
      Chat.findOneAndUpdate.mockResolvedValue(null);
      authorizeRoomAccess.mockResolvedValue(authBase);

      const jwt = { user_id: 'admin', user_role: 'Administrator' };
      await expect(service.update(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('フロアを作成した編集ユーザは更新できる', async () => {
      const chat = buildChat([makeSuppl('someone')]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue({
        ...authBase,
        foundFloor: { ...authBase.foundFloor, user: 'editorX' },
      });

      const jwt = { user_id: 'editorX', user_role: 'Editor' };
      await expect(service.update(baseBody, jwt, io)).resolves.toEqual(populatedStub);
    });

    test('フロアメンバーは更新できる', async () => {
      const chat = buildChat([makeSuppl('someone')]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue({ ...authBase, foundFloorMember: { _id: 'member1' } });

      const jwt = { user_id: 'uidX', user_role: 'User' };
      await expect(service.update(baseBody, jwt, io)).resolves.toEqual(populatedStub);
    });
  });

  describe('削除', () => {
    const baseBody = {
      floor_id: 'floor1',
      floor_title: 'Floor',
      room_id: 'room1',
      room_title: 'Room',
      user_id: 'uidSelf',
      user_name: 'Bob',
      post_id: 'chat1',
      _id: 'sup1',
    };

    const makeSuppl = (uid = 'uidSelf', deleted = false) => ({
      _id: 'sup1',
      user: uid,
      delete_flg: deleted,
      image_name: 'img',
      image_thumbnail_name: 'img_t',
      video_name: 'vid',
      video_thumbnail_name: 'vid_t',
      video_subtitle_name: 'vid_s',
      audio_name: 'aud',
    });

    beforeEach(() => {
      Chat.findOneAndUpdate.mockResolvedValue(chainPopulate({ any: 'populated' }));
    });

    test('作成者本人は付加情報とメディアを削除してSocketへ通知できる', async () => {
      const chat = buildChat([makeSuppl()]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue({ ...authBase, foundFloorMember: null });

      const jwt = { user_id: 'uidSelf', user_role: 'User' };

      await expect(service.delete(baseBody, jwt, io)).resolves.toEqual(populatedStub);

      const [queryArg, setArg, optionsArg] = Chat.findOneAndUpdate.mock.calls[0];
      expect(queryArg.supplementaries.$elemMatch).toEqual(expect.objectContaining({
        _id: 'sup1',
        delete_flg: false,
        image_name: 'img',
        image_thumbnail_name: 'img_t',
        video_name: 'vid',
        audio_name: 'aud',
      }));
      expect(optionsArg.arrayFilters[0]).toEqual(expect.objectContaining({
        'supplement.image_name': 'img',
        'supplement.video_name': 'vid',
        'supplement.audio_name': 'aud',
      }));
      expect(setArg.$set).toEqual(
        expect.objectContaining({
          'supplementaries.$[supplement].delete_flg': true,
          'supplementaries.$[supplement].updated_at': expect.any(Number),
          'supplementaries.$[supplement].deleted_at': expect.any(Number),
        })
      );

      expect(deleteMediaItem).toHaveBeenCalledWith(
        path.join('/tmp/media', 'floor1', 'room1'),
        expect.objectContaining({ _id: 'sup1' })
      );

      expect(io.to().emit).toHaveBeenCalledWith('SUPPLEMENT_DELETE', populatedStub);
    });

    test('付加情報が存在しないか削除済みなら拒否する', async () => {
      Chat.findOne.mockResolvedValue(buildChat([]));
      authorizeRoomAccess.mockResolvedValue(authBase);

      const jwt = { user_id: 'uid1', user_role: 'User' };
      await expect(service.delete(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);

      Chat.findOne.mockResolvedValue(buildChat([makeSuppl('uid1', true)]));
      await expect(service.delete(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('権限不足', async () => {
      const chat = buildChat([makeSuppl('other')]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue({ ...authBase, foundFloorMember: null });

      const jwt = { user_id: 'uidX', user_role: 'User' };
      await expect(service.delete(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
    });

    test('フロアを作成した編集ユーザは削除できる', async () => {
      const chat = buildChat([makeSuppl('xyz')]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue({
        ...authBase,
        foundFloor: { ...authBase.foundFloor, user: 'editorX' },
      });

      const jwt = { user_id: 'editorX', user_role: 'Editor' };
      await expect(service.delete(baseBody, jwt, io)).resolves.toEqual(populatedStub);
    });

    test('フロアメンバーは削除できる', async () => {
      const chat = buildChat([makeSuppl('xyz')]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue({ ...authBase, foundFloorMember: { _id: 'member1' } });

      const jwt = { user_id: 'uidX', user_role: 'User' };
      await expect(service.delete(baseBody, jwt, io)).resolves.toEqual(populatedStub);
    });

    test('作成者が未設定の付加情報も権限のあるユーザは削除できる', async () => {
      const sup = makeSuppl(null);
      const chat = buildChat([sup]);
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue(authBase);

      const jwt = { user_id: 'admin', user_role: 'Administrator' };
      await expect(service.delete(baseBody, jwt, io)).resolves.toEqual(populatedStub);
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      const chat = { ...buildChat([makeSuppl()]), room: 'another-room' };
      Chat.findOne.mockResolvedValue(chat);
      authorizeRoomAccess.mockResolvedValue(authBase);

      const jwt = { user_id: 'uidSelf', user_role: 'User' };
      await expect(service.delete(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('メディア更新との競合で findOneAndUpdate が null の場合は後処理しない', async () => {
      const chat = buildChat([makeSuppl()]);
      Chat.findOne.mockResolvedValue(chat);
      Chat.findOneAndUpdate.mockResolvedValue(null);
      authorizeRoomAccess.mockResolvedValue(authBase);

      const jwt = { user_id: 'uidSelf', user_role: 'User' };
      await expect(service.delete(baseBody, jwt, io)).rejects.toBeInstanceOf(AppError);
      expect(deleteMediaItem).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });
  });
});
