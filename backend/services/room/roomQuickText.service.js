const AppError = require('../../utils/appError');

const FloorMember = require('../../models/FloorMember');

const RoomQuickTextGroup = require('../../models/RoomQuickTextGroup');
const RoomQuickTextItem = require('../../models/RoomQuickTextItem');

const { findActiveUser, findRoomWithFloor } = require('../_shared/activeResource');
const { hasFloorAccess } = require('../_shared/floorAccess');
const { buildQuickTextService } = require('../_shared/quickTextService');
const { authorizeRoomMetadataAccess } = require('./roomAccess.service');

async function ensureRoomAndFloor(roomId) {
  return findRoomWithFloor(roomId, {
    roomError: { code: 'NOT_FOUND' },
    floorError: { code: 'NOT_FOUND' },
  });
}

async function ensurePermission(roomId, jwtPayload) {
  const uid = jwtPayload.user_id;
  const role = jwtPayload.user_role;

  const user = await findActiveUser(uid, { error: { code: 'NOT_FOUND' } });
  const { room, floor } = await ensureRoomAndFloor(roomId);
  const floorMember = await FloorMember.findOne({ floor: floor._id, user: uid }).lean();

  if (!hasFloorAccess({ role, floor, uid, floorMember })) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  return { user, room, floor };
}

module.exports = buildQuickTextService({
  groupModel: RoomQuickTextGroup,
  itemModel: RoomQuickTextItem,
  listContext: ({ roomId, jwtPayload, guest }) =>
    authorizeRoomMetadataAccess(roomId, { jwtPayload, guest }),
  mutationContext: ({ roomId, jwtPayload }) => ensurePermission(roomId, jwtPayload),
  buildGroupFilter: ({ roomId }) => ({ room: roomId }),
  buildItemFilter: ({ roomId, groupId }) => ({ room: roomId, ...(groupId ? { group: groupId } : {}) }),
  allowLangFilter: true,
});
