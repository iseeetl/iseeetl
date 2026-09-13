const quickTextService = require('../services/quickText.service');

exports.listAllGroups = async (req, res, next) => {
  try {
    const result = await quickTextService.listAllGroups({ jwtPayload: req.jwtPayload });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.paginateGroups = async (req, res, next) => {
  try {
    const page = req.query.page ? parseInt(req.query.page, 10) : 1;
    const result = await quickTextService.paginateGroups({ page, jwtPayload: req.jwtPayload });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.createGroup = async (req, res, next) => {
  try {
    const { title, lang } = req.body;
    const result = await quickTextService.createGroup({ title, lang, jwtPayload: req.jwtPayload });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updateGroup = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { order, title, lang } = req.body;
    const result = await quickTextService.updateGroup({ id, order, title, lang, jwtPayload: req.jwtPayload });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.deleteGroup = async (req, res, next) => {
  try {
    const id = req.params.id;
    const result = await quickTextService.deleteGroup({ id, jwtPayload: req.jwtPayload });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.listItems = async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    const result = await quickTextService.listItems({ groupId, jwtPayload: req.jwtPayload });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.createItem = async (req, res, next) => {
  try {
    const groupId = req.params.groupId;
    const { label, lang } = req.body;
    const result = await quickTextService.createItem({ groupId, label, lang, jwtPayload: req.jwtPayload });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updateItem = async (req, res, next) => {
  try {
    const id = req.params.id;
    const { order, label, lang } = req.body;
    const result = await quickTextService.updateItem({ id, order, label, lang, jwtPayload: req.jwtPayload });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.deleteItem = async (req, res, next) => {
  try {
    const id = req.params.id;
    const result = await quickTextService.deleteItem({ id, jwtPayload: req.jwtPayload });
    res.json(result);
  } catch (err) {
    next(err);
  }
};
