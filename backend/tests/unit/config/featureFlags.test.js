const {
  CAPABILITY_KEYS,
  EXTERNAL_FLAG_NAMES,
  buildCapabilities,
  initializeFeatureConfiguration,
  getCapabilities,
  getGoogleLoginConfig,
  isGoogleLoginEnabled,
} = require('../../../config/featureFlags');
const { OPENAI_MODEL_ENV } = require('../../_helpers/openai');

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

const ALL_FLAGS_FALSE = Object.freeze(
  Object.fromEntries(EXTERNAL_FLAG_NAMES.map((name) => [name, 'false']))
);

const buildAllEnabledEnv = () => ({
  NODE_ENV: 'production',
  EXTERNAL_OPENAI_ENABLED: 'true',
  EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'true',
  EXTERNAL_GOOGLE_LOGIN_ENABLED: 'true',
  EXTERNAL_LINE_LOGIN_ENABLED: 'true',
  EXTERNAL_ONESIGNAL_ENABLED: 'true',
  EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'true',
  EXTERNAL_MAIL_DELIVERY_ENABLED: 'true',
  GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
  LINE_LOGIN_CHANNEL_ID: 'line-channel-id',
  LINE_LOGIN_CHANNEL_SECRET: 'line-channel-secret',
  LINE_LOGIN_REDIRECT_URI: 'https://app.example.invalid/api/auth/line/callback',
  SEND_MAIL_HOST: 'smtp.example.invalid',
  SEND_MAIL_PORT: '587',
  NO_REPLY_MAIL: 'noreply@example.invalid',
  VUE_APP_APPNAME: 'Test App',
  VUE_APP_APPURL: 'https://app.example.invalid',
  ONESIGNAL_APP_ID: 'onesignal-app-id',
  ONESIGNAL_REST_API_KEYS: 'onesignal-rest-key',
  ONESIGNAL_EXTERNAL_ID_SECRET: 'test-onesignal-external-id-secret-32-bytes',
  GOOGLE_APPLICATION_CREDENTIALS: '/test-fixtures/google/credentials.json',
  GOOGLE_PROJECT_ID: 'dummy-project',
  GOOGLE_TRANSLATE_API_LIMIT: '1000',
  OPENAI_API_KEY: 'dummy-openai-key',
  ...OPENAI_MODEL_ENV,
  GA4_MEASUREMENT_ID: 'G-UNITTEST01',
  GA4_USER_ID_SECRET: 'ga4-dummy-user-id-secret-32-bytes-minimum',
});

const CAPABILITY_BY_FLAG = Object.freeze({
  EXTERNAL_OPENAI_ENABLED: 'openaiAnalysis',
  EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'googleTranslate',
  EXTERNAL_GOOGLE_LOGIN_ENABLED: 'googleLogin',
  EXTERNAL_LINE_LOGIN_ENABLED: 'lineLogin',
  EXTERNAL_ONESIGNAL_ENABLED: 'oneSignalPush',
  EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'googleAnalytics',
  EXTERNAL_MAIL_DELIVERY_ENABLED: 'mailDelivery',
});

