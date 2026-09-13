const AppError = require('../../utils/appError');

const FloorQuickTextGroup = require('../../models/FloorQuickTextGroup');
const FloorQuickTextItem = require('../../models/FloorQuickTextItem');

const { findActiveUser, findActiveFloor } = require('../_shared/activeResource');
const { isAdminOrCreator } = require('../_shared/floorAccess');
const { buildQuickTextService } = require('../_shared/quickTextService');

async function ensureFloorAndPermission(floorId, jwtPayload) {
  const uid = jwtPayload.user_id;
  const role = jwtPayload.user_role;

  const user = await findActiveUser(uid, { error: { code: 'NOT_FOUND' } });
  const floor = await findActiveFloor(floorId, { error: { code: 'NOT_FOUND' } });

  if (!isAdminOrCreator(role, floor.user.toString(), uid)) {
    throw new AppError({ code: 'FORBIDDEN' });
  }

  return { user, floor };
}

module.exports = buildQuickTextService({
  groupModel: FloorQuickTextGroup,
  itemModel: FloorQuickTextItem,
  listContext: ({ floorId, jwtPayload }) => ensureFloorAndPermission(floorId, jwtPayload),
  mutationContext: ({ floorId, jwtPayload }) => ensureFloorAndPermission(floorId, jwtPayload),
  buildGroupFilter: ({ floorId }) => ({ floor: floorId }),
  buildItemFilter: ({ floorId, groupId }) => ({ floor: floorId, ...(groupId ? { group: groupId } : {}) }),
  allowLangFilter: false,
});
