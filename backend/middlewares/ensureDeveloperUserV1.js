const mongoose = require('mongoose');

const ROLES = require('../constants/roles');
const User = require('../models/User');
const AppError = require('../utils/appError');

module.exports = async function ensureDeveloperUserV1(req, _res, next) {
  const claims = req.jwtPayload;

  if (!claims?.user_id || !mongoose.Types.ObjectId.isValid(claims.user_id)) {
    return next(new AppError({ code: 'TOKEN_INVALID' }));
  }
  if (claims.user_role !== ROLES.DEVELOPER) {
    return next(new AppError({ code: 'FORBIDDEN' }));
  }

  try {
    const user = await User.findOne({
      _id: claims.user_id,
      delete_flg: false,
    }).select('_id role');

    if (!user) return next(new AppError({ code: 'TOKEN_INVALID' }));
    if (user.role !== ROLES.DEVELOPER) {
      return next(new AppError({ code: 'FORBIDDEN' }));
    }

    req.v1Claims = claims;
    req.jwtPayload = {
      user_id: user._id.toString(),
      user_role: user.role,
    };
    return next();
  } catch (error) {
    return next(error);
  }
};
