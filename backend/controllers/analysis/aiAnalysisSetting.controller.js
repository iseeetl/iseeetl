const settingService = require('../../services/analysis/settings/setting.service');
const { handleService } = require('../_shared/serviceHandler');

exports.listCommon = handleService((req) => settingService.listCommon(req.jwtPayload));
exports.getDefaultResultUser = handleService((req) =>
  settingService.getDefaultResultUser(req.jwtPayload)
);
exports.getFloorDefaultResultUser = handleService((req) =>
  settingService.getScopedDefaultResultUser('floor', req.body, req.jwtPayload)
);
exports.getRoomDefaultResultUser = handleService((req) =>
  settingService.getScopedDefaultResultUser('room', req.body, req.jwtPayload)
);
exports.paginateCommon = handleService((req) =>
  settingService.paginateCommon(req.body, req.jwtPayload)
);
exports.createCommon = handleService((req) =>
  settingService.createCommon(req.body, req.jwtPayload)
);
exports.updateCommon = handleService((req) =>
  settingService.updateCommon(req.body, req.jwtPayload)
);

exports.deleteCommon = handleService((req) =>
  settingService.deleteCommon(req.body, req.jwtPayload)
);

exports.listFloor = handleService((req) =>
  settingService.listScoped('floor', req.body, req.jwtPayload)
);
exports.createFloor = handleService((req) =>
  settingService.createFloor(req.body, req.jwtPayload)
);
exports.updateFloor = handleService((req) =>
  settingService.updateScoped('floor', req.body, req.jwtPayload)
);
exports.deleteFloor = handleService((req) =>
  settingService.deleteScoped('floor', req.body, req.jwtPayload)
);
exports.searchFloorResultUsers = handleService((req) =>
  settingService.searchScopedResultUsers('floor', req.body, req.jwtPayload)
);

exports.listRoom = handleService((req) =>
  settingService.listScoped('room', req.body, req.jwtPayload)
);
exports.createRoom = handleService((req) =>
  settingService.createRoom(req.body, req.jwtPayload)
);
exports.updateRoom = handleService((req) =>
  settingService.updateScoped('room', req.body, req.jwtPayload)
);
exports.deleteRoom = handleService((req) =>
  settingService.deleteScoped('room', req.body, req.jwtPayload)
);
exports.searchRoomResultUsers = handleService((req) =>
  settingService.searchScopedResultUsers('room', req.body, req.jwtPayload)
);
