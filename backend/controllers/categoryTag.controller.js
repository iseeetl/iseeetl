const categoryTagService = require('../services/categoryTag.service');

exports.list = async (_req, res, next) => {
  try {
    const result = await categoryTagService.list();
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.paginate = async (req, res, next) => {
  try {
    const result = await categoryTagService.paginate(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const result = await categoryTagService.create(req.body, req.jwtPayload.user_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const result = await categoryTagService.update(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.delete = async (req, res, next) => {
  try {
    const result = await categoryTagService.delete(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.import = async (req, res, next) => {
  try {
    const result = await categoryTagService.import(req.body, req.jwtPayload.user_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
