const path = require('path');
const { OPENAI_MODEL_ENV } = require('../../_helpers/openai');

const {
  normalizeDirectoryEnv,
  applyDefaultEnvValues,
  resolveSocketCors,
  loadRuntimeConfig,
} = require('../../../bootstrap/runtimeConfig');

const ALL_DISABLED = Object.freeze({
  googleLogin: false,
  lineLogin: false,
  mailDelivery: false,
  oneSignalPush: false,
  googleTranslate: false,
  openaiTranscription: false,
  openaiAnalysis: false,
  googleAnalytics: false,
});

const buildEnv = (overrides = {}) => ({
  NODE_ENV: 'development',
  DB_CONNECT: 'mongodb://unit.invalid/test',
  JWT_SECRET: 'unit-jwt',
  MEDIA_PATH: 'media',
  PROFILE_PATH: 'profile',
  VUE_APP_APPURL: 'http://localhost:3000',
  GUEST_JWT_SECRET: 'unit-guest',
  GUEST_REFRESH_SECRET: 'unit-refresh',
  ...overrides,
});

describe('サーバ起動時の設定検証', () => {
  test('開発用の既定オリジンはlocalhostだけとし、明示設定で変更できる', () => {
    const defaults = loadRuntimeConfig({ env: buildEnv() });
    expect(defaults.corsAllowedOrigins).toEqual(['http://localhost:3000']);
    expect(defaults.socketCors.cors.origin).toEqual(['http://localhost:3000']);

    const explicit = loadRuntimeConfig({ env: buildEnv({ CORS_ALLOWED_ORIGINS: 'https://app.example.invalid' }) });
    expect(explicit.corsAllowedOrigins).toEqual(['https://app.example.invalid']);
    expect(explicit.socketCors.cors.origin).toEqual(['https://app.example.invalid']);
  });

  test.each([undefined, '', '   '])('本番でCORSを未指定ならHTTPの許可先を空にし、SocketはアプリURLを使う: %s', (origins) => {
    const env = buildEnv({
      NODE_ENV: 'production', DIST_PATH: '/fixture/frontend',
      VUE_APP_APPURL: 'https://app.example.invalid', CORS_ALLOWED_ORIGINS: origins,
    });
    for (const key of ['OPENAI', 'GOOGLE_TRANSLATE', 'GOOGLE_LOGIN', 'LINE_LOGIN', 'ONESIGNAL', 'GOOGLE_ANALYTICS', 'MAIL_DELIVERY']) {
      env[`EXTERNAL_${key}_ENABLED`] = 'false';
    }
    const config = loadRuntimeConfig({ env });
    expect(config.corsAllowedOrigins).toEqual([]);
    const allowed = jest.fn();
    const denied = jest.fn();
    config.socketCors.cors.origin('https://app.example.invalid', allowed);
    config.socketCors.cors.origin('https://other.example.invalid', denied);
    expect(allowed).toHaveBeenCalledWith(null, true);
    expect(denied.mock.calls[0][0]).toEqual(expect.any(Error));
  });

  test('必須設定を検証し、HTTPとSocket用の解決済み設定を返す', () => {
    const env = buildEnv({
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000, http://localhost:8080',
      SOCKET_CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    });
    const rootDir = '/test-fixtures/backend-unit-root';

    const config = loadRuntimeConfig({ env, rootDir });

    expect(env.MEDIA_PATH).toBe(`media${path.sep}`);
    expect(env.PROFILE_PATH).toBe(`profile${path.sep}`);
    expect(config).toEqual(
      expect.objectContaining({
        nodeEnv: 'development',
        applicationConfig: { appUrl: 'http://localhost:3000' },
        capabilities: ALL_DISABLED,
        corsAllowedOrigins: ['http://localhost:3000', 'http://localhost:8080'],
        mediaRoot: path.resolve(rootDir, `media${path.sep}`),
        profileRoot: path.resolve(rootDir, `profile${path.sep}`),
        distRoot: path.resolve(rootDir, '../frontend/dist/'),
      })
    );
    expect(config.socketCors.cors.origin).toEqual(['http://localhost:3000']);
    expect(Object.isFrozen(config.capabilities)).toBe(true);
    expect(config.privateConfig).toEqual({
      googleLogin: null,
      lineLogin: null,
      mailDelivery: null,
      oneSignalPush: null,
      googleTranslate: null,
      openai: null,
      analytics: { measurementId: null, userIdSecret: null },
    });
    expect(env.ONESIGNAL_HOST).toBeUndefined();
    expect(env.ONESIGNAL_PORT).toBeUndefined();
    expect(env.ONESIGNAL_PATH).toBeUndefined();
  });

  test('不足する必須設定名をまとめて通知する', () => {
    const env = buildEnv({ DB_CONNECT: '', JWT_SECRET: ' ' });

    expect(() => loadRuntimeConfig({ env })).toThrow('Missing required env: DB_CONNECT, JWT_SECRET');
  });

  test('フロントエンド URLの不正値を起動設定の解決時に拒否する', () => {
    expect(() =>
      loadRuntimeConfig({ env: buildEnv({ VUE_APP_APPURL: 'not-a-url' }) })
    ).toThrow('Invalid application configuration: VUE_APP_APPURL');
  });

  test('ディレクトリ値の末尾区切りを重複させない', () => {
    const env = { MEDIA_PATH: `media${path.sep}` };

    normalizeDirectoryEnv('MEDIA_PATH', env);

    expect(env.MEDIA_PATH).toBe(`media${path.sep}`);
  });

  test('既定値は未設定または空白の項目だけへ適用する', () => {
    const env = { EMPTY: ' ', EXPLICIT: 'configured' };

    applyDefaultEnvValues({ EMPTY: 'default', EXPLICIT: 'default' }, env);

    expect(env).toEqual({ EMPTY: 'default', EXPLICIT: 'configured' });
  });

  test('外部機能の必須設定が一部しかない場合は起動時に拒否する', () => {
    const env = buildEnv({
      EXTERNAL_LINE_LOGIN_ENABLED: 'true',
      LINE_LOGIN_CHANNEL_ID: 'line-channel-id',
    });

    expect(() => loadRuntimeConfig({ env })).toThrow(
      'Invalid external feature configuration for lineLogin: LINE_LOGIN_CHANNEL_SECRET, LINE_LOGIN_REDIRECT_URI'
    );
  });

  test('本番起動では外部機能の有効フラグが未設定なら拒否する', () => {
    expect(() =>
      loadRuntimeConfig({ env: buildEnv({ NODE_ENV: 'production' }) })
    ).toThrow(
      'Invalid external feature configuration for openaiAnalysis: EXTERNAL_OPENAI_ENABLED'
    );
  });

  test('OpenAIのモデル設定不足を起動設定の解決時に拒否する', () => {
    const env = buildEnv({
      EXTERNAL_OPENAI_ENABLED: 'true',
      OPENAI_API_KEY: 'dummy-openai-key',
      ...OPENAI_MODEL_ENV,
      OPENAI_VIDEO_MODEL: '',
      OPENAI_TRANSCRIPTION_MODEL: ' ',
    });

    expect(() => loadRuntimeConfig({ env })).toThrow(
      'Invalid external feature configuration for openaiAnalysis: OPENAI_VIDEO_MODEL, OPENAI_TRANSCRIPTION_MODEL'
    );
  });

  test('本番起動でも明示的にfalseなら認証情報が残っていても外部機能を無効にする', () => {
    const config = loadRuntimeConfig({
      env: buildEnv({
        NODE_ENV: 'production',
        DIST_PATH: '/fixture/frontend',
        EXTERNAL_OPENAI_ENABLED: 'false',
        EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'false',
        EXTERNAL_GOOGLE_LOGIN_ENABLED: 'false',
        EXTERNAL_LINE_LOGIN_ENABLED: 'false',
        EXTERNAL_ONESIGNAL_ENABLED: 'false',
        EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'false',
        EXTERNAL_MAIL_DELIVERY_ENABLED: 'false',
        OPENAI_API_KEY: 'stale-openai-key',
        SUPPORT_USER_ID: 'invalid-stale-support-id',
        GOOGLE_APPLICATION_CREDENTIALS: '/stale/google/credentials.json',
      }),
    });

    expect(config.capabilities.openaiTranscription).toBe(false);
    expect(config.capabilities.openaiAnalysis).toBe(false);
    expect(config.capabilities.googleTranslate).toBe(false);
  });

  test('GA4の計測IDと秘密値の前後の空白を除き、内部設定だけに保持する', () => {
    const secret = 'a'.repeat(32);
    const config = loadRuntimeConfig({
      env: buildEnv({
        EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'true',
        GA4_MEASUREMENT_ID: ' G-RUNTIME01 ',
        GA4_USER_ID_SECRET: `  ${secret}  `,
      }),
    });

    expect(config.capabilities.googleAnalytics).toBe(true);
    expect(config.privateConfig.analytics.measurementId).toBe('G-RUNTIME01');
    expect(config.privateConfig.analytics.userIdSecret).toBe(secret);
    expect(config.capabilities).not.toHaveProperty('measurementId');
    expect(config.capabilities).not.toHaveProperty('userIdSecret');
  });

  test('GA4の秘密値が短い場合は起動設定の検証で拒否する', () => {
    expect(() =>
      loadRuntimeConfig({
        env: buildEnv({
          EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'true',
          GA4_MEASUREMENT_ID: 'G-RUNTIME01',
          GA4_USER_ID_SECRET: 'short',
        }),
      })
    ).toThrow(
      'Invalid external feature configuration for googleAnalytics: GA4_USER_ID_SECRET'
    );
  });

  test('GA4の一部設定と不正Measurement IDを起動設定の解決時に拒否する', () => {
    expect(() =>
      loadRuntimeConfig({
        env: buildEnv({
          EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'true',
          GA4_MEASUREMENT_ID: 'G-RUNTIME01',
        }),
      })
    ).toThrow(
      'Invalid external feature configuration for googleAnalytics: GA4_USER_ID_SECRET'
    );

    expect(() =>
      loadRuntimeConfig({
        env: buildEnv({
          EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'true',
          GA4_MEASUREMENT_ID: 'UA-12345',
          GA4_USER_ID_SECRET: 'a'.repeat(32),
        }),
      })
    ).toThrow(
      'Invalid external feature configuration for googleAnalytics: GA4_MEASUREMENT_ID'
    );
  });

  test('production Socket CORSは許可オリジンだけを通す', () => {
    const result = resolveSocketCors({
      nodeEnv: 'production',
      allowedOrigins: ['https://allowed.example.invalid'],
      appUrl: 'https://fallback.example.invalid',
    });
    const allowed = jest.fn();
    const denied = jest.fn();

    result.cors.origin('https://allowed.example.invalid', allowed);
    result.cors.origin('https://denied.example.invalid', denied);

    expect(allowed).toHaveBeenCalledWith(null, true);
    expect(denied.mock.calls[0][0]).toEqual(expect.any(Error));
    expect(result.originLabel).toBe('https://allowed.example.invalid');
  });

  test('明示オリジンが空のproductionではapp URLのポート違いを許可する', () => {
    const result = resolveSocketCors({
      nodeEnv: 'production',
      allowedOrigins: [],
      appUrl: 'https://app.example.invalid/path',
    });
    const callback = jest.fn();

    result.cors.origin('https://app.example.invalid:8443', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
    expect(result.originLabel).toBe('https://app.example.invalid:*');
  });
});


test.each([undefined, '', '   '])('productionでは空のDIST_PATHを拒否する (%s)', (distPath) => {
  const env = buildEnv({ NODE_ENV: 'production', DIST_PATH: distPath });
  for (const key of ['OPENAI', 'GOOGLE_TRANSLATE', 'GOOGLE_LOGIN', 'LINE_LOGIN', 'ONESIGNAL', 'GOOGLE_ANALYTICS', 'MAIL_DELIVERY']) env[`EXTERNAL_${key}_ENABLED`] = 'false';
  expect(() => loadRuntimeConfig({ env })).toThrow('DIST_PATH is required');
});
