const { OPENAI_MODEL_ENV } = require('../../_helpers/openai');
describe('結合テストの環境設定の隔離', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
    jest.resetModules();
  });

  test('認証・有効期限・保存先を継承した環境変数より優先し、製品読込前に固定する', () => {
    const path = require('path');
    const { testRuntimePath } = require('../../_helpers/testRuntime');
    const names = ['JWT_SECRET', 'JWT_DEV_SECRET', 'GUEST_JWT_SECRET', 'GUEST_REFRESH_SECRET',
      'JWT_EXPIRES_IN', 'GUEST_ACCESS_TTL', 'GUEST_REFRESH_TTL', 'SIGNUP_TOKEN_TTL_MINUTES',
      'RESET_TOKEN_TTL_MINUTES', 'LOGIN_RATE_LIMIT_WINDOW_MS', 'LOGIN_RATE_LIMIT_MAX',
      'RESET_MAIL_RATE_LIMIT_WINDOW_MS', 'RESET_MAIL_RATE_LIMIT_MAX', 'RESET_MAIL_IP_RATE_LIMIT_MAX'];
    process.env = { ...originalEnvironment, NODE_ENV: 'production',
      ...Object.fromEntries(names.map((name) => [name, 'ambient-dummy'])),
      MEDIA_PATH: '/unusable-dummy/media/', PROFILE_PATH: '/unusable-dummy/profile/' };
    jest.isolateModules(() => require('../../jest.integration.environment'));
    expect(process.env.NODE_ENV).toBe('test');
    names.forEach((name) => {
      expect(process.env[name]).toBeTruthy();
      expect(process.env[name]).not.toBe('ambient-dummy');
    });
    ['MEDIA_PATH', 'PROFILE_PATH'].forEach((name) => {
      expect(process.env[name].startsWith(testRuntimePath('integration') + path.sep)).toBe(true);
      expect(process.env[name].endsWith(path.sep)).toBe(true);
    });
    expect(require('../../../jest.integration.config').maxWorkers).toBe(1);
  });

  test('開発環境から継承した外部サービス設定を結合テスト読込前に隔離する', () => {
    process.env = {
      ...originalEnvironment,
      GA4_MEASUREMENT_ID: 'G-AMBIENT001',
      GA4_USER_ID_SECRET: 'ambient-real-looking-secret-value',
      EXTERNAL_OPENAI_ENABLED: 'true',
      ...OPENAI_MODEL_ENV,
      EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'true',
      EXTERNAL_GOOGLE_LOGIN_ENABLED: 'true',
      EXTERNAL_LINE_LOGIN_ENABLED: 'true',
      EXTERNAL_ONESIGNAL_ENABLED: 'true',
      EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'true',
      EXTERNAL_MAIL_DELIVERY_ENABLED: 'true',
      VUE_APP_APPURL: 'https://ambient.example.invalid',
    };

    jest.isolateModules(() => {
      require('../../jest.integration.environment');
    });

    expect(process.env.GA4_MEASUREMENT_ID).toBeUndefined();
    expect(process.env.GA4_USER_ID_SECRET).toBeUndefined();
    expect(process.env.EXTERNAL_OPENAI_ENABLED).toBe('false');
    Object.keys(OPENAI_MODEL_ENV).forEach((name) => expect(process.env[name]).toBeUndefined());
    expect(process.env.EXTERNAL_GOOGLE_TRANSLATE_ENABLED).toBe('false');
    expect(process.env.EXTERNAL_GOOGLE_LOGIN_ENABLED).toBe('false');
    expect(process.env.EXTERNAL_LINE_LOGIN_ENABLED).toBe('false');
    expect(process.env.EXTERNAL_ONESIGNAL_ENABLED).toBe('false');
    expect(process.env.EXTERNAL_GOOGLE_ANALYTICS_ENABLED).toBe('false');
    expect(process.env.EXTERNAL_MAIL_DELIVERY_ENABLED).toBe('false');
    expect(process.env.VUE_APP_APPURL).toBe('http://localhost:3000');
  });

  test('単体テストの準備時に外部サービスを明示的に無効にする', () => {
    expect(originalEnvironment.EXTERNAL_OPENAI_ENABLED).toBe('false');
    expect(originalEnvironment.EXTERNAL_GOOGLE_TRANSLATE_ENABLED).toBe('false');
    expect(originalEnvironment.EXTERNAL_GOOGLE_LOGIN_ENABLED).toBe('false');
    expect(originalEnvironment.EXTERNAL_LINE_LOGIN_ENABLED).toBe('false');
    expect(originalEnvironment.EXTERNAL_ONESIGNAL_ENABLED).toBe('false');
    expect(originalEnvironment.EXTERNAL_GOOGLE_ANALYTICS_ENABLED).toBe('false');
    expect(originalEnvironment.EXTERNAL_MAIL_DELIVERY_ENABLED).toBe('false');
  });
});
