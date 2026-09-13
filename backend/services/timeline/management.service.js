module.exports = {
  ...require('./management/query.service'),
  ...require('./management/estimate.service'),
  ...require('./management/archive.service'),
  ...require('./management/mutation.service'),
};
