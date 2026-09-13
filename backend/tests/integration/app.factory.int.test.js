const fs = require('fs');
const path = require('path');
const request = require('supertest');

const Messages = require('../../constants/messages');
const { MEDIA_CONTENT_SECURITY_POLICY } = require('../../utils/staticMediaHeaders');
const { snapshotEnv, restoreEnv, createJwtToken, createUserToken } = require('./_helpers/auth');
const { createUser } = require('./_helpers/models');
const { createTestTempDir, removeDirSafe } = require('../_helpers/testRuntime');

const ORIGINAL_ENV = snapshotEnv([
  'NODE_ENV',
  'JWT_SECRET',
  'JWT_DEV_SECRET',
  'MEDIA_PATH',
  'PROFILE_PATH',
  'GUEST_JWT_SECRET',
  'GUEST_REFRESH_SECRET',
  'GA4_MEASUREMENT_ID',
  'GA4_USER_ID_SECRET',
]);

const fixtureRoot = createTestTempDir('app-factory');
const mediaRoot = path.join(fixtureRoot, 'media');
const profileRoot = path.join(fixtureRoot, 'profile');
const distWithIndex = path.join(fixtureRoot, 'dist-with-index');
const distWithoutIndex = path.join(fixtureRoot, 'dist-empty');

[mediaRoot, profileRoot, distWithIndex, distWithoutIndex].forEach((directory) => {
  fs.mkdirSync(directory, { recursive: true });
});
fs.writeFileSync(path.join(mediaRoot, 'fixture.txt'), 'media-fixture');
const protectedFixtureFloorId = '507f1f77bcf86cd799439011';
const protectedFixtureRoomId = '507f1f77bcf86cd799439012';
const protectedFixtureDir = path.join(mediaRoot, protectedFixtureFloorId, protectedFixtureRoomId);
fs.mkdirSync(protectedFixtureDir, { recursive: true });
fs.writeFileSync(path.join(protectedFixtureDir, 'protected.mp3'), 'protected-media-fixture');
fs.writeFileSync(path.join(profileRoot, 'fixture.txt'), 'profile-fixture');
fs.writeFileSync(
  path.join(distWithIndex, 'index.html'),
  '<!doctype html><html><body>factory-spa-entry</body></html>'
);
fs.writeFileSync(path.join(distWithIndex, 'asset.js'), 'window.factoryAsset = true;');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'factory-test-jwt-secret';
process.env.JWT_DEV_SECRET = 'factory-test-dev-jwt-secret';
process.env.GUEST_JWT_SECRET = 'factory-test-guest-jwt-secret';
process.env.GUEST_REFRESH_SECRET = 'factory-test-guest-refresh-secret';
process.env.MEDIA_PATH = `${mediaRoot}${path.sep}`;
process.env.PROFILE_PATH = `${profileRoot}${path.sep}`;

const { buildAccessToken, createGuestId } = require('../../services/guestAuth.service');
const guestPostReactionsService = require('../../services/timeline/guest/guestPostReactions.service');
const { createApp } = require('../../createApp');
const { loadRuntimeConfig } = require('../../bootstrap/runtimeConfig');

const ALLOWED_ORIGIN = 'https://allowed.example.invalid';
const DENIED_ORIGIN = 'https://denied.example.invalid';
const ioStub = {
  to: () => ({ emit: () => {} }),
  in: () => ({ emit: () => {} }),
};

const ALL_DISABLED_CAPABILITIES = Object.freeze({
  googleLogin: false,
  lineLogin: false,
  mailDelivery: false,
  oneSignalPush: false,
  googleTranslate: false,
  openaiTranscription: false,
  openaiAnalysis: false,
  googleAnalytics: false,
});

const buildLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const buildApp = ({
  io = ioStub,
  nodeEnv = 'test',
  distRoot = distWithIndex,
  capabilities = ALL_DISABLED_CAPABILITIES,
  analyticsConfig = { measurementId: null, userIdSecret: null },
  logger = buildLogger(),
} = {}) => ({
  app: createApp({
    io,
    config: {
      nodeEnv,
      capabilities,
      privateConfig: { analytics: analyticsConfig },
      corsAllowedOrigins: [ALLOWED_ORIGIN],
      mediaRoot,
      profileRoot,
      distRoot,
    },
    logger,
  }),
  logger,
});

const getWithAccept = (app, requestPath, accept) => {
  const pendingRequest = request(app).get(requestPath);
  return accept === null ? pendingRequest.unset('Accept') : pendingRequest.set('Accept', accept);
};

