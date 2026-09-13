const { normalizeEnvValue } = require('./env');

const CAPABILITY_KEYS = Object.freeze([
  'googleLogin',
  'lineLogin',
  'mailDelivery',
  'oneSignalPush',
  'googleTranslate',
  'openaiTranscription',
  'openaiAnalysis',
  'googleAnalytics',
]);

const ONESIGNAL_DEFAULTS = Object.freeze({
  ONESIGNAL_HOST: 'onesignal.com',
  ONESIGNAL_PORT: '443',
  ONESIGNAL_PATH: '/api/v1/notifications',
});

const MIN_ONESIGNAL_SECRET_BYTES = 32;
const MIN_GA4_USER_ID_SECRET_BYTES = 32;
const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const MAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const EXTERNAL_OPENAI_ENABLED = 'EXTERNAL_OPENAI_ENABLED';
const EXTERNAL_GOOGLE_TRANSLATE_ENABLED = 'EXTERNAL_GOOGLE_TRANSLATE_ENABLED';
const EXTERNAL_GOOGLE_LOGIN_ENABLED = 'EXTERNAL_GOOGLE_LOGIN_ENABLED';
const EXTERNAL_LINE_LOGIN_ENABLED = 'EXTERNAL_LINE_LOGIN_ENABLED';
const EXTERNAL_ONESIGNAL_ENABLED = 'EXTERNAL_ONESIGNAL_ENABLED';
const EXTERNAL_GOOGLE_ANALYTICS_ENABLED = 'EXTERNAL_GOOGLE_ANALYTICS_ENABLED';
const EXTERNAL_MAIL_DELIVERY_ENABLED = 'EXTERNAL_MAIL_DELIVERY_ENABLED';
const EXTERNAL_FLAG_NAMES = Object.freeze([
  EXTERNAL_OPENAI_ENABLED,
  EXTERNAL_GOOGLE_TRANSLATE_ENABLED,
  EXTERNAL_GOOGLE_LOGIN_ENABLED,
  EXTERNAL_LINE_LOGIN_ENABLED,
  EXTERNAL_ONESIGNAL_ENABLED,
  EXTERNAL_GOOGLE_ANALYTICS_ENABLED,
  EXTERNAL_MAIL_DELIVERY_ENABLED,
]);
const EXPLICIT_FLAG_REQUIRED_ENVIRONMENTS = new Set(['staging', 'production']);

let initializedRuntime = null;

const readEnv = (env, name) => normalizeEnvValue(env[name]);

const invalidConfiguration = (capability, names) => {
  const error = new Error(
    `Invalid external feature configuration for ${capability}: ${names.join(', ')}`
  );
  error.code = 'EXTERNAL_FEATURE_CONFIG_INVALID';
  error.capability = capability;
  error.envNames = Object.freeze([...names]);
  return error;
};

const resolveExplicitExternalFlag = ({ capability, name, env }) => {
  const value = readEnv(env, name);
  if (value === 'true') return true;
  if (value === 'false') return false;

  const nodeEnv = readEnv(env, 'NODE_ENV');
  if (!value && !EXPLICIT_FLAG_REQUIRED_ENVIRONMENTS.has(nodeEnv)) return false;
  throw invalidConfiguration(capability, [name]);
};

const resolveRequiredEnvGroup = ({ capability, names, env, validators = {} }) => {
  const configuredNames = names.filter((name) => readEnv(env, name));
  if (configuredNames.length === 0) return false;

  const invalidNames = names.filter((name) => {
    const value = readEnv(env, name);
    if (!value) return true;
    const validator = validators[name];
    return typeof validator === 'function' && !validator(value);
  });

  if (invalidNames.length > 0) throw invalidConfiguration(capability, invalidNames);
  return true;
};

const isPositiveSafeInteger = (value) => {
  if (!POSITIVE_INTEGER_PATTERN.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
};

const isValidPort = (value) => {
  if (!isPositiveSafeInteger(value)) return false;
  const port = Number(value);
  return port <= 65535;
};

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_error) {
    return false;
  }
};

const resolveExplicitProvider = ({
  capability,
  flagName,
  env,
  requiredNames,
  validators,
  buildConfig,
}) => {
  const enabled = resolveExplicitExternalFlag({ capability, name: flagName, env });
  if (!enabled) return Object.freeze({ enabled: false, config: null });

  const configured = resolveRequiredEnvGroup({
    capability,
    names: requiredNames,
    env,
    validators,
  });
  if (!configured) throw invalidConfiguration(capability, requiredNames);

  return Object.freeze({
    enabled: true,
    config: Object.freeze(buildConfig()),
  });
};

