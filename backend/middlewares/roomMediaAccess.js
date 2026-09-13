const AppError = require('../utils/appError');
const {
  authenticateGuestToken,
  authenticateUserToken,
} = require('../services/auth/tokenAuthentication.service');
const { authorizeRoomAccess } = require('../services/room/roomAccess.service');
const { ensureGuestRoomContext } = require('../services/timeline/shared/guestAccess');
const { USER_MEDIA_COOKIE, GUEST_MEDIA_COOKIE } = require('../utils/mediaAccessCookie');

const MONGO_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

const verifyUserAccess = async (token, roomId) => {
  const { payload } = await authenticateUserToken(token);
  const context = await authorizeRoomAccess(payload.user_id, payload.user_role, roomId);
  return { actor: 'user', context };
};

const verifyGuestAccess = async (token, roomId) => {
  authenticateGuestToken(token);

  const context = await ensureGuestRoomContext(roomId, {
    notFound: { code: 'NOT_FOUND' },
    memberOnly: { code: 'FORBIDDEN' },
  });
  return { actor: 'guest', context: { foundRoom: context.room, foundFloor: context.floor } };
};

module.exports = async (req, _res, next) => {
  const floorId = req.params?.floorId;
  const roomId = req.params?.roomId;
  if (!MONGO_ID_PATTERN.test(floorId || '') || !MONGO_ID_PATTERN.test(roomId || '')) {
    return next(new AppError({ code: 'NOT_FOUND' }));
  }

  try {
    const userToken = req.cookies?.[USER_MEDIA_COOKIE];
    const guestToken = req.cookies?.[GUEST_MEDIA_COOKIE];
    let access;
    if (userToken) access = await verifyUserAccess(userToken, roomId);
    else if (guestToken) access = await verifyGuestAccess(guestToken, roomId);
    else throw new AppError({ code: 'TOKEN_INVALID' });

    if (String(access.context?.foundFloor?._id) !== floorId) {
      throw new AppError({ code: 'NOT_FOUND' });
    }

    req.roomMediaAccess = access;
    return next();
  } catch (error) {
    return next(error);
  }
};
