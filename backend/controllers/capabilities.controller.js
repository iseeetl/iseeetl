const { CAPABILITY_KEYS, getGoogleLoginConfig } = require('../config/featureFlags');

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

module.exports = {
  createGetGoogleLoginConfig,
  buildPublicCapabilities,
  createGetCapabilities,
};
