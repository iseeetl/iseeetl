// 外部公開API v1のJWTを、専用のJWT_DEV_SECRETで検証する。

const AppError = require('../utils/appError');
const jwt = require('jsonwebtoken');
module.exports = (req, _res, next) => {
  if (req.headers['authorization']) {
    const bearerHeader = req.headers['authorization'];
    const bearer = bearerHeader.split(' ');
    const bearerToken = bearer[1];
    jwt.verify(bearerToken, process.env.JWT_DEV_SECRET, (err, decoded) => {
      if (err) {
        const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
        return next(new AppError({ code }));
      }
      req.jwtPayload = decoded;
      next();
    });
  } else {
    return next(new AppError({ code: 'TOKEN_INVALID' }));
  }
};
