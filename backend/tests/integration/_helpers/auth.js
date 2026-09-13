const jwt = require('jsonwebtoken');

const snapshotEnv = (keys) =>
  keys.reduce((acc, key) => {
    acc[key] = process.env[key];
    return acc;
  }, {});

const restoreEnv = (snapshot) => {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
};

const ensureEnvValue = (key, fallback) => {
  if (!process.env[key]) process.env[key] = fallback;
};

const createJwtToken = (payload, secret = process.env.JWT_SECRET, signOptions = {}) =>
  jwt.sign(payload, secret, signOptions);

const createUserToken = (user, secret = process.env.JWT_SECRET, overrides = {}, signOptions = {}) =>
  createJwtToken(
    {
      user_id: user._id.toString(),
      user_role: user.role,
      ...overrides,
    },
    secret,
    signOptions
  );

module.exports = {
  snapshotEnv,
  restoreEnv,
  ensureEnvValue,
  createJwtToken,
  createUserToken,
};
