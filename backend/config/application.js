const { normalizeEnvValue } = require('./env');

let initializedApplicationConfig = null;

const invalidApplicationConfiguration = (names) => {
  const error = new Error(`Invalid application configuration: ${names.join(', ')}`);
  error.code = 'APPLICATION_CONFIG_INVALID';
  error.envNames = Object.freeze([...names]);
  return error;
};

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_error) {
    return false;
  }
};

const resolveApplicationConfig = (env = process.env) => {
  const appUrl = normalizeEnvValue(env.VUE_APP_APPURL);
  if (!appUrl || !isHttpUrl(appUrl)) {
    throw invalidApplicationConfiguration(['VUE_APP_APPURL']);
  }
  return Object.freeze({ appUrl });
};

const initializeApplicationConfig = (env = process.env) => {
  const resolved = resolveApplicationConfig(env);
  if (env !== process.env) return resolved;
  if (!initializedApplicationConfig) initializedApplicationConfig = resolved;
  return initializedApplicationConfig;
};

const getApplicationConfig = () =>
  initializedApplicationConfig || resolveApplicationConfig(process.env);

module.exports = {
  getApplicationConfig,
  initializeApplicationConfig,
  resolveApplicationConfig,
};
