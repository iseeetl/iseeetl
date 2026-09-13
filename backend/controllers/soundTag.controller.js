const soundTagService = require('../services/soundTag.service');

exports.getSoundTag = async (req, res, next) => {
  try {
    const result = await soundTagService.getSoundTag(req.body, req.jwtPayload);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.createSoundTag = async (req, res, next) => {
  try {
    const result = await soundTagService.createSoundTag(req.body, req.jwtPayload);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.updateSoundTag = async (req, res, next) => {
  try {
    const result = await soundTagService.updateSoundTag(req.body, req.jwtPayload);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
