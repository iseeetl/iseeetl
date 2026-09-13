const spamService = require('../services/spam.service');

exports.getSpamList = async (req, res, next) => {
  try {
    const result = await spamService.getSpamList(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.createSpam = async (req, res, next) => {
  try {
    const result = await spamService.createSpam(req.body, req.jwtPayload.user_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updateSpam = async (req, res, next) => {
  try {
    const result = await spamService.updateSpam(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.deleteSpam = async (req, res, next) => {
  try {
    const result = await spamService.deleteSpam(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
