module.exports = {
  ...require('./user/profile.service'),
  ...require('./user/password.service'),
  ...require('./user/management.service'),
};