const resolveOpenAI = (env) => {
  const provider = resolveExplicitProvider({
    capability: 'openaiAnalysis',
    flagName: EXTERNAL_OPENAI_ENABLED,
    env,
    requiredNames: [
      'OPENAI_API_KEY',
      'OPENAI_VISION_MODEL',
      'OPENAI_VIDEO_MODEL',
      'OPENAI_AUDIO_MODEL',
      'OPENAI_CONVERSATION_MODEL',
      'OPENAI_TRANSCRIPTION_MODEL',
    ],
    buildConfig: () => ({
      apiKey: readEnv(env, 'OPENAI_API_KEY'),
      models: Object.freeze({
        vision: readEnv(env, 'OPENAI_VISION_MODEL'),
        video: readEnv(env, 'OPENAI_VIDEO_MODEL'),
        audioScene: readEnv(env, 'OPENAI_AUDIO_MODEL'),
        conversation: readEnv(env, 'OPENAI_CONVERSATION_MODEL'),
        speech: readEnv(env, 'OPENAI_TRANSCRIPTION_MODEL'),
      }),
    }),
  });

  return Object.freeze({
    transcription: provider.enabled,
    analysis: provider.enabled,
    config: provider.config,
  });
};

const resolveGoogleTranslate = (env) =>
  resolveExplicitProvider({
    capability: 'googleTranslate',
    flagName: EXTERNAL_GOOGLE_TRANSLATE_ENABLED,
    env,
    requiredNames: [
      'GOOGLE_APPLICATION_CREDENTIALS',
      'GOOGLE_PROJECT_ID',
      'GOOGLE_TRANSLATE_API_LIMIT',
    ],
    validators: {
      GOOGLE_TRANSLATE_API_LIMIT: (value) =>
        value === 'unlimited' || isPositiveSafeInteger(value),
    },
    buildConfig: () => {
      const limitValue = readEnv(env, 'GOOGLE_TRANSLATE_API_LIMIT');
      return {
        credentialsPath: readEnv(env, 'GOOGLE_APPLICATION_CREDENTIALS'),
        projectId: readEnv(env, 'GOOGLE_PROJECT_ID'),
        location: readEnv(env, 'GOOGLE_TRANSLATE_LOCATION') || 'global',
        limit: limitValue === 'unlimited' ? null : Number(limitValue),
      };
    },
  });

const resolveGoogleLogin = (env) =>
  resolveExplicitProvider({
    capability: 'googleLogin',
    flagName: EXTERNAL_GOOGLE_LOGIN_ENABLED,
    env,
    requiredNames: ['GOOGLE_OAUTH_CLIENT_ID'],
    buildConfig: () => ({ clientId: readEnv(env, 'GOOGLE_OAUTH_CLIENT_ID') }),
  });

const resolveLineLogin = (env) =>
  resolveExplicitProvider({
    capability: 'lineLogin',
    flagName: EXTERNAL_LINE_LOGIN_ENABLED,
    env,
    requiredNames: [
      'LINE_LOGIN_CHANNEL_ID',
      'LINE_LOGIN_CHANNEL_SECRET',
      'LINE_LOGIN_REDIRECT_URI',
    ],
    validators: {
      LINE_LOGIN_REDIRECT_URI: isHttpUrl,
    },
    buildConfig: () => ({
      clientId: readEnv(env, 'LINE_LOGIN_CHANNEL_ID'),
      clientSecret: readEnv(env, 'LINE_LOGIN_CHANNEL_SECRET'),
      redirectUri: readEnv(env, 'LINE_LOGIN_REDIRECT_URI'),
    }),
  });

const resolveMailDelivery = (env) =>
  resolveExplicitProvider({
    capability: 'mailDelivery',
    flagName: EXTERNAL_MAIL_DELIVERY_ENABLED,
    env,
    requiredNames: ['SEND_MAIL_HOST', 'SEND_MAIL_PORT', 'NO_REPLY_MAIL', 'VUE_APP_APPNAME'],
    validators: {
      SEND_MAIL_PORT: isValidPort,
      NO_REPLY_MAIL: (value) => MAIL_ADDRESS_PATTERN.test(value),
    },
    buildConfig: () => ({
      host: readEnv(env, 'SEND_MAIL_HOST'),
      port: Number(readEnv(env, 'SEND_MAIL_PORT')),
      noReplyMail: readEnv(env, 'NO_REPLY_MAIL'),
      appName: readEnv(env, 'VUE_APP_APPNAME'),
      appUrl: readEnv(env, 'VUE_APP_APPURL'),
    }),
  });

