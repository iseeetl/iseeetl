const { validationResult } = require('express-validator');

const buildReq = ({ body = {}, params = {}, query = {}, files } = {}) => ({
  body,
  params,
  query,
  files,
});

const runValidators = async (validators, req) => {
  const list = Array.isArray(validators) ? validators : [validators];
  for (const validator of list) {
    if (validator && typeof validator.run === 'function') {
      await validator.run(req);
    }
  }
  return validationResult(req);
};

module.exports = {
  buildReq,
  runValidators,
};