describe('外部機能の有効状態と設定検証', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('開発環境でフラグと外部サービス設定がない場合は固定スキーマを全てOFFで返す', () => {
    const env = { NODE_ENV: 'development' };
    const capabilities = buildCapabilities(env);

    expect(capabilities).toEqual(ALL_DISABLED);
    expect(Object.keys(capabilities)).toEqual(CAPABILITY_KEYS);
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(env).toEqual({ NODE_ENV: 'development' });
  });

  test('全フラグがtrueで必須設定が妥当な場合は8 Capabilityを全てONにする', () => {
    expect(buildCapabilities(buildAllEnabledEnv())).toEqual({
      googleLogin: true,
      lineLogin: true,
      mailDelivery: true,
      oneSignalPush: true,
      googleTranslate: true,
      openaiTranscription: true,
      openaiAnalysis: true,
      googleAnalytics: true,
    });
  });

  test.each(['development', 'test', undefined])(
    '%sではフラグ未設定を全外部機能OFFとして扱う',
    (nodeEnv) => {
      const env = {
        OPENAI_API_KEY: 'stale-openai-key',
        GOOGLE_APPLICATION_CREDENTIALS: '/stale/google/credentials.json',
        GOOGLE_OAUTH_CLIENT_ID: 'stale-google-client',
        LINE_LOGIN_CHANNEL_ID: 'stale-line-id',
        ONESIGNAL_APP_ID: 'stale-onesignal-id',
        SEND_MAIL_PORT: 'invalid',
        GA4_MEASUREMENT_ID: 'invalid',
      };
      if (nodeEnv !== undefined) env.NODE_ENV = nodeEnv;

      expect(buildCapabilities(env)).toEqual(ALL_DISABLED);
    }
  );

  test('明示falseなら残存設定を検証せず全外部機能をOFFにする', () => {
    const capabilities = buildCapabilities({
      NODE_ENV: 'production',
      ...ALL_FLAGS_FALSE,
      OPENAI_API_KEY: 'stale-openai-key',
      GOOGLE_TRANSLATE_API_LIMIT: 'invalid',
      GOOGLE_OAUTH_CLIENT_ID: 'stale-google-client',
      LINE_LOGIN_CHANNEL_ID: 'partial-line-id',
      ONESIGNAL_EXTERNAL_ID_SECRET: 'short',
      SEND_MAIL_PORT: 'invalid',
      NO_REPLY_MAIL: 'invalid',
      GA4_MEASUREMENT_ID: 'invalid',
    });

    expect(capabilities).toEqual(ALL_DISABLED);
  });

  test.each(
    ['production', 'staging'].flatMap((nodeEnv) =>
      Object.entries(CAPABILITY_BY_FLAG).map(([flagName, capability]) => [
        nodeEnv,
        flagName,
        capability,
      ])
    )
  )(
    '%sでは%s未設定を変数名だけで拒否する',
    (nodeEnv, flagName, capability) => {
      const env = { NODE_ENV: nodeEnv, ...ALL_FLAGS_FALSE };
      delete env[flagName];

      expect.assertions(4);
      try {
        buildCapabilities(env);
      } catch (error) {
        expect(error.code).toBe('EXTERNAL_FEATURE_CONFIG_INVALID');
        expect(error.capability).toBe(capability);
        expect(error.envNames).toEqual([flagName]);
        expect(error.message).not.toContain('undefined');
      }
    }
  );

  test.each(EXTERNAL_FLAG_NAMES.flatMap((flagName) =>
    ['TRUE', '1', 'yes', 'disabled'].map((value) => [flagName, value])
  ))('フラグ%sの不正値%sを、エラーに設定値を含めず拒否する', (flagName, value) => {
    const env = { NODE_ENV: 'test', ...ALL_FLAGS_FALSE, [flagName]: value };

    expect.assertions(3);
    try {
      buildCapabilities(env);
    } catch (error) {
      expect(error.envNames).toEqual([flagName]);
      expect(error.message).not.toContain(value);
      expect(error.message).toContain(flagName);
    }
  });

  test.each([
    [
      'openaiAnalysis',
      { EXTERNAL_OPENAI_ENABLED: 'true' },
      ['OPENAI_API_KEY', ...Object.keys(OPENAI_MODEL_ENV)],
    ],
    [
      'googleTranslate',
      { EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'true' },
      ['GOOGLE_APPLICATION_CREDENTIALS', 'GOOGLE_PROJECT_ID', 'GOOGLE_TRANSLATE_API_LIMIT'],
    ],
    [
      'googleLogin',
      { EXTERNAL_GOOGLE_LOGIN_ENABLED: 'true' },
      ['GOOGLE_OAUTH_CLIENT_ID'],
    ],
    [
      'lineLogin',
      { EXTERNAL_LINE_LOGIN_ENABLED: 'true' },
      ['LINE_LOGIN_CHANNEL_ID', 'LINE_LOGIN_CHANNEL_SECRET', 'LINE_LOGIN_REDIRECT_URI'],
    ],
    [
      'oneSignalPush',
      { EXTERNAL_ONESIGNAL_ENABLED: 'true' },
      ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEYS', 'ONESIGNAL_EXTERNAL_ID_SECRET'],
    ],
    [
      'googleAnalytics',
      { EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'true' },
      ['GA4_MEASUREMENT_ID', 'GA4_USER_ID_SECRET'],
    ],
    [
      'mailDelivery',
      { EXTERNAL_MAIL_DELIVERY_ENABLED: 'true' },
      ['SEND_MAIL_HOST', 'SEND_MAIL_PORT', 'NO_REPLY_MAIL', 'VUE_APP_APPNAME'],
    ],
  ])('%sをtrueにした場合は必須設定不足を拒否する', (capability, targetEnv, names) => {
    expect.assertions(3);
    try {
      buildCapabilities({ NODE_ENV: 'test', ...ALL_FLAGS_FALSE, ...targetEnv });
    } catch (error) {
      expect(error.capability).toBe(capability);
      expect(error.envNames).toEqual(names);
      expect(error.code).toBe('EXTERNAL_FEATURE_CONFIG_INVALID');
    }
  });

  test.each(Object.keys(OPENAI_MODEL_ENV).flatMap((name) =>
    [undefined, '', '   '].map((value) => [name, value])
  ))('OpenAI有効時は%sの欠落・空値を代替せず拒否する: %s', (name, value) => {
    const env = buildAllEnabledEnv();
    if (value === undefined) delete env[name];
    else env[name] = value;

    expect(() => initializeFeatureConfiguration(env)).toThrow(
      `Invalid external feature configuration for openaiAnalysis: ${name}`
    );
  });

  test('モデル名の前後空白を除去し、無効時はモデルを要求しない', () => {
    const env = buildAllEnabledEnv();
    Object.entries(OPENAI_MODEL_ENV).forEach(([name, value]) => { env[name] = `  ${value}  `; });
    const configuration = initializeFeatureConfiguration(env);
    expect(Object.values(configuration.privateConfig.openai.models)).toEqual(Object.values(OPENAI_MODEL_ENV));

    Object.keys(OPENAI_MODEL_ENV).forEach((name) => { delete env[name]; });
    env.EXTERNAL_OPENAI_ENABLED = 'false';
    const disabled = initializeFeatureConfiguration(env);
    expect(disabled.privateConfig.openai).toBeNull();
    expect(disabled.capabilities.openaiAnalysis).toBe(false);
    expect(disabled.capabilities.openaiTranscription).toBe(false);
  });

  test.each(['0', '-1', '1.5', '1e3', 'not-a-number', '', undefined, '9007199254740992'])(
    '翻訳上限%sは有効時の設定誤りとして拒否する',
    (limit) => {
      const env = {
        NODE_ENV: 'test',
        ...ALL_FLAGS_FALSE,
        EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'true',
        GOOGLE_APPLICATION_CREDENTIALS: '/test-fixtures/google/credentials.json',
        GOOGLE_PROJECT_ID: 'dummy-project',
      };
      if (limit !== undefined) env.GOOGLE_TRANSLATE_API_LIMIT = limit;

      expect(() => buildCapabilities(env)).toThrow(
        'Invalid external feature configuration for googleTranslate: GOOGLE_TRANSLATE_API_LIMIT'
      );
    }
  );

  test.each([
    ['1', 1],
    ['1000', 1000],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['unlimited', null],
  ])('翻訳上限%sはCapability ONと固定済みlimit %sを返す', (limit, expected) => {
    const configuration = initializeFeatureConfiguration({
      NODE_ENV: 'test',
      ...ALL_FLAGS_FALSE,
      EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'true',
      GOOGLE_APPLICATION_CREDENTIALS: '/test-fixtures/google/credentials.json',
      GOOGLE_PROJECT_ID: 'dummy-project',
      GOOGLE_TRANSLATE_API_LIMIT: limit,
    });

    expect(configuration.capabilities.googleTranslate).toBe(true);
    expect(configuration.privateConfig.googleTranslate.limit).toBe(expected);
  });

  test.each(['0', '65536', '1.5', 'invalid'])(
    'メールポート %sは有効時の設定誤りとして拒否する',
    (port) => {
      expect(() => buildCapabilities({
        NODE_ENV: 'test',
        ...ALL_FLAGS_FALSE,
        EXTERNAL_MAIL_DELIVERY_ENABLED: 'true',
        SEND_MAIL_HOST: 'smtp.example.invalid',
        SEND_MAIL_PORT: port,
        NO_REPLY_MAIL: 'noreply@example.invalid',
        VUE_APP_APPNAME: 'Test App',
      })).toThrow('Invalid external feature configuration for mailDelivery: SEND_MAIL_PORT');
    }
  );

  test('不正な送信元メールアドレスを値を出さず拒否する', () => {
    const invalidMail = 'not-an-address';
    expect.assertions(2);
    try {
      buildCapabilities({
        NODE_ENV: 'test',
        ...ALL_FLAGS_FALSE,
        EXTERNAL_MAIL_DELIVERY_ENABLED: 'true',
        SEND_MAIL_HOST: 'smtp.example.invalid',
        SEND_MAIL_PORT: '587',
        NO_REPLY_MAIL: invalidMail,
        VUE_APP_APPNAME: 'Test App',
      });
    } catch (error) {
      expect(error.envNames).toEqual(['NO_REPLY_MAIL']);
      expect(error.message).not.toContain(invalidMail);
    }
  });

  test.each([
    ['不正なMeasurement ID', 'UA-12345', 'a'.repeat(32), ['GA4_MEASUREMENT_ID']],
    ['短いsecret', 'G-UNITTEST01', 'short-secret', ['GA4_USER_ID_SECRET']],
  ])('GA4の%sを値を出さず拒否する', (_label, measurementId, secret, names) => {
    expect.assertions(2);
    try {
      buildCapabilities({
        NODE_ENV: 'test',
        ...ALL_FLAGS_FALSE,
        EXTERNAL_GOOGLE_ANALYTICS_ENABLED: 'true',
        GA4_MEASUREMENT_ID: measurementId,
        GA4_USER_ID_SECRET: secret,
      });
    } catch (error) {
      expect(error.envNames).toEqual(names);
      expect(error.message).not.toContain(names[0] === 'GA4_MEASUREMENT_ID' ? measurementId : secret);
    }
  });

  test('OneSignalは秘密値長、ポート、パスを有効時だけ検証する', () => {
    const base = {
      NODE_ENV: 'test',
      ...ALL_FLAGS_FALSE,
      EXTERNAL_ONESIGNAL_ENABLED: 'true',
      ONESIGNAL_APP_ID: 'onesignal-app-id',
      ONESIGNAL_REST_API_KEYS: 'onesignal-rest-key',
      ONESIGNAL_EXTERNAL_ID_SECRET: 'a'.repeat(32),
    };

    expect(() => buildCapabilities({ ...base, ONESIGNAL_EXTERNAL_ID_SECRET: 'short' }))
      .toThrow('Invalid external feature configuration for oneSignalPush: ONESIGNAL_EXTERNAL_ID_SECRET');
    expect(() => buildCapabilities({ ...base, ONESIGNAL_PORT: '65536' }))
      .toThrow('Invalid external feature configuration for oneSignalPush: ONESIGNAL_PORT');
    expect(() => buildCapabilities({ ...base, ONESIGNAL_PATH: 'api/v1/notifications' }))
      .toThrow('Invalid external feature configuration for oneSignalPush: ONESIGNAL_PATH');

    const configuration = initializeFeatureConfiguration(base);
    expect(configuration.privateConfig.oneSignalPush).toEqual(expect.objectContaining({
      host: 'onesignal.com',
      port: '443',
      path: '/api/v1/notifications',
    }));
  });

  test('LINE コールバックはHTTPまたはHTTPS URLだけを許可する', () => {
    expect(() => buildCapabilities({
      NODE_ENV: 'test',
      ...ALL_FLAGS_FALSE,
      EXTERNAL_LINE_LOGIN_ENABLED: 'true',
      LINE_LOGIN_CHANNEL_ID: 'line-channel-id',
      LINE_LOGIN_CHANNEL_SECRET: 'line-channel-secret',
      LINE_LOGIN_REDIRECT_URI: 'not-a-url',
    })).toThrow(
      'Invalid external feature configuration for lineLogin: LINE_LOGIN_REDIRECT_URI'
    );
  });

  test('外部サービスの秘密設定を正規化して変更不可にし、公開する有効状態に含めない', () => {
    const configuration = initializeFeatureConfiguration(buildAllEnabledEnv());

    expect(configuration.privateConfig.googleLogin.clientId).toBe('google-client-id');
    expect(configuration.privateConfig.lineLogin.clientSecret).toBe('line-channel-secret');
    expect(configuration.privateConfig.mailDelivery.port).toBe(587);
    expect(configuration.privateConfig.oneSignalPush.externalIdSecret).toBe(
      'test-onesignal-external-id-secret-32-bytes'
    );
    expect(configuration.privateConfig.openai.apiKey).toBe('dummy-openai-key');
    expect(configuration.privateConfig.openai.models).toEqual({
      vision: 'test-vision-model',
      video: 'test-video-model',
      audioScene: 'test-audio-model',
      conversation: 'test-conversation-model',
      speech: 'test-transcription-model',
    });
    expect(Object.isFrozen(configuration.privateConfig.openai.models)).toBe(true);
    expect(configuration.privateConfig.analytics.measurementId).toBe('G-UNITTEST01');
    expect(Object.values(configuration.privateConfig).every(Object.isFrozen)).toBe(true);
    expect(configuration.capabilities).not.toHaveProperty('apiKey');
    expect(configuration.capabilities).not.toHaveProperty('clientSecret');
    expect(configuration.capabilities).not.toHaveProperty('models');
  });

  test('起動時初期化後のCapabilityと外部サービス設定はprocess.env変更後もスナップショットを維持する', () => {
    jest.isolateModules(() => {
      process.env = buildAllEnabledEnv();
      const featureFlags = require('../../../config/featureFlags');
      const configuration = featureFlags.initializeFeatureConfiguration();

      process.env.EXTERNAL_GOOGLE_LOGIN_ENABLED = 'false';
      process.env.GOOGLE_OAUTH_CLIENT_ID = 'changed-client-id';
      process.env.OPENAI_API_KEY = 'changed-openai-key';
      Object.keys(OPENAI_MODEL_ENV).forEach((name) => { process.env[name] = 'changed-model'; });

      expect(featureFlags.getCapabilities()).toBe(configuration.capabilities);
      expect(featureFlags.isGoogleLoginEnabled()).toBe(true);
      expect(featureFlags.getGoogleLoginConfig().clientId).toBe('google-client-id');
      expect(featureFlags.getOpenAIConfig().apiKey).toBe('dummy-openai-key');
      expect(featureFlags.getOpenAIConfig().models).toBe(configuration.privateConfig.openai.models);
      expect(Object.values(featureFlags.getOpenAIConfig().models)).not.toContain('changed-model');
    });
  });

  test('未初期化の個別getterは対象外部サービスだけを評価する', () => {
    process.env = {
      NODE_ENV: 'test',
      EXTERNAL_GOOGLE_LOGIN_ENABLED: 'true',
      GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
      EXTERNAL_GOOGLE_TRANSLATE_ENABLED: 'true',
      GOOGLE_APPLICATION_CREDENTIALS: '/test-fixtures/google/credentials.json',
    };

    expect(isGoogleLoginEnabled()).toBe(true);
    expect(getGoogleLoginConfig()).toEqual({ clientId: 'google-client-id' });
    expect(() => getCapabilities()).toThrow(
      'Invalid external feature configuration for googleTranslate: GOOGLE_PROJECT_ID, GOOGLE_TRANSLATE_API_LIMIT'
    );
  });
});