const expectNotFound = (response) => {
  expect(response.status).toBe(404);
  expect(response.type).toBe('application/json');
  expect(response.body).toEqual({
    error: {
      code: 'NOT_FOUND',
      status: 404,
      message: Messages.NOT_FOUND,
    },
  });
};

// 各HTTPテストの実行時間にルートの初回読込を含めないよう、テスト定義時にアプリを構築する。
const developmentAppFixture = buildApp({ nodeEnv: 'development' });

describe('HTTPアプリの構成と結合動作', () => {
  afterAll(async () => {
    restoreEnv(ORIGINAL_ENV);
    await removeDirSafe(fixtureRoot);
  });

  test.each([
    ['get', '/api/rooms/invalid/timeline/posts', 401],
    ['post', '/api/rooms/invalid/timeline/posts/search', 401],
    ['put', '/api/rooms/invalid/timeline/posts/invalid/tags', 401],
    ['post', '/api/rooms/invalid/timeline/uploads/image', 401],
    ['get', '/api/rooms/invalid/tags', 400],
  ])('API %s %sが認証または入力検証まで到達する', async (method, url, status) => {
    const response = await request(developmentAppFixture.app)[method](url);
    expect(response.status).toBe(status);
    expect(response.body.error.code).toEqual(expect.any(String));
  });

  test.each([
    '/api/chat', '/api/chat/detail', '/api/chat/create', '/api/chat/update', '/api/chat/delete', '/api/chat/tag',
    '/api/chat/reply', '/api/chat/reply/update', '/api/chat/reply/delete', '/api/chat/reply/tag',
    '/api/chat/supplement', '/api/chat/supplement/update', '/api/chat/supplement/delete',
    '/api/chat/reply/supplement', '/api/chat/reply/supplement/update', '/api/chat/reply/supplement/delete',
    '/api/roomtag', '/api/fileupload/timeline/image', '/api/fileupload/timeline/video',
    '/api/fileupload/timeline/audio', '/api/fileupload/timeline/discard',
  ])('廃止されたPOST %sをアプリが公開しない', async (url) => {
    expect((await request(developmentAppFixture.app).post(url).send({})).status).toBe(404);
  });

  describe('HTTPのCORS制御', () => {
    test.each([undefined, ALLOWED_ORIGIN])('本番の起動設定を使い、環境変数で指定したオリジンだけをHTTPで許可する: %s', async (origins) => {
      const env = {
        NODE_ENV: 'production', DB_CONNECT: 'mongodb://unit.invalid/test',
        JWT_SECRET: 'fixture-jwt', GUEST_JWT_SECRET: 'fixture-guest', GUEST_REFRESH_SECRET: 'fixture-refresh',
        MEDIA_PATH: mediaRoot, PROFILE_PATH: profileRoot, DIST_PATH: distWithIndex,
        VUE_APP_APPURL: ALLOWED_ORIGIN, CORS_ALLOWED_ORIGINS: origins,
      };
      for (const key of ['OPENAI', 'GOOGLE_TRANSLATE', 'GOOGLE_LOGIN', 'LINE_LOGIN', 'ONESIGNAL', 'GOOGLE_ANALYTICS', 'MAIL_DELIVERY']) {
        env[`EXTERNAL_${key}_ENABLED`] = 'false';
      }
      const app = createApp({ io: ioStub, config: loadRuntimeConfig({ env }), logger: buildLogger() });
      const response = await request(app).get('/asset.js').set('Origin', ALLOWED_ORIGIN);
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(origins);
      const denied = await request(app).get('/asset.js').set('Origin', DENIED_ORIGIN);
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });

    test.each([
      ['development', ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']],
      ['production', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']],
    ])('%sでは許可されたメソッドと認証情報の設定を使う', async (nodeEnv, methods) => {
      const { app } =
        nodeEnv === 'development' ? developmentAppFixture : buildApp({ nodeEnv });

      const response = await request(app)
        .options('/api/unknown')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods'].split(',')).toEqual(methods);
    });

    test('本番環境では許可リスト外のオリジンを許可しない', async () => {
      const { app } = buildApp({ nodeEnv: 'production' });

      const response = await request(app).get('/api/unknown').set('Origin', DENIED_ORIGIN);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    test('対象外の環境ではHTTPのCORS処理を登録しない', async () => {
      const { app } = buildApp({ nodeEnv: 'test' });

      const response = await request(app).get('/api/unknown').set('Origin', ALLOWED_ORIGIN);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });

  describe('静的ファイル配信とSPAへの転送除外', () => {
    test.each([
      ['/media/fixture.txt', 'media-fixture'],
      ['/profile/fixture.txt', 'profile-fixture'],
    ])('%sにメディア用のセキュリティヘッダを付ける', async (requestPath, expectedBody) => {
      const { app } = buildApp();

      const response = await request(app).get(requestPath);

      expect(response.status).toBe(200);
      expect(response.text).toBe(expectedBody);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['content-security-policy']).toBe(MEDIA_CONTENT_SECURITY_POLICY);
    });

    test('SPAのファイルにはメディア専用のセキュリティヘッダを付けない', async () => {
      const { app } = buildApp();

      const response = await request(app).get('/asset.js');

      expect(response.status).toBe(200);
      expect(response.text).toBe('window.factoryAsset = true;');
      expect(response.headers['x-content-type-options']).toBeUndefined();
      expect(response.headers['content-security-policy']).toBeUndefined();
    });

    test('ルームのメディアは認証を要求し、通常の静的ファイルとして配信しない', async () => {
      const { app } = buildApp();

      const response = await request(app).get(
        `/media/${protectedFixtureFloorId}/${protectedFixtureRoomId}/protected.mp3`
      );

      expect(response.status).toBe(401);
      expect(response.body?.error?.code).toBe('TOKEN_INVALID');
      expect(response.text).not.toContain('protected-media-fixture');
    });

    test('ルームの想定外のパスを通常の静的ファイルとして配信しない', async () => {
      const { app } = buildApp();

      const response = await request(app).get(
        `/media/${protectedFixtureFloorId}/${protectedFixtureRoomId}/nested/protected.mp3`
      );

      expect(response.status).toBe(404);
      expect(response.body?.error?.code).toBe('NOT_FOUND');
      expect(response.text).not.toContain('protected-media-fixture');
    });

    test.each(['/media/missing.txt', '/profile/missing.txt'])(
      '%sをSPAの画面表示への転送対象から除く',
      async (requestPath) => {
        const { app } = buildApp();

        const response = await getWithAccept(app, requestPath, 'text/html');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/');
        expect(response.text).not.toContain('factory-spa-entry');
      }
    );

    test.each([
      ['/media', '/media/'],
      ['/profile', '/profile/'],
    ])('%sではディレクトリへのリダイレクトを維持する', async (requestPath, location) => {
      const { app } = buildApp();

      const response = await request(app).get(requestPath);

      expect(response.status).toBe(301);
      expect(response.headers.location).toBe(location);
    });
  });

  describe('SPAの画面表示と未定義GETへの応答', () => {
    test.each([
      ['text/html', distWithIndex],
      ['application/json', distWithIndex],
      ['application/json', distWithoutIndex],
    ])('GET /api/unknownはAcceptが%sでもSPAを返さない', async (accept, distRoot) => {
      const { app } = buildApp({ distRoot });

      const response = await getWithAccept(app, '/api/unknown', accept);

      expectNotFound(response);
    });

    test.each([distWithIndex, distWithoutIndex])(
      'GET /apiにJSONを要求した場合は%sでJSONの代替応答を返す',
      async (distRoot) => {
        const { app } = buildApp({ distRoot });

        const response = await getWithAccept(app, '/api', 'application/json');

        expectNotFound(response);
      }
    );

    test.each([distWithIndex, distWithoutIndex])(
      'GET /apiにAcceptがない場合は%sでJSONの代替応答を返す',
      async (distRoot) => {
        const { app } = buildApp({ distRoot });

        const response = await getWithAccept(app, '/api', null);

        expectNotFound(response);
      }
    );

    test.each(['text/html', '*/*'])(
      'GET /apiのAcceptが%sで入口ファイルがある場合はSPAを返す',
      async (accept) => {
        const { app } = buildApp({ distRoot: distWithIndex });

        const response = await getWithAccept(app, '/api', accept);

        expect(response.status).toBe(200);
        expect(response.type).toBe('text/html');
        expect(response.text).toContain('factory-spa-entry');
      }
    );

    test.each(['text/html', '*/*'])(
      'GET /apiのAcceptが%sで入口ファイルがない場合はリダイレクトする',
      async (accept) => {
        const { app } = buildApp({ distRoot: distWithoutIndex });

        const response = await getWithAccept(app, '/api', accept);

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/');
      }
    );

    test('GET /timelineにHTMLを要求した場合はSPAを返す', async () => {
      const { app } = buildApp({ distRoot: distWithIndex });

      const response = await getWithAccept(app, '/timeline', 'text/html');

      expect(response.status).toBe(200);
      expect(response.text).toContain('factory-spa-entry');
    });

    test.each([distWithIndex, distWithoutIndex])(
      'GET /timelineにJSONを要求した場合は%sでリダイレクトする',
      async (distRoot) => {
        const { app } = buildApp({ distRoot });

        const response = await getWithAccept(app, '/timeline', 'application/json');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/');
      }
    );

    test('GET /にJSONを要求しても入口ファイルがあれば静的配信で返す', async () => {
      const { app } = buildApp({ distRoot: distWithIndex });

      const response = await getWithAccept(app, '/', 'application/json');

      expect(response.status).toBe(200);
      expect(response.text).toContain('factory-spa-entry');
    });

    test('GET /にJSONを要求し、入口ファイルがなければJSONの404を返す', async () => {
      const { app } = buildApp({ distRoot: distWithoutIndex });

      const response = await getWithAccept(app, '/', 'application/json');

      expectNotFound(response);
    });

    test.each([distWithIndex, distWithoutIndex])(
      '未定義のPOSTは%sで共通エラー処理を通らずExpressの404を返す',
      async (distRoot) => {
        const { app, logger } = buildApp({ distRoot });

        const response = await request(app).post('/undefined-post').send({});

        expect(response.status).toBe(404);
        expect(response.type).toBe('text/html');
        expect(response.body?.error).toBeUndefined();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      }
    );

    test('POST /api/requestlogを公開しない', async () => {
      const { app, logger } = buildApp();

      const response = await request(app).post('/api/requestlog').send({});

      expect(response.status).toBe(404);
      expect(response.type).toBe('text/html');
      expect(response.body?.error).toBeUndefined();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('APIの登録・リクエストログ・共通エラー処理', () => {
    test('機能の有効状態は認証不要で取得でき、キャッシュせず指定の真偽値だけを返す', async () => {
      const capabilities = {
        ...ALL_DISABLED_CAPABILITIES,
        googleLogin: true,
        openaiTranscription: true,
        internalSecret: 'must-not-leak',
      };
      const { app } = buildApp({ capabilities });

      const response = await request(app).get('/api/capabilities');

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        googleLogin: true,
        lineLogin: false,
        mailDelivery: false,
        oneSignalPush: false,
        googleTranslate: false,
        openaiTranscription: true,
        openaiAnalysis: false,
        googleAnalytics: false,
      });
      expect(response.text).not.toContain('must-not-leak');
    });

    test('認証が必要なルートでもアプリの共通エラー処理を使う', async () => {
      const { app, logger } = buildApp();

      const response = await request(app)
        .get(
          '/api/v1/timeline/floor/507f1f77bcf86cd799439011/room/507f191e810c19729de860ea'
        )
        .set('Accept', 'application/json');

      expect(response.status).toBe(401);
      expect(response.body?.error?.code).toBe('TOKEN_INVALID');
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    });

    test.each([
      '/api/v1/timeline',
      '/api/v1/timeline/floor/507f1f77bcf86cd799439011',
    ])('廃止されたGET %sには共通のNOT_FOUND応答を返す', async (requestPath) => {
      const { app, logger } = buildApp();
      const developerToken = createJwtToken(
        { user_id: '507f1f77bcf86cd799439013', user_role: 'developer' },
        process.env.JWT_DEV_SECRET
      );

      const withoutToken = await request(app).get(requestPath).set('Accept', 'application/json');
      const withDeveloperToken = await request(app)
        .get(requestPath)
        .set('Accept', 'application/json')
        .set('Authorization', `Bearer ${developerToken}`);

      expectNotFound(withoutToken);
      expectNotFound(withDeveloperToken);
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('ゲストのタイムラインが使うSocket.IOをアプリごとに分離する', async () => {
      const guestId = createGuestId();
      const guestToken = buildAccessToken(guestId);
      const ioA = { ...ioStub, id: 'app-a' };
      const ioB = { ...ioStub, id: 'app-b' };
      const payload = {
        guest_name: 'FactoryGuest',
        post_id: '507f1f77bcf86cd799439013',
        type: 'いいね',
      };
      const serviceResult = { ok: true };
      const createReactionSpy = jest
        .spyOn(guestPostReactionsService, 'createReaction')
        .mockResolvedValue(serviceResult);

      try {
        const { app: appA } = buildApp({ io: ioA });
        const { app: appB } = buildApp({ io: ioB });

        const responseA = await request(appA)
          .post('/api/chat/guest/reaction')
          .set('x-guest-token', guestToken)
          .send(payload);
        const responseB = await request(appB)
          .post('/api/chat/guest/reaction')
          .set('x-guest-token', guestToken)
          .send(payload);

        expect(responseA.status).toBe(200);
        expect(responseA.body).toEqual(serviceResult);
        expect(responseB.status).toBe(200);
        expect(responseB.body).toEqual(serviceResult);
        expect(createReactionSpy).toHaveBeenCalledTimes(2);
        expect(createReactionSpy).toHaveBeenNthCalledWith(
          1,
          { ...payload, guest_id: guestId },
          ioA
        );
        expect(createReactionSpy).toHaveBeenNthCalledWith(
          2,
          { ...payload, guest_id: guestId },
          ioB
        );
      } finally {
        createReactionSpy.mockRestore();
      }
    });

    test('アクセス解析の秘密設定とHMACの結果をアプリごとに分離する', async () => {
      const user = await createUser();
      const token = createUserToken(user);
      const secretA = 'a'.repeat(32);
      const secretB = 'b'.repeat(32);
      const measurementIdA = 'G-FACTORYA01';
      const measurementIdB = 'G-FACTORYB01';
      const enabledCapabilities = {
        ...ALL_DISABLED_CAPABILITIES,
        googleAnalytics: true,
      };
      const { app: appA, logger: loggerA } = buildApp({
        capabilities: enabledCapabilities,
        analyticsConfig: { measurementId: measurementIdA, userIdSecret: secretA },
      });
      const { app: appB, logger: loggerB } = buildApp({
        capabilities: enabledCapabilities,
        analyticsConfig: { measurementId: measurementIdB, userIdSecret: secretB },
      });
      const { app: disabledApp } = buildApp();

      process.env.GA4_MEASUREMENT_ID = 'G-FACTORYC01';
      process.env.GA4_USER_ID_SECRET = 'c'.repeat(32);
      const configA = await request(appA).get('/api/analytics/config');
      const configB = await request(appB).get('/api/analytics/config');
      const disabledConfig = await request(disabledApp).get('/api/analytics/config');
      const responseA = await request(appA)
        .get('/api/analytics/identity')
        .set('Authorization', `Bearer ${token}`);
      const responseB = await request(appB)
        .get('/api/analytics/identity')
        .set('Authorization', `Bearer ${token}`);
      const disabledResponse = await request(disabledApp)
        .get('/api/analytics/identity')
        .set('Authorization', `Bearer ${token}`);

      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);
      expect(disabledResponse.status).toBe(503);
      expect(configA.status).toBe(200);
      expect(configA.body).toEqual({ measurement_id: measurementIdA });
      expect(configB.status).toBe(200);
      expect(configB.body).toEqual({ measurement_id: measurementIdB });
      expect(disabledConfig.status).toBe(503);
      expect(responseA.body.analytics_user_id).not.toBe(responseB.body.analytics_user_id);
      expect(responseA.body.analytics_user_id).toBe(
        require('crypto')
          .createHmac('sha256', secretA)
          .update(`iseeetl:ga4:v1:user:${user._id}`)
          .digest('hex')
          .replace(/^/, 'ga1_')
      );
      expect(responseB.body.analytics_user_id).toBe(
        require('crypto')
          .createHmac('sha256', secretB)
          .update(`iseeetl:ga4:v1:user:${user._id}`)
          .digest('hex')
          .replace(/^/, 'ga1_')
      );
      const publicA = await request(appA).get('/api/capabilities');
      expect(publicA.body.googleAnalytics).toBe(true);
      expect(publicA.text).not.toContain(measurementIdA);
      expect(publicA.text).not.toContain(measurementIdB);
      expect(publicA.text).not.toContain(secretA);
      expect(publicA.text).not.toContain(secretB);
      expect(loggerA.info).not.toHaveBeenCalled();
      expect(loggerB.info).not.toHaveBeenCalled();
    });

    test('開発環境では完了した認証APIのリクエストを指定のロガーへ記録する', async () => {
      const { app, logger } = buildApp({ nodeEnv: 'development' });

      const response = await request(app)
        .get('/api/auth/unknown?source=factory')
        .set('Accept', 'application/json');

      expectNotFound(response);
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith('[AuthRequest]', {
        method: 'GET',
        path: '/api/auth/unknown?source=factory',
        status: 404,
        durationMs: expect.any(Number),
      });
    });

    test.each(['production', 'test'])(
      '%sでは認証リクエストの情報ログを出さない',
      async (nodeEnv) => {
        const { app, logger } = buildApp({ nodeEnv });

        const response = await request(app)
          .get('/api/auth/unknown')
          .set('Accept', 'application/json');

        expectNotFound(response);
        expect(logger.info).not.toHaveBeenCalled();
      }
    );
  });
});
