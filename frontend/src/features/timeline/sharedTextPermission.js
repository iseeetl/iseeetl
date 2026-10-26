export function canEditSharedText(item, getters) {
  if (!getters.userId) return false;
  return getters.collaborativeTextEditing === true ||
    String(item?.user?._id || item?.user || '') === String(getters.userId) ||
    getters.userRole === 'Administrator' || ['FloorEditor','FloorMember'].includes(getters.roomRole);
}
