const { CAPABILITY_KEYS } = require('../config/featureFlags');

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

module.exports = {
  buildPublicCapabilities,
  createGetCapabilities,
};
