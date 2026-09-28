const ROLES = require('../../constants/roles');
const FloorMember = require('../../models/FloorMember');
const KickedUser = require('../../models/KickedUser');

function isAdminOrCreator(userRole, resourceOwnerId, currentUserId) {
  const isAdministrator = userRole === ROLES.ADMINISTRATOR;
  const isEditor = userRole === ROLES.EDITOR;
  const isCreator = String(resourceOwnerId) === String(currentUserId);
  return isAdministrator || (isEditor && isCreator);
}

function hasFloorAccess({ role, floor, uid, floorMember = null }) {
  if (role === ROLES.ADMINISTRATOR) return true;
  if (role === ROLES.EDITOR && String(floor?.user) === String(uid)) return true;
  return !!floorMember;
}

async function canManageFloor({ role, floor, uid, floorMember }) {
  if (isAdminOrCreator(role, floor?.user, uid)) return true;
  if (!floor?._id || !uid) return false;
  const membership = floorMember === undefined
    ? await FloorMember.findOne({ floor: floor._id, user: uid })
    : floorMember;
  if (!membership) return false;
  // キック記録が残っている間は、所属していても管理操作を許可しない。
  return !(await KickedUser.findOne({ floor: floor._id, user: uid }));
}

module.exports = { hasFloorAccess, isAdminOrCreator, canManageFloor };
