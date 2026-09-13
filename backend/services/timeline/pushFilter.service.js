const AppError = require('../../utils/appError');
const { isOneSignalEnabled } = require('../../config/featureFlags');
const { authorizeRoomAccess } = require('../../services/room/roomAccess.service');

const PushFilter = require('../../models/PushFilter');

const ensurePushFilterEnabled = () => {
  if (!isOneSignalEnabled()) {
    throw new AppError({
      code: 'EXTERNAL_FEATURE_DISABLED',
      details: { feature: 'oneSignalPush' },
    });
  }
};

exports.create = async (body, jwtPayload) => {
  ensurePushFilterEnabled();
  const floorId = body.floor_id;
  const roomId = body.room_id;
  const conditions = body.conditions;

  const userId = jwtPayload.user_id;
  const userRole = jwtPayload.user_role;

  await authorizeRoomAccess(userId, userRole, roomId);

  // 同じユーザが同じルームへ同じ絞り込み条件を重複登録することを防ぐ。
  const exists = await PushFilter.findOne({
    user: userId,
    room: roomId,
    conditions: conditions,
  });
  if (exists) throw new AppError({ code: 'CONFLICT' });

  const doc = await PushFilter.create({
    user: userId,
    floor: floorId,
    room: roomId,
    conditions: conditions,
  });

  return { _id: doc._id };
};

// 更新するのは絞り込み条件だけで、フィルタの所有者と対象ルームは変更しない。
exports.update = async (id, conditions, jwtPayload) => {
  const userId = jwtPayload.user_id;
  const userRole = jwtPayload.user_role;

  const doc = await PushFilter.findById(id);
  if (!doc) throw new AppError({ code: 'NOT_FOUND' });

  if (doc.user.toString() !== userId) {
    throw new AppError({ code: 'INVALID_PERMISSION' });
  }

  await authorizeRoomAccess(userId, userRole, doc.room.toString());

  await PushFilter.findOneAndUpdate(
    { _id: id },
    { $set: { conditions } },
    { new: false }
  );

  return { _id: id };
};

exports.remove = async (id, jwtPayload) => {
  const userId = jwtPayload.user_id;

  const doc = await PushFilter.findOne({ _id: id });
  if (!doc) throw new AppError({ code: 'NOT_FOUND' });

  if (doc.user.toString() !== userId) throw new AppError({ code: 'INVALID_PERMISSION' });

  // アクセス権を失った後も本人が残ったフィルタを削除できるよう、ルームへのアクセス権は要求しない。
  // 削除条件にも所有者を含め、確認後の競合時にも他人のフィルタを削除しない。
  await PushFilter.deleteOne({ _id: id, user: userId });
};
