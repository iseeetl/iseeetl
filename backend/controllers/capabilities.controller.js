const { CAPABILITY_KEYS, getGoogleLoginConfig, getOneSignalConfig } = require('../config/featureFlags');

const buildPublicCapabilities = (capabilities) =>
  Object.freeze(
    Object.fromEntries(
      CAPABILITY_KEYS.map((key) => [key, capabilities[key] === true])
    )
  );

const createGetCapabilities = ({ capabilities } = {}) => {
  if (!capabilities || typeof capabilities !== 'object') {
    throw new Error('createGetCapabilities requires capabilities');
  }
  const publicCapabilities = buildPublicCapabilities(capabilities);

  return (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(publicCapabilities);
  };
};

// The OAuth client ID is public. Never return the private configuration object.
const createGetGoogleLoginConfig = ({ capabilities, getConfig = getGoogleLoginConfig } = {}) => {
  if (!capabilities || typeof capabilities !== 'object') {
    throw new Error('createGetGoogleLoginConfig requires capabilities');
  }
  return (_req, res) => {
    const configuredId = capabilities.googleLogin === true ? getConfig()?.clientId : '';
    const clientId = typeof configuredId === 'string' ? configuredId.trim() : '';
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ clientId });
  };
};

// Only the public App ID is returned; provider keys never leave the server.
const createGetOneSignalPublicConfig = ({ capabilities, getConfig = getOneSignalConfig } = {}) => {
  if (!capabilities || typeof capabilities !== 'object') throw new Error('capabilities required');
  return (_req, res) => {
    const configuredId = capabilities.oneSignalPush === true ? getConfig()?.appId : '';
    const appId = typeof configuredId === 'string' ? configuredId.trim() : '';
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ appId });
  };
};

module.exports = {
  createGetOneSignalPublicConfig,
  createGetGoogleLoginConfig,
  buildPublicCapabilities,
  createGetCapabilities,
};
