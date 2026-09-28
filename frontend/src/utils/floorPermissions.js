export const canManageFloor = (userRole, floorRole) =>
  userRole === 'Administrator' || floorRole === 'FloorEditor' || floorRole === 'FloorMember';
