const AppError = require('../utils/appError');
const FloorMember = require('../models/FloorMember');
const { findActiveFloor, findRoomWithFloor } = require('../services/_shared/activeResource');
const { hasFloorAccess, isAdminOrCreator } = require('../services/_shared/floorAccess');
const { authorizeRoomAccess } = require('../services/room/roomAccess.service');

const MONGO_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const sameMongoId = (left, right) =>
  typeof left === 'string' &&
  typeof right === 'string' &&
  left.toLowerCase() === right.toLowerCase();

const readTarget = (req, { room = false } = {}) => {
  const floorId = req.query?.floor_id;
  const roomId = room ? req.query?.room_id : null;
  if (
    typeof floorId !== 'string' ||
    !MONGO_ID_PATTERN.test(floorId) ||
    (room && (typeof roomId !== 'string' || !MONGO_ID_PATTERN.test(roomId)))
  ) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
  return { floorId, roomId };
};

const saveTarget = (req, target, context) => {
  req.uploadTarget = { ...target, ...context };
};

const authorizeFloorImageUpload = async (req, _res, next) => {
  try {
    const target = readTarget(req);
    const floor = await findActiveFloor(target.floorId, { error: { code: 'INVALID_PARAMS' } });
    if (!isAdminOrCreator(req.jwtPayload?.user_role, floor.user, req.jwtPayload?.user_id)) {
      throw new AppError({ code: 'FORBIDDEN' });
    }
    const floorId = String(floor._id);
    if (!MONGO_ID_PATTERN.test(floorId) || !sameMongoId(target.floorId, floorId)) {
      throw new AppError({ code: 'INVALID_PARAMS' });
    }
    saveTarget(req, { floorId, roomId: null }, { floor });
    return next();
  } catch (error) {
    return next(error);
  }
};

const authorizeRoomImageUpload = async (req, _res, next) => {
  try {
    const target = readTarget(req, { room: true });
    const { room, floor } = await findRoomWithFloor(target.roomId, {
      roomError: { code: 'INVALID_PARAMS' },
      floorError: { code: 'INVALID_PARAMS' },
    });
    const floorId = String(floor._id);
    const roomId = String(room._id);
    if (
      !MONGO_ID_PATTERN.test(floorId) ||
      !MONGO_ID_PATTERN.test(roomId) ||
      !sameMongoId(target.floorId, floorId) ||
      !sameMongoId(target.roomId, roomId)
    ) {
      throw new AppError({ code: 'INVALID_PARAMS' });
    }

    const userId = req.jwtPayload?.user_id;
    const floorMember = await FloorMember.findOne({ floor: floor._id, user: userId }).lean();
    if (!hasFloorAccess({ role: req.jwtPayload?.user_role, floor, uid: userId, floorMember })) {
      throw new AppError({ code: 'FORBIDDEN' });
    }
    saveTarget(req, { floorId, roomId }, { room, floor });
    return next();
  } catch (error) {
    return next(error);
  }
};

const authorizeV1TimelineUpload = async (req, _res, next) => {
  try {
    const roomId = req.query?.room_id;
    if (typeof roomId !== 'string' || !MONGO_ID_PATTERN.test(roomId)) {
      throw new AppError({ code: 'INVALID_PARAMS' });
    }

    const context = await authorizeRoomAccess(
      req.jwtPayload?.user_id,
      req.jwtPayload?.user_role,
      roomId
    );
    const floorId = context.foundFloor?._id?.toString();
    const canonicalRoomId = context.foundRoom?._id?.toString();
    if (
      !floorId ||
      !canonicalRoomId ||
      !MONGO_ID_PATTERN.test(floorId) ||
      !MONGO_ID_PATTERN.test(canonicalRoomId) ||
      !sameMongoId(roomId, canonicalRoomId)
    ) {
      throw new AppError({ code: 'INVALID_PARAMS' });
    }

    const queryFloorId = req.query?.floor_id;
    if (
      queryFloorId !== undefined &&
      (typeof queryFloorId !== 'string' ||
        !MONGO_ID_PATTERN.test(queryFloorId) ||
        !sameMongoId(queryFloorId, floorId))
    ) {
      throw new AppError({ code: 'INVALID_PARAMS' });
    }

    saveTarget(req, { floorId, roomId: canonicalRoomId }, context);
    return next();
  } catch (error) {
    return next(error);
  }
};

const requireMatchingUploadBody = (req, _res, next) => {
  const target = req.uploadTarget;
  if (!target) return next(new AppError({ code: 'INVALID_PARAMS' }));

  const bodyFloorId = req.body?.floor_id || req.body?._id;
  const bodyRoomId = req.body?.room_id || req.body?._id;
  if (
    !sameMongoId(bodyFloorId, target.floorId) ||
    (target.roomId && !sameMongoId(bodyRoomId, target.roomId))
  ) {
    return next(new AppError({ code: 'INVALID_PARAMS' }));
  }

  // 後続の処理と保存先の決定には、認可済みデータから得た正規化済みIDを使う。
  if (req.body?.floor_id !== undefined) req.body.floor_id = target.floorId;
  if (req.body?.room_id !== undefined) req.body.room_id = target.roomId;
  if (req.body?._id !== undefined) req.body._id = target.roomId || target.floorId;
  return next();
};

const authorizeTimelineResourceUpload = ({ errors } = {}) => async (req, _res, next) => {
  try {
    const roomId = req.params.room_id;
    if (typeof roomId !== 'string' || !MONGO_ID_PATTERN.test(roomId) || Object.keys(req.query).length) {
      throw new AppError({ code: 'INVALID_PARAMS' });
    }
    const context = await authorizeRoomAccess(req.jwtPayload.user_id, req.jwtPayload.user_role, roomId, { errors });
    saveTarget(req, { floorId: String(context.foundFloor._id), roomId: String(context.foundRoom._id) }, context);
    return next();
  } catch (error) { return next(error); }
};

module.exports = {
  authorizeFloorImageUpload,
  authorizeRoomImageUpload,
  authorizeV1TimelineUpload,
  authorizeTimelineResourceUpload,
  requireMatchingUploadBody,
};
