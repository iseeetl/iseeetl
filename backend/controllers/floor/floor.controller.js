const floorService = require('../../services/floor/floor.service');
const { handleService } = require('../_shared/serviceHandler');

exports.guestPaginate = handleService((req) => floorService.guestPaginate(req.body));

exports.paginate = handleService((req) => floorService.paginate(req.body, req.jwtPayload));

exports.getRole = handleService((req) => floorService.getRole(req.body, req.jwtPayload));

exports.getDetail = handleService((req) => floorService.getDetail(req.body));

exports.create = handleService((req) => floorService.create(req.body, req.jwtPayload));

exports.update = handleService((req) => floorService.update(req.body, req.jwtPayload));

exports.updateFloorDisplayHidden = handleService((req) => floorService.updateFloorDisplayHidden(req.body, req.jwtPayload));

exports.delete = handleService((req) => floorService.delete(req.body, req.jwtPayload, req.io));

exports.managementPaginate = handleService((req) => floorService.managementPaginate(req.body, req.jwtPayload));

exports.managementGetDetail = handleService((req) => floorService.managementGetDetail(req.body, req.jwtPayload));

exports.managementUpdate = handleService((req) => floorService.managementUpdate(req.body, req.jwtPayload));

exports.managementSetDeleteState = handleService((req) =>
  floorService.managementSetDeleteState(req.body, req.jwtPayload, req.io)
);