const resolveOneSignalPush = (env) => {
  const provider = resolveExplicitProvider({
    capability: 'oneSignalPush',
    flagName: EXTERNAL_ONESIGNAL_ENABLED,
    env,
    requiredNames: [
      'ONESIGNAL_APP_ID',
      'ONESIGNAL_REST_API_KEYS',
      'ONESIGNAL_EXTERNAL_ID_SECRET',
    ],
    validators: {
      ONESIGNAL_EXTERNAL_ID_SECRET: (value) =>
        Buffer.byteLength(value, 'utf8') >= MIN_ONESIGNAL_SECRET_BYTES,
    },
    buildConfig: () => ({
      appId: readEnv(env, 'ONESIGNAL_APP_ID'),
      restApiKey: readEnv(env, 'ONESIGNAL_REST_API_KEYS'),
      externalIdSecret: readEnv(env, 'ONESIGNAL_EXTERNAL_ID_SECRET'),
      host: readEnv(env, 'ONESIGNAL_HOST') || ONESIGNAL_DEFAULTS.ONESIGNAL_HOST,
      port: readEnv(env, 'ONESIGNAL_PORT') || ONESIGNAL_DEFAULTS.ONESIGNAL_PORT,
      path: readEnv(env, 'ONESIGNAL_PATH') || ONESIGNAL_DEFAULTS.ONESIGNAL_PATH,
    }),
  });

  if (!provider.enabled) return provider;

  const invalidNames = [];
  if (!isValidPort(provider.config.port)) invalidNames.push('ONESIGNAL_PORT');
  if (!provider.config.path.startsWith('/')) invalidNames.push('ONESIGNAL_PATH');
  if (invalidNames.length > 0) throw invalidConfiguration('oneSignalPush', invalidNames);
  return provider;
};

const resolveGoogleAnalytics = (env) => {
  const enabled = resolveExplicitExternalFlag({
    capability: 'googleAnalytics',
    name: EXTERNAL_GOOGLE_ANALYTICS_ENABLED,
    env,
  });
  if (!enabled) {
    return Object.freeze({ enabled: false, measurementId: null, userIdSecret: null });
  }

  const names = ['GA4_MEASUREMENT_ID', 'GA4_USER_ID_SECRET'];
  const configured = resolveRequiredEnvGroup({
    capability: 'googleAnalytics',
    names,
    env,
    validators: {
      GA4_MEASUREMENT_ID: (value) => GA4_MEASUREMENT_ID_PATTERN.test(value),
      GA4_USER_ID_SECRET: (value) =>
        Buffer.byteLength(value, 'utf8') >= MIN_GA4_USER_ID_SECRET_BYTES,
    },
  });
  if (!configured) throw invalidConfiguration('googleAnalytics', names);

  return Object.freeze({
    enabled: true,
    measurementId: readEnv(env, 'GA4_MEASUREMENT_ID'),
    userIdSecret: readEnv(env, 'GA4_USER_ID_SECRET'),
  });
};

const resolveFeatureConfiguration = (env = process.env) => {
  const openai = resolveOpenAI(env);
  const googleTranslate = resolveGoogleTranslate(env);
  const googleLogin = resolveGoogleLogin(env);
  const lineLogin = resolveLineLogin(env);
  const mailDelivery = resolveMailDelivery(env);
  const oneSignalPush = resolveOneSignalPush(env);
  const analytics = resolveGoogleAnalytics(env);

  const capabilities = Object.freeze({
    googleLogin: googleLogin.enabled,
    lineLogin: lineLogin.enabled,
    mailDelivery: mailDelivery.enabled,
    oneSignalPush: oneSignalPush.enabled,
    googleTranslate: googleTranslate.enabled,
    openaiTranscription: openai.transcription,
    openaiAnalysis: openai.analysis,
    googleAnalytics: analytics.enabled,
  });

  const privateConfig = Object.freeze({
    googleLogin: googleLogin.config,
    lineLogin: lineLogin.config,
    mailDelivery: mailDelivery.config,
    oneSignalPush: oneSignalPush.config,
    googleTranslate: googleTranslate.config,
    openai: openai.config,
    analytics: Object.freeze({
      measurementId: analytics.measurementId,
      userIdSecret: analytics.userIdSecret,
    }),
  });

  return Object.freeze({ capabilities, privateConfig });
};

