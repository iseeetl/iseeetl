const userService = require('../services/user.service');

exports.getUserDetail = async (req, res, next) => {
  try {
    const user = await userService.getUserDetail(req.jwtPayload.user_id);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.body, req.jwtPayload.user_id);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const result = await userService.changePassword(req.body, req.jwtPayload, req.io);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.getUserListPaginate = async (req, res, next) => {
  try {
    const users = await userService.getUserListPaginate(req.body, req.jwtPayload);
    res.json(users);
  } catch (err) {
    next(err);
  }
};

exports.managementUpdateUser = async (req, res, next) => {
  try {
    const user = await userService.managementUpdateUser(req.body, req.jwtPayload, req.io);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

exports.managementSetDeleteState = async (req, res, next) => {
  try {
    const user = await userService.managementSetDeleteState(req.body, req.jwtPayload, req.io);
    res.json(user);
  } catch (err) {
    next(err);
  }
};

exports.searchAIAnalysisResultUsers = async (req, res, next) => {
  try {
    const users = await userService.searchAIAnalysisResultUsers(req.body, req.jwtPayload);
    res.json(users);
  } catch (err) {
    next(err);
  }
};
