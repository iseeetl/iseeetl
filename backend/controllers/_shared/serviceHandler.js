const handleService = (handler) => async (req, res, next) => {
  try {
    const result = await handler(req, res);
    if (res.headersSent || res.writableEnded) return;
    res.json(result);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  handleService,
};
