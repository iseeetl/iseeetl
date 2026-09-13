const assignQueryToBody = (req, _res, next) => {
  if (req.method === 'GET') {
    req.body = { ...req.query };
  }
  next();
};

module.exports = {
  assignQueryToBody,
};
