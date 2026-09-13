const uploadService = require('../services/upload.service');

exports.uploadProfileImage = async (req, res, next) => {
  try {
    const result = await uploadService.uploadProfileImage(req.files, req.jwtPayload);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.uploadFloorImage = async (req, res, next) => {
  try {
    const result = await uploadService.uploadFloorImage(req.body, req.files, req.jwtPayload);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.uploadRoomImage = async (req, res, next) => {
  try {
    const result = await uploadService.uploadRoomImage(req.body, req.files, req.jwtPayload);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
