jest.mock('../../../../services/media/reference', () => ({
  validateMediaChanges: jest.fn(),
}));
const mockIsGoogleTranslateEnabled = jest.fn(() => true);
const mockIsOpenAIAnalysisEnabled = jest.fn(() => true);
jest.mock('../../../../config/featureFlags', () => ({
  isGoogleTranslateEnabled: mockIsGoogleTranslateEnabled,
  isOneSignalEnabled: jest.fn(() => true),
  getOneSignalConfig: jest.fn(() => ({
    appId: 'dummy',
    externalIdSecret: 'test-onesignal-external-id-secret-32-bytes',
  })),
}));
jest.mock('../../../../services/analysis/settings/capability', () => ({
  isAIAnalysisExecutionEnabled: mockIsOpenAIAnalysisEnabled,
}));

jest.mock('../../../../models/Chat', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  updateOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../../../../models/RoomTag', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../../../../models/PushFilter', () => ({ find: jest.fn() }));

jest.mock('../../../../services/spam.service', () => ({
  replaceSpams: jest.fn((v) => `REPLACED:${v}`),
}));
jest.mock('../../../../services/analysis.service', () => ({
  runPostAnalyses: jest.fn(),
}));
jest.mock('../../../../services/timeline/timelineTranslation.service', () => ({
  translateMainContentIfNeeded: jest.fn(),
}));
jest.mock('../../../../integrations/onesignal/notification.client', () => ({
  dispatchNotification: jest.fn(),
}));

jest.mock('../../../../services/timeline/shared/timelineSerializer', () => jest.fn((v) => v));
jest.mock('../../../../services/room/roomAccess.service', () => ({
  authorizeRoomAccess: jest.fn(),
  filterAuthorizedRoomUserIds: jest.fn(async (userIds) => userIds),
}));
jest.mock('../../../../services/media/fileCleanup', () => ({
  deleteMediaDiff: jest.fn(),
  deleteMediaItem: jest.fn(),
}));
jest.mock('../../../../services/timeline/shared/matchConditions', () => jest.fn(() => true));
jest.mock('../../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock(
  '../../../../utils/appError',
  () =>
    function AppError(input, statusCode) {
      this.code = input?.code;
      this.message = input;
      this.statusCode = statusCode;
    }
);

const ORIGINAL_ENV = process.env;
const ORIGINAL_LOGGER = global.logger;

process.env = {
  ...ORIGINAL_ENV,
  MEDIA_PATH: '/tmp',
  ONESIGNAL_APP_ID: 'dummy',
  ONESIGNAL_REST_API_KEYS: 'rest-key',
  ONESIGNAL_HOST: 'onesignal.test',
  ONESIGNAL_PORT: '443',
  ONESIGNAL_PATH: '/api/v1/notifications',
  ONESIGNAL_EXTERNAL_ID_SECRET: 'test-onesignal-external-id-secret-32-bytes',
  VUE_APP_APPURL: 'https://example.com',
};

const postsService = require('../../../../services/timeline/posts.service');
const { validateMediaChanges } = require('../../../../services/media/reference');
const Chat = require('../../../../models/Chat');
const RoomTag = require('../../../../models/RoomTag');
const PushFilter = require('../../../../models/PushFilter');
const { authorizeRoomAccess } = require('../../../../services/room/roomAccess.service');
const serializeTimeline = require('../../../../services/timeline/shared/timelineSerializer');
const replaceSpams = require('../../../../services/spam.service').replaceSpams;
const dispatchNotification = require('../../../../integrations/onesignal/notification.client').dispatchNotification;
const { buildOneSignalExternalId } = require('../../../../integrations/onesignal/identity');
const deleteMediaDiff = require('../../../../services/media/fileCleanup').deleteMediaDiff;
const deleteMediaItem = require('../../../../services/media/fileCleanup').deleteMediaItem;
const { runPostAnalyses } = require('../../../../services/analysis.service');
const { translateMainContentIfNeeded } = require('../../../../services/timeline/timelineTranslation.service');
const AppError = require('../../../../utils/appError');

global.logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };

const buildFindChain = (data) => {
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: jest.fn(() => chain),
    exec: jest.fn().mockResolvedValue(data),
  };
  return chain;
};

const buildFindOnePopulateChain = (doc) => {
  const chain = {
    populate: jest.fn(() => chain),
    exec: jest.fn().mockResolvedValue(doc),
  };
  return chain;
};

const buildDocWithExecPopulate = (doc) => ({ populate: jest.fn().mockResolvedValue(doc) });

// Mongooseのクエリと同様に、populateを連続して呼び出せ、awaitで結果を取得できる。
const buildAwaitablePopulateChain = (doc) => {
  const chain = {
    populate: jest.fn(() => chain),
    then: (res, rej) => Promise.resolve(doc).then(res, rej),
    catch: (rej) => Promise.resolve(doc).catch(rej),
  };
  return chain;
};

const buildUpdateExecPopulateChain = (doc) => ({ populate: jest.fn().mockResolvedValue(doc) });

const buildPushFilterChain = (data) => ({
  populate: jest.fn(() => Promise.resolve(data)),
});

const buildSelectLeanChain = (data) => ({
  select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(data) })),
});

const buildPopulateLeanChain = (doc) => {
  const chain = {
    populate: jest.fn(() => chain),
    lean: jest.fn().mockResolvedValue(doc),
    then: (res, rej) => Promise.resolve(doc).then(res, rej),
    catch: (rej) => Promise.resolve(doc).catch(rej),
  };
  return chain;
};

