const kickedUserService = require('../services/kickedUser.service');

exports.getKickedUserList = async (req, res, next) => {
  try {
    const result = await kickedUserService.getKickedUserList(req.body, req.jwtPayload);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.checkKickedUser = async (req, res, next) => {
  try {
    const result = await kickedUserService.checkKickedUser(req.body, req.jwtPayload);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.createKickedUser = async (req, res, next, io) => {
  try {
    const result = await kickedUserService.createKickedUser(req.body, req.jwtPayload, io);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.deleteKickedUser = async (req, res, next) => {
  try {
    const result = await kickedUserService.deleteKickedUser(req.body, req.jwtPayload);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
