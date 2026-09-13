const roomTagService = require('../../services/room/roomTag.service');
const { handleService } = require('../_shared/serviceHandler');

exports.create = handleService((req) => roomTagService.create(req.body, req.jwtPayload));

exports.update = handleService((req) => roomTagService.update(req.body, req.jwtPayload));

exports.delete = handleService((req) => roomTagService.delete(req.body, req.jwtPayload));

exports.import = handleService((req) => roomTagService.import(req.body, req.jwtPayload));

exports.init = handleService((req) => roomTagService.init(req.body, req.jwtPayload));

exports.managementPaginate = handleService((req) => roomTagService.managementPaginate(req.body, req.jwtPayload));

exports.managementUpdate = handleService((req) => roomTagService.managementUpdate(req.body, req.jwtPayload));

exports.managementSetDeleteState = handleService((req) =>
  roomTagService.managementSetDeleteState(req.body, req.jwtPayload)
);