const io = {
  to: jest.fn(() => ({ emit: jest.fn() })),
};

describe('postsのサービス', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsGoogleTranslateEnabled.mockReturnValue(true);
    mockIsOpenAIAnalysisEnabled.mockReturnValue(true);
    RoomTag.countDocuments.mockResolvedValue(1);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.logger = ORIGINAL_LOGGER;
  });

  describe('一覧取得', () => {
    const jwt = { user_id: 'u1', user_role: 'User' };
    const floorId = 'floor1';
    const roomId = 'room1';
    const accessContext = (authorizedFloorId = floorId, authorizedRoomId = roomId) => ({
      foundRoom: { _id: authorizedRoomId, floor: authorizedFloorId },
      foundFloor: { _id: authorizedFloorId },
    });

    test('開始日時と終了日時がなければ10件を取得する', async () => {
      const chain = buildFindChain([{ _id: 'c1' }, { _id: 'c2' }]);
      Chat.find.mockReturnValue(chain);
      authorizeRoomAccess.mockResolvedValue(accessContext());

      const res = await postsService.list({ floor_id: floorId, room_id: roomId }, jwt);

      const query = Chat.find.mock.calls[0][0];
      expect(query.$and).toEqual(
        expect.arrayContaining([{ floor: floorId }, { room: roomId }, { delete_flg: false }])
      );
      expect(chain.limit).toHaveBeenCalledWith(10);
      expect(res).toHaveLength(2);
      expect(serializeTimeline).toHaveBeenCalledTimes(2);
    });

    test('開始日時を指定したら、その日時より前の条件を加える', async () => {
      const from = new Date().toISOString();
      Chat.find.mockReturnValue(buildFindChain([]));
      authorizeRoomAccess.mockResolvedValue(accessContext());

      await postsService.list({ floor_id: floorId, room_id: roomId, from }, jwt);

      const conds = Chat.find.mock.calls[0][0].$and;
      expect(conds).toEqual(expect.arrayContaining([{ created_at: { $lt: new Date(from) } }]));
    });

    test('終了日時を指定したら取得上限を200件にする', async () => {
      const chain = buildFindChain([]);
      Chat.find.mockReturnValue(chain);
      authorizeRoomAccess.mockResolvedValue(accessContext());

      const to = new Date().toISOString();
      await postsService.list({ floor_id: floorId, room_id: roomId, to }, jwt);

      expect(chain.limit).toHaveBeenCalledWith(200);
    });

    test('呼出し元のルームアクセスエラー構成を通常API認可へ渡す', async () => {
      const errors = {
        user: { code: 'TOKEN_INVALID' },
        room: { code: 'NOT_FOUND' },
        floor: { code: 'NOT_FOUND' },
        kicked: { code: 'FORBIDDEN' },
        permission: { code: 'FORBIDDEN' },
      };
      Chat.find.mockReturnValue(buildFindChain([]));
      authorizeRoomAccess.mockResolvedValue(accessContext());

      await postsService.list({ floor_id: floorId, room_id: roomId }, jwt, { errors });

      expect(authorizeRoomAccess).toHaveBeenCalledWith(jwt.user_id, jwt.user_role, roomId, { errors });
    });

    test('認可済みRoom/Floorのcanonical IDでChatを検索する', async () => {
      const canonicalFloorId = '507f1f77bcf86cd799439011';
      const canonicalRoomId = '507f191e810c19729de860ea';
      Chat.find.mockReturnValue(buildFindChain([]));
      authorizeRoomAccess.mockResolvedValue(accessContext(canonicalFloorId, canonicalRoomId));

      await postsService.list(
        {
          floor_id: canonicalFloorId.toUpperCase(),
          room_id: canonicalRoomId.toUpperCase(),
        },
        jwt
      );

      const query = Chat.find.mock.calls[0][0];
      expect(query.$and).toEqual(
        expect.arrayContaining([
          { floor: canonicalFloorId },
          { room: canonicalRoomId },
          { delete_flg: false },
        ])
      );
    });

    test('指定フロアが認可済みルームの実フロアと異なる場合は検索前に拒否する', async () => {
      authorizeRoomAccess.mockResolvedValue(accessContext('actual-floor'));

      await expect(
        postsService.list({ floor_id: floorId, room_id: roomId }, jwt)
      ).rejects.toMatchObject({ code: 'INVALID_PARAMS' });

      expect(Chat.find).not.toHaveBeenCalled();
    });

    test('authorizeRoomAccess エラー', async () => {
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'FORBIDDEN' }));

      await expect(postsService.list({ floor_id: floorId, room_id: roomId }, jwt)).rejects.toBeInstanceOf(AppError);
      expect(Chat.find).not.toHaveBeenCalled();
    });
  });

  describe('詳細取得', () => {
    const jwt = { user_id: 'u1', user_role: 'User' };
    const postId = 'p1';

    test('投稿詳細取得', async () => {
      const chatDoc = { _id: postId, room: 'room1' };
      Chat.findOne.mockReturnValue(buildFindOnePopulateChain(chatDoc));
      authorizeRoomAccess.mockResolvedValue({});

      const res = await postsService.detail({ post_id: postId }, jwt);

      expect(Chat.findOne).toHaveBeenCalledWith({ _id: postId, delete_flg: false });
      expect(serializeTimeline).toHaveBeenCalledWith(chatDoc);
      expect(res).toEqual(chatDoc);
    });

    test('投稿が存在しない', async () => {
      Chat.findOne.mockReturnValue(buildFindOnePopulateChain(null));

      await expect(postsService.detail({ post_id: postId }, jwt)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('作成', () => {
    const jwt = { user_id: 'u1', user_role: 'User' };
    const bodyBase = {
      floor_id: 'floor1',
      floor_title: 'Floor',
      room_id: 'room1',
      room_title: 'Room',
      user_id: 'u1',
      user_name: 'Alice',
      content: 'hello',
      lang: 'ja',
      room_tags: [],
      target_langs: [],
    };

    beforeEach(() => {
      authorizeRoomAccess.mockResolvedValue({
        foundUser: { _id: 'u1', username: 'Alice' },
        foundRoom: { _id: 'room1', title: 'Room' },
        foundFloor: { _id: 'floor1', title: 'Floor' },
      });

      const newDoc = {
        _id: 'newPost',
        room: { _id: 'room1' },
        content: 'REPLACED:hello',
      };
      Chat.create.mockResolvedValue(buildDocWithExecPopulate(newDoc));
    });

    test('投稿作成フロー', async () => {
      PushFilter.find.mockReturnValue(buildPushFilterChain([]));

      const res = await postsService.create(bodyBase, jwt, io);

      expect(validateMediaChanges).toHaveBeenCalledWith(
        expect.objectContaining({ userId: jwt.user_id, newItem: bodyBase })
      );
      expect(replaceSpams).toHaveBeenCalledWith('hello');
      expect(Chat.create).toHaveBeenCalledWith(expect.objectContaining({ content: 'REPLACED:hello' }));
      expect(io.to).toHaveBeenCalledWith('room1');
      expect(io.to.mock.results[0].value.emit).toHaveBeenCalledWith('POST_CREATE', res);
      expect(dispatchNotification).not.toHaveBeenCalled();
      expect(res.content).toBe('REPLACED:hello');
    });

    test('body の floor_id が認可済みルームのフロアと不一致', async () => {
      PushFilter.find.mockReturnValue(buildPushFilterChain([]));

      await expect(
        postsService.create({ ...bodyBase, floor_id: 'bodyFloor' }, jwt, io)
      ).rejects.toBeInstanceOf(AppError);

      expect(Chat.create).not.toHaveBeenCalled();
    });

    test('PushFilter 条件一致で通知送信', async () => {
      PushFilter.find.mockReturnValue(
        buildPushFilterChain([{ user: { _id: 'u2', push_enabled: true }, conditions: {} }])
      );

      await postsService.create(bodyBase, jwt, io);

      expect(dispatchNotification).toHaveBeenCalledTimes(1);
      expect(dispatchNotification.mock.calls[0][0].include_external_user_ids).toEqual([
        buildOneSignalExternalId('u2'),
      ]);
    });

    test.each(['成功', '失敗'])('翻訳%s後も解析を実行する', async (translationState) => {
      if (translationState === '失敗') translateMainContentIfNeeded.mockRejectedValueOnce(new Error('translation failed'));
      const originalSetImmediate = global.setImmediate;
      let immediatePromise;
      global.setImmediate = (fn) => {
        immediatePromise = fn();
      };
      try {
        PushFilter.find.mockReturnValue(buildPushFilterChain([]));

        const body = { ...bodyBase, target_langs: ['en'] };

        await postsService.create(body, jwt, io);
        await immediatePromise;

        expect(translateMainContentIfNeeded).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: 'newPost',
            content: 'REPLACED:hello',
            lang: 'ja',
            targetLangs: ['en'],
          })
        );
        expect(runPostAnalyses).toHaveBeenCalledTimes(1);
        expect(runPostAnalyses).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: 'newPost',
            targetLangs: ['en'],
            io,
            mediaPath: process.env.MEDIA_PATH,
            signal: expect.anything(),
          })
        );
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('target_langs省略時はフロア設定とルーム接続言語から翻訳先を解決する', async () => {
      const originalSetImmediate = global.setImmediate;
      let immediatePromise;
      global.setImmediate = (fn) => {
        immediatePromise = fn();
      };
      try {
        PushFilter.find.mockReturnValue(buildPushFilterChain([]));
        authorizeRoomAccess.mockResolvedValue({
          foundUser: { _id: 'u1', username: 'Alice' },
          foundRoom: { _id: 'room1', title: 'Room' },
          foundFloor: { _id: 'floor1', title: 'Floor', target_langs: ['en', 'ja'] },
        });
        const requestWithoutTargets = { ...bodyBase };
        delete requestWithoutTargets.target_langs;
        delete requestWithoutTargets.room_tags;
        const ioWithLanguages = {
          to: jest.fn(() => ({ emit: jest.fn() })),
          roomLanguageProvider: { getLanguages: jest.fn(() => ['fr', 'ja']) },
        };

        await postsService.create(requestWithoutTargets, jwt, ioWithLanguages);
        await immediatePromise;

        expect(Chat.create).toHaveBeenCalledWith(expect.objectContaining({ room_tags: [] }));
        expect(translateMainContentIfNeeded).toHaveBeenCalledWith(
          expect.objectContaining({ targetLangs: ['en', 'fr'] })
        );
        expect(runPostAnalyses).toHaveBeenCalledWith(
          expect.objectContaining({ targetLangs: ['en', 'fr'] })
        );
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('翻訳とAI解析が両方無効でも投稿を保存し、バックグラウンド処理を作らない', async () => {
      const originalSetImmediate = global.setImmediate;
      global.setImmediate = jest.fn();
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      mockIsOpenAIAnalysisEnabled.mockReturnValue(false);
      try {
        PushFilter.find.mockReturnValue(buildPushFilterChain([]));

        await expect(postsService.create(bodyBase, jwt, io)).resolves.toEqual(
          expect.objectContaining({ _id: 'newPost' })
        );

        expect(global.setImmediate).not.toHaveBeenCalled();
        expect(translateMainContentIfNeeded).not.toHaveBeenCalled();
        expect(runPostAnalyses).not.toHaveBeenCalled();
        expect(Chat.findById).not.toHaveBeenCalled();
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('authorizeRoomAccess エラー', async () => {
      authorizeRoomAccess.mockRejectedValue(new AppError({ code: 'INVALID_PERMISSION' }));

      await expect(postsService.create(bodyBase, jwt, io)).rejects.toBeInstanceOf(AppError);
      expect(Chat.create).not.toHaveBeenCalled();
    });
  });

  describe('更新', () => {
    const jwt = { user_id: 'u1', user_role: 'User' };
    const bodyBase = {
      floor_id: 'floor1',
      floor_title: 'Floor',
      room_id: 'room1',
      room_title: 'Room',
      user_id: 'u1',
      user_name: 'Alice',
      _id: 'post1',
      content: 'new',
      lang: 'ja',
      room_tags: [],
      target_langs: ['en'],
    };

    beforeEach(() => {
      authorizeRoomAccess.mockResolvedValue({
        foundRoom: { _id: 'room1', title: 'Room', room_display_hidden: false },
        foundFloor: { _id: 'floor1', title: 'Floor', user: 'owner' },
        foundFloorMember: {},
      });

      Chat.findOne
        .mockResolvedValueOnce({
          _id: 'post1',
          room: 'room1',
          content: 'old',
          user: 'u1',
          room_tags: [],
          image_name: null,
          image_thumbnail_name: null,
          video_name: null,
          video_thumbnail_name: null,
          video_subtitle_name: null,
          audio_name: null,
        })
        .mockReturnValueOnce(
          buildAwaitablePopulateChain({
            _id: 'post1',
            room: { _id: 'room1' },
            content: 'REPLACED:new',
          })
        );

      RoomTag.find.mockReturnValue(buildSelectLeanChain([]));

      Chat.findOneAndUpdate.mockReturnValue(
        buildUpdateExecPopulateChain({
          _id: 'post1',
          room: { _id: 'room1' },
          content: 'REPLACED:new',
        })
      );
    });

    test('翻訳初期化、deleteMediaDiff 呼出し', async () => {
      const res = await postsService.update(bodyBase, jwt, io);

      const setObj = Chat.findOneAndUpdate.mock.calls[0][1].$set;
      expect(setObj.translations).toEqual([]);
      const optsU = Chat.findOneAndUpdate.mock.calls[0][2];
      expect(optsU).toEqual(expect.objectContaining({ new: true, runValidators: true }));
      expect(deleteMediaDiff).toHaveBeenCalled();
      expect(io.to.mock.results[0].value.emit).toHaveBeenCalledWith('POST_UPDATE', res);
      expect(res.content).toBe('REPLACED:new');
    });

    test('メディア部分更新は検証時のグループ状態を更新条件へ固定する', async () => {
      await postsService.update({ ...bodyBase, image_caption: null }, jwt, io);

      expect(Chat.findOneAndUpdate.mock.calls[0][0]).toEqual(expect.objectContaining({
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
    });

    test('内容同一でもlang変更時は翻訳をクリアして再翻訳する', async () => {
      const originalSetImmediate = global.setImmediate;
      let immediatePromise;
      global.setImmediate = (fn) => {
        immediatePromise = fn();
      };
      try {
        const current = {
          _id: 'post1',
          room: 'room1',
          user: 'u1',
          content: 'same',
          lang: 'en',
          room_tags: [],
          translations: [{ lang: 'ja', content: '以前' }],
        };
        Chat.findOne.mockReset();
        Chat.findOne
          .mockResolvedValueOnce(current)
          .mockReturnValueOnce(buildAwaitablePopulateChain({
            ...current,
            room: { _id: 'room1' },
            lang: 'ja',
            translations: [],
          }));
        Chat.findOneAndUpdate.mockReset();
        Chat.findOneAndUpdate.mockResolvedValue({ ...current, lang: 'ja', translations: [] });
        replaceSpams.mockReturnValueOnce('same');

        await postsService.update(
          {
            room_id: 'room1',
            _id: 'post1',
            content: 'same',
            lang: 'ja',
            target_langs: ['en'],
          },
          jwt,
          io
        );
        await immediatePromise;

        expect(Chat.findOneAndUpdate.mock.calls[0][1].$set).toEqual(
          expect.objectContaining({ lang: 'ja', translations: [] })
        );
        expect(translateMainContentIfNeeded).toHaveBeenCalledWith(
          expect.objectContaining({ content: 'same', lang: 'ja', targetLangs: ['en'] })
        );
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('部分更新で省略したタグとメディアを保持し、翻訳先をサーバ側で解決する', async () => {
      const originalSetImmediate = global.setImmediate;
      let immediatePromise;
      global.setImmediate = (fn) => {
        immediatePromise = fn();
      };
      try {
        const current = {
          _id: 'post1',
          room: 'room1',
          content: 'old',
          lang: 'ja',
          user: 'u1',
          room_tags: ['existing-tag'],
          animation: 'move-and-erase',
          image_name: 'old-image.png',
          image_thumbnail_name: 'old-image-thumbnail.png',
          image_caption: 'old caption',
          video_name: null,
          video_thumbnail_name: null,
          video_subtitle_originalname: null,
          video_subtitle_name: null,
          audio_name: null,
          audio_title: null,
          audio_description: null,
        };
        Chat.findOne.mockReset();
        Chat.findOne
          .mockResolvedValueOnce(current)
          .mockReturnValueOnce(
            buildAwaitablePopulateChain({
              _id: 'post1',
              room: { _id: 'room1' },
              content: 'REPLACED:new',
            })
          );
        authorizeRoomAccess.mockResolvedValue({
          foundRoom: { _id: 'room1', title: 'Room' },
          foundFloor: { _id: 'floor1', title: 'Floor', user: 'owner', target_langs: ['en', 'ja'] },
          foundFloorMember: {},
        });
        const ioWithLanguages = {
          to: jest.fn(() => ({ emit: jest.fn() })),
          roomLanguageProvider: { getLanguages: jest.fn(() => ['fr']) },
        };
        const partialBody = { room_id: 'room1', _id: 'post1', content: 'new', lang: 'ja' };

        await postsService.update(partialBody, jwt, ioWithLanguages);
        await immediatePromise;

        expect(validateMediaChanges).toHaveBeenCalledWith(
          expect.objectContaining({
            oldItem: current,
            newItem: expect.objectContaining({
              room_tags: ['existing-tag'],
              animation: 'move-and-erase',
              image_name: 'old-image.png',
              image_thumbnail_name: 'old-image-thumbnail.png',
              image_caption: 'old caption',
            }),
          })
        );
        const writeSet = Chat.findOneAndUpdate.mock.calls[0][1].$set;
        expect(writeSet).toEqual(
          expect.objectContaining({ content: 'REPLACED:new', lang: 'ja' })
        );
        expect(Object.keys(writeSet).sort()).toEqual(
          ['content', 'lang', 'translations', 'updated_at'].sort()
        );
        expect(deleteMediaDiff).toHaveBeenCalledWith(
          expect.objectContaining({
            newMedia: expect.objectContaining({
              image: { main: 'old-image.png', thumb: 'old-image-thumbnail.png' },
            }),
          })
        );
        expect(translateMainContentIfNeeded).toHaveBeenCalledWith(
          expect.objectContaining({ targetLangs: ['en', 'fr'] })
        );
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('CAS競合再試行でもリクエストで省略した同時更新項目を古いスナップショットで上書きしない', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      mockIsOpenAIAnalysisEnabled.mockReturnValue(false);
      const initial = {
        _id: 'post1',
        room: 'room1',
        content: 'old',
        lang: 'ja',
        user: 'u1',
        room_tags: [],
        image_name: 'initial-image.png',
        image_thumbnail_name: 'initial-thumbnail.png',
        video_name: null,
        video_thumbnail_name: null,
        video_subtitle_name: null,
        audio_name: null,
        analysis_source_revision: 0,
      };
      const concurrent = {
        ...initial,
        image_name: 'concurrent-image.png',
        image_thumbnail_name: 'concurrent-thumbnail.png',
        analysis_source_revision: 1,
      };
      Chat.findOne.mockReset();
      Chat.findOne
        .mockResolvedValueOnce(initial)
        .mockResolvedValueOnce(concurrent)
        .mockReturnValueOnce(
          buildAwaitablePopulateChain({
            ...concurrent,
            room: { _id: 'room1' },
            content: 'REPLACED:new',
            analysis_source_revision: 2,
          })
        );
      Chat.findOneAndUpdate.mockReset();
      Chat.findOneAndUpdate
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...concurrent,
          content: 'REPLACED:new',
          analysis_source_revision: 2,
        });

      await postsService.update(
        { room_id: 'room1', _id: 'post1', content: 'new', lang: 'ja' },
        jwt,
        io
      );

      expect(Chat.findOneAndUpdate).toHaveBeenCalledTimes(2);
      expect(Chat.findOneAndUpdate.mock.calls[1][0]).toEqual(
        expect.objectContaining({ analysis_source_revision: 1 })
      );
      for (const [, update] of Chat.findOneAndUpdate.mock.calls) {
        expect(update.$set).toEqual(
          expect.objectContaining({ content: 'REPLACED:new', lang: 'ja' })
        );
        expect(Object.keys(update.$set).sort()).toEqual(
          ['content', 'lang', 'updated_at'].sort()
        );
      }
    });

    test('Google翻訳無効時は内容更新後も保存済み翻訳を変更しない', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);

      await postsService.update(bodyBase, jwt, io);

      const setObj = Chat.findOneAndUpdate.mock.calls[0][1].$set;
      expect(setObj).not.toHaveProperty('translations');
    });

    test.each(['成功', '失敗'])('翻訳%s後も解析を実行する', async (translationState) => {
      if (translationState === '失敗') translateMainContentIfNeeded.mockRejectedValueOnce(new Error('translation failed'));
      const originalSetImmediate = global.setImmediate;
      let immediatePromise;
      global.setImmediate = (fn) => {
        immediatePromise = fn();
      };
      try {
        await postsService.update(bodyBase, jwt, io);
        await immediatePromise;

        expect(translateMainContentIfNeeded).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: 'post1',
            content: 'REPLACED:new',
            lang: 'ja',
            targetLangs: ['en'],
          })
        );
        expect(runPostAnalyses).toHaveBeenCalledTimes(1);
        expect(runPostAnalyses).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: 'post1',
            targetLangs: ['en'],
            io,
            mediaPath: process.env.MEDIA_PATH,
            signal: expect.anything(),
          })
        );
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('ソースが実際に変わらない更新では解析を起動しない', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      const originalSetImmediate = global.setImmediate;
      global.setImmediate = jest.fn();
      try {
        Chat.findOne.mockReset();
        Chat.findOne
          .mockResolvedValueOnce({
            _id: 'post1',
            room: 'room1',
            content: 'REPLACED:new',
            lang: 'ja',
            user: 'u1',
            room_tags: [],
            image_name: null,
            video_name: null,
            audio_name: null,
          })
          .mockReturnValueOnce(
            buildAwaitablePopulateChain({
              _id: 'post1',
              room: { _id: 'room1' },
              content: 'REPLACED:new',
            })
          );

        await postsService.update(bodyBase, jwt, io);

        expect(global.setImmediate).not.toHaveBeenCalled();
        expect(runPostAnalyses).not.toHaveBeenCalled();
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('解析対象が変わっても保存済みのAI付加情報を削除しない', async () => {
      const originalSetImmediate = global.setImmediate;
      try {
        global.setImmediate = jest.fn();

        const supplementaries = [
          { _id: 's-speech', user: { _id: 'support-user' }, meta: { analysis_kind: 'speech' }, delete_flg: false },
        ];

        const body = {
          ...bodyBase,
          image_name: null,
          image_thumbnail_name: null,
          video_name: null,
          video_thumbnail_name: null,
          video_subtitle_name: null,
          audio_name: null,
        };
        let postsServiceWithSupport;
        let ChatWithSupport;
        let updatePromise;

        jest.isolateModules(() => {
          postsServiceWithSupport = require('../../../../services/timeline/posts.service');
          ChatWithSupport = require('../../../../models/Chat');
          const RoomTagWithSupport = require('../../../../models/RoomTag');
          const { authorizeRoomAccess: authorizeRoomAccessWithSupport } = require('../../../../services/room/roomAccess.service');

          ChatWithSupport.findOne.mockReset();
          ChatWithSupport.findOneAndUpdate.mockReset();
          ChatWithSupport.updateOne.mockReset();
          RoomTagWithSupport.find.mockReset();

          authorizeRoomAccessWithSupport.mockResolvedValue({
            foundRoom: { _id: 'room1', title: 'Room', room_display_hidden: false },
            foundFloor: { _id: 'floor1', title: 'Floor', user: 'owner' },
            foundFloorMember: {},
          });

          ChatWithSupport.findOne
            .mockResolvedValueOnce({
              _id: 'post1',
              room: 'room1',
              content: 'old',
              user: 'u1',
              room_tags: ['tag1'],
              image_name: null,
              image_thumbnail_name: null,
              video_name: 'old.mp4',
              video_thumbnail_name: 'old_thumbnail.png',
              video_subtitle_name: null,
              audio_name: null,
            })
            .mockReturnValueOnce(
              buildAwaitablePopulateChain({
                _id: 'post1',
                room: { _id: 'room1' },
                supplementaries,
                content: 'REPLACED:new',
              })
            );

          RoomTagWithSupport.find
            .mockReturnValueOnce(buildSelectLeanChain([]))
            .mockReturnValueOnce(buildSelectLeanChain([]));

          ChatWithSupport.findOneAndUpdate.mockResolvedValue({
            _id: 'post1',
            room: { _id: 'room1' },
            supplementaries,
            content: 'REPLACED:new',
          });
          ChatWithSupport.updateOne.mockResolvedValue({});

          updatePromise = postsServiceWithSupport.update(body, jwt, io);
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
          isolatedService = require('../../../../services/timeline/posts.service');
          isolatedChat = require('../../../../models/Chat');
          const isolatedRoomTag = require('../../../../models/RoomTag');
          const { authorizeRoomAccess: isolatedAuthorize } = require('../../../../services/room/roomAccess.service');

          isolatedChat.findOne.mockReset();
          isolatedChat.findOneAndUpdate.mockReset();
          isolatedChat.updateOne.mockReset();
          isolatedRoomTag.find.mockReset();
          isolatedAuthorize.mockResolvedValue({
            foundRoom: { _id: 'room1', title: 'Room', room_display_hidden: false },
            foundFloor: { _id: 'floor1', title: 'Floor', user: 'owner' },
            foundFloorMember: {},
          });
          isolatedChat.findOne
            .mockResolvedValueOnce({
              _id: 'post1',
              room: 'room1',
              content: 'old',
              user: 'u1',
              room_tags: [],
              image_name: null,
              image_thumbnail_name: null,
              video_name: 'old.mp4',
              video_thumbnail_name: 'old_thumbnail.png',
              video_subtitle_name: null,
              audio_name: null,
            })
            .mockReturnValueOnce(
              buildAwaitablePopulateChain({
                _id: 'post1',
                room: { _id: 'room1' },
                supplementaries: [
                  {
                    _id: 's-video',
                    user: { _id: 'support-user' },
                    meta: { analysis_kind: 'video' },
                    delete_flg: false,
                  },
                ],
                content: 'REPLACED:new',
              })
            );
          isolatedRoomTag.find.mockReturnValue(buildSelectLeanChain([]));
          isolatedChat.findOneAndUpdate.mockResolvedValue({
            _id: 'post1',
            room: { _id: 'room1' },
            supplementaries: [
              {
                _id: 's-video',
                user: { _id: 'support-user' },
                meta: { analysis_kind: 'video' },
                delete_flg: false,
              },
            ],
            content: 'REPLACED:new',
          });
        });

        await isolatedService.update(
          {
            ...bodyBase,
            image_name: null,
            image_thumbnail_name: null,
            video_name: null,
            video_thumbnail_name: null,
            video_subtitle_name: null,
            audio_name: null,
          },
          jwt,
          io
        );

        expect(isolatedChat.findOneAndUpdate).toHaveBeenCalled();
        expect(isolatedChat.updateOne).not.toHaveBeenCalled();
      } finally {
        mockIsOpenAIAnalysisEnabled.mockReturnValue(true);
        global.setImmediate = originalSetImmediate;
      }
    });

    test('権限なし', async () => {
      authorizeRoomAccess.mockResolvedValue({
        foundRoom: { _id: 'room1', title: 'Room' },
        foundFloor: { _id: 'floor1', title: 'Floor', user: 'owner' },
        foundFloorMember: null,
      });
      Chat.findOne.mockReset();
      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        content: 'old',
        user: 'someoneElse',
      });

      await expect(postsService.update(bodyBase, jwt, io)).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      Chat.findOne.mockReset();
      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        room: 'another-room',
        content: 'old',
        user: 'u1',
        room_tags: [],
      });

      await expect(postsService.update(bodyBase, jwt, io)).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('削除', () => {
    const bodyBase = {
      floor_id: 'floor1',
      floor_title: 'Floor',
      room_id: 'room1',
      room_title: 'Room',
      user_id: 'admin',
      user_name: 'Admin',
      _id: 'post1',
    };
    const jwtAdmin = { user_id: 'admin', user_role: 'Administrator' };

    beforeEach(() => {
      authorizeRoomAccess.mockResolvedValue({
        foundRoom: { _id: 'room1', title: 'Room' },
        foundFloor: { _id: 'floor1', title: 'Floor', user: 'owner' },
        foundFloorMember: null,
      });

      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        room: 'room1',
        user: 'someoneElse',
        image_name: null,
        image_thumbnail_name: null,
        video_name: null,
        video_thumbnail_name: null,
        video_subtitle_name: null,
        audio_name: null,
        delete_flg: false,
      });

      Chat.findOneAndUpdate.mockReturnValue(
        buildAwaitablePopulateChain({
          _id: 'post1',
          room: { _id: 'room1' },
          delete_flg: true,
        })
      );
    });

    test('管理者が削除 → deleteMediaItem 呼出し', async () => {
      const res = await postsService.delete(bodyBase, jwtAdmin, io);

      expect(deleteMediaItem).toHaveBeenCalled();
      expect(io.to.mock.results[0].value.emit).toHaveBeenCalledWith('POST_DELETE', res);
      expect(Chat.findOneAndUpdate.mock.calls[0][0]).toEqual(expect.objectContaining({
        _id: 'post1',
        room: 'room1',
        delete_flg: false,
        image_name: null,
        image_thumbnail_name: null,
        video_name: null,
        audio_name: null,
      }));
      const optsD = Chat.findOneAndUpdate.mock.calls[0][2];
      expect(optsD).toEqual(expect.objectContaining({ new: true, runValidators: true }));
    });

    test('メディア更新との競合で条件付き削除が0件なら後処理とSocket通知を行わない', async () => {
      Chat.findOneAndUpdate.mockReturnValue(buildAwaitablePopulateChain(null));

      await expect(postsService.delete(bodyBase, jwtAdmin, io)).rejects.toMatchObject({
        code: 'INVALID_PARAMS',
      });

      expect(deleteMediaItem).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });

    test('権限なし', async () => {
      const jwtUser = { user_id: 'u3', user_role: 'User' };
      authorizeRoomAccess.mockResolvedValue({
        foundRoom: { _id: 'room1', title: 'Room' },
        foundFloor: { _id: 'floor1', title: 'Floor', user: 'owner' },
        foundFloorMember: null,
      });
      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        user: 'owner',
      });

      await expect(postsService.delete(bodyBase, jwtUser, io)).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      Chat.findOne.mockResolvedValue({
        _id: 'post1',
        room: 'another-room',
        user: 'someoneElse',
      });

      await expect(postsService.delete(bodyBase, jwtAdmin, io)).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('タグの更新', () => {
    const jwt = { user_id: 'u1', user_role: 'User' };
    const bodyBase = {
      floor_id: 'floor1',
      floor_title: 'Floor',
      room_id: 'room1',
      room_title: 'Room',
      user_id: 'u1',
      user_name: 'Alice',
      _id: 'post1',
      room_tags: ['tag1'],
      target_langs: ['en'],
    };

    beforeEach(() => {
      authorizeRoomAccess.mockResolvedValue({
        foundRoom: { _id: 'room1' },
        foundFloor: { _id: 'floor1' },
      });

      Chat.findOne
        .mockReturnValueOnce(
          buildPopulateLeanChain({
            _id: 'post1',
            room: 'room1',
            room_tags: [],
          })
        )
        .mockReturnValueOnce(
          buildAwaitablePopulateChain({
            _id: 'post1',
            room: { _id: 'room1' },
            room_tags: ['tag1'],
            content: '',
          })
        );
      RoomTag.find.mockReturnValue(buildSelectLeanChain([]));

      Chat.findOneAndUpdate.mockReturnValue(
        buildAwaitablePopulateChain({
          _id: 'post1',
          room: { _id: 'room1' },
          room_tags: ['tag1'],
          content: '',
        })
      );
    });

    test('タグのみ更新で翻訳呼ばれない', async () => {
      await postsService.updateTag(bodyBase, jwt, io);

      const translate =
        require('../../../../services/timeline/timelineTranslation.service').translateMainContentIfNeeded;
      expect(translate).not.toHaveBeenCalled();
      expect(io.to.mock.results[0].value.emit).toHaveBeenCalledWith(
        'TAG_UPDATE',
        expect.objectContaining({ room_tags: ['tag1'] })
      );
      const optsT = Chat.findOneAndUpdate.mock.calls[0][2];
      expect(optsT).toEqual(expect.objectContaining({ new: true, runValidators: true }));
    });

    test('OpenAI解析無効時はタグ変更後も保存済みAI付加情報を削除しない', async () => {
      const originalSetImmediate = global.setImmediate;
      try {
        mockIsOpenAIAnalysisEnabled.mockReturnValue(false);
        global.setImmediate = jest.fn();

        let isolatedService;
        let isolatedChat;
        jest.isolateModules(() => {
          isolatedService = require('../../../../services/timeline/posts.service');
          isolatedChat = require('../../../../models/Chat');
          const { authorizeRoomAccess: isolatedAuthorize } = require('../../../../services/room/roomAccess.service');

          isolatedChat.findOne.mockReset();
          isolatedChat.findOneAndUpdate.mockReset();
          isolatedChat.updateOne.mockReset();
          isolatedAuthorize.mockResolvedValue({
            foundRoom: { _id: 'room1' },
            foundFloor: { _id: 'floor1' },
          });
          isolatedChat.findOne
            .mockReturnValueOnce(
              buildPopulateLeanChain({
                _id: 'post1',
                room: 'room1',
                room_tags: [{ name: '任意解析タグ' }],
              })
            )
            .mockReturnValueOnce(
              buildAwaitablePopulateChain({
                _id: 'post1',
                room: { _id: 'room1' },
                room_tags: [],
                content: '',
                supplementaries: [
                  {
                    _id: 's-vision',
                    user: { _id: 'support-user' },
                    meta: { analysis_kind: 'vision' },
                    delete_flg: false,
                  },
                ],
              })
            );
          isolatedChat.findOneAndUpdate.mockReturnValue(
            buildAwaitablePopulateChain({
              _id: 'post1',
              room: { _id: 'room1' },
              room_tags: [],
              content: '',
              supplementaries: [
                {
                  _id: 's-vision',
                  user: { _id: 'support-user' },
                  meta: { analysis_kind: 'vision' },
                  delete_flg: false,
                },
              ],
            })
          );
        });

        await isolatedService.updateTag({ ...bodyBase, room_tags: [] }, jwt, io);

        expect(isolatedChat.findOneAndUpdate).toHaveBeenCalled();
        expect(isolatedChat.updateOne).not.toHaveBeenCalled();
      } finally {
        mockIsOpenAIAnalysisEnabled.mockReturnValue(true);
        global.setImmediate = originalSetImmediate;
      }
    });

    test.each(['成功', '失敗'])('翻訳%s後も解析を実行する', async (translationState) => {
      if (translationState === '失敗') translateMainContentIfNeeded.mockRejectedValueOnce(new Error('translation failed'));
      const originalSetImmediate = global.setImmediate;
      let immediatePromise;
      global.setImmediate = (fn) => {
        immediatePromise = fn();
      };
      try {
        const chatDoc = { _id: 'post1', content: 'hello', lang: 'ja', room_tags: [], room: { _id: 'room1' } };
        Chat.findById.mockReturnValue(buildPopulateLeanChain(chatDoc));

        await postsService.updateTag(bodyBase, jwt, io);
        await immediatePromise;

        expect(translateMainContentIfNeeded).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: 'post1',
            content: 'hello',
            lang: 'ja',
            targetLangs: ['en'],
          })
        );
        expect(runPostAnalyses).toHaveBeenCalledTimes(1);
        expect(runPostAnalyses).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: 'post1',
            targetLangs: ['en'],
            io,
            mediaPath: process.env.MEDIA_PATH,
            signal: expect.anything(),
          })
        );
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('タグが実際に変わらない更新では解析を起動しない', async () => {
      mockIsGoogleTranslateEnabled.mockReturnValue(false);
      const originalSetImmediate = global.setImmediate;
      global.setImmediate = jest.fn();
      try {
        const unchanged = {
          _id: 'post1',
          room: { _id: 'room1' },
          room_tags: ['tag1'],
          content: '',
        };
        Chat.findOne.mockReset();
        Chat.findOne
          .mockReturnValueOnce(
            buildPopulateLeanChain({
              ...unchanged,
              room: 'room1',
            })
          )
          .mockReturnValueOnce(buildAwaitablePopulateChain(unchanged))
          .mockReturnValueOnce(buildAwaitablePopulateChain(unchanged));

        await postsService.updateTag(bodyBase, jwt, io);

        expect(global.setImmediate).not.toHaveBeenCalled();
        expect(runPostAnalyses).not.toHaveBeenCalled();
      } finally {
        global.setImmediate = originalSetImmediate;
      }
    });

    test('認可した room_id と投稿ルームが不一致', async () => {
      Chat.findOne.mockReset();
      Chat.findOne.mockReturnValueOnce(
        buildPopulateLeanChain({
          _id: 'post1',
          room: 'another-room',
          room_tags: [],
        })
      );
      authorizeRoomAccess.mockResolvedValue({
        foundRoom: { _id: 'room1' },
        foundFloor: { _id: 'floor1' },
      });

      await expect(postsService.updateTag(bodyBase, jwt, io)).rejects.toBeInstanceOf(AppError);
      expect(Chat.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
