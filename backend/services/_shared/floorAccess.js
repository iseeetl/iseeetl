const ROLES = require('../../constants/roles');

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

module.exports = { hasFloorAccess, isAdminOrCreator };