const buildCapabilities = (env = process.env) => resolveFeatureConfiguration(env).capabilities;

const initializeFeatureConfiguration = (env = process.env) => {
  const resolved = resolveFeatureConfiguration(env);
  if (env !== process.env) return resolved;
  if (!initializedRuntime) initializedRuntime = resolved;
  return initializedRuntime;
};

const initializeCapabilities = (env = process.env) =>
  initializeFeatureConfiguration(env).capabilities;

const getCapabilities = () =>
  initializedRuntime
    ? initializedRuntime.capabilities
    : buildCapabilities(process.env);

const getCapability = (name, resolveFallback) =>
  initializedRuntime
    ? initializedRuntime.capabilities[name]
    : resolveFallback(process.env);

const getProviderConfig = (name, resolveFallback) =>
  initializedRuntime
    ? initializedRuntime.privateConfig[name]
    : resolveFallback(process.env);

const isLineLoginEnabled = () =>
  getCapability('lineLogin', (env) => resolveLineLogin(env).enabled);
const isOneSignalEnabled = () =>
  getCapability('oneSignalPush', (env) => resolveOneSignalPush(env).enabled);
const isMailDeliveryEnabled = () =>
  getCapability('mailDelivery', (env) => resolveMailDelivery(env).enabled);
const isGoogleLoginEnabled = () =>
  getCapability('googleLogin', (env) => resolveGoogleLogin(env).enabled);
const isGoogleTranslateEnabled = () =>
  getCapability('googleTranslate', (env) => resolveGoogleTranslate(env).enabled);
const isOpenAITranscriptionEnabled = () =>
  getCapability('openaiTranscription', (env) => resolveOpenAI(env).transcription);
const isOpenAIAnalysisEnabled = () =>
  getCapability('openaiAnalysis', (env) => resolveOpenAI(env).analysis);
const isGoogleAnalyticsEnabled = () =>
  getCapability('googleAnalytics', (env) => resolveGoogleAnalytics(env).enabled);

const getGoogleLoginConfig = () =>
  getProviderConfig('googleLogin', (env) => resolveGoogleLogin(env).config);
const getLineLoginConfig = () =>
  getProviderConfig('lineLogin', (env) => resolveLineLogin(env).config);
const getMailDeliveryConfig = () =>
  getProviderConfig('mailDelivery', (env) => resolveMailDelivery(env).config);
const getOneSignalConfig = () =>
  getProviderConfig('oneSignalPush', (env) => resolveOneSignalPush(env).config);
const getGoogleTranslateConfig = () =>
  getProviderConfig('googleTranslate', (env) => resolveGoogleTranslate(env).config);
const getOpenAIConfig = () =>
  getProviderConfig('openai', (env) => resolveOpenAI(env).config);

// 既存の呼び出し名との互換性を保ち、OpenAIの文字起こしが有効かどうかを返す。
const isOpenAIEnabled = isOpenAITranscriptionEnabled;

module.exports = {
  CAPABILITY_KEYS,
  ONESIGNAL_DEFAULTS,
  MIN_ONESIGNAL_SECRET_BYTES,
  MIN_GA4_USER_ID_SECRET_BYTES,
  GA4_MEASUREMENT_ID_PATTERN,
  EXTERNAL_OPENAI_ENABLED,
  EXTERNAL_GOOGLE_TRANSLATE_ENABLED,
  EXTERNAL_GOOGLE_LOGIN_ENABLED,
  EXTERNAL_LINE_LOGIN_ENABLED,
  EXTERNAL_ONESIGNAL_ENABLED,
  EXTERNAL_GOOGLE_ANALYTICS_ENABLED,
  EXTERNAL_MAIL_DELIVERY_ENABLED,
  EXTERNAL_FLAG_NAMES,
  resolveRequiredEnvGroup,
  buildCapabilities,
  initializeFeatureConfiguration,
  initializeCapabilities,
  getCapabilities,
  getGoogleLoginConfig,
  getLineLoginConfig,
  getMailDeliveryConfig,
  getOneSignalConfig,
  getGoogleTranslateConfig,
  getOpenAIConfig,
  isLineLoginEnabled,
  isOneSignalEnabled,
  isMailDeliveryEnabled,
  isGoogleLoginEnabled,
  isGoogleTranslateEnabled,
  isOpenAITranscriptionEnabled,
  isOpenAIAnalysisEnabled,
  isGoogleAnalyticsEnabled,
  isOpenAIEnabled,
};
