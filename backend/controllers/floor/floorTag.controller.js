const floorTagService = require('../../services/floor/floorTag.service');
const { handleService } = require('../_shared/serviceHandler');

exports.list = handleService((req) => floorTagService.list(req.body, req.jwtPayload));

exports.create = handleService((req) => floorTagService.create(req.body, req.jwtPayload));

exports.update = handleService((req) => floorTagService.update(req.body, req.jwtPayload));

exports.delete = handleService((req) => floorTagService.delete(req.body, req.jwtPayload));

exports.import = handleService((req) => floorTagService.import(req.body, req.jwtPayload));

exports.init = handleService((req) => floorTagService.init(req.body, req.jwtPayload));

exports.managementPaginate = handleService((req) => floorTagService.managementPaginate(req.body, req.jwtPayload));

exports.managementUpdate = handleService((req) => floorTagService.managementUpdate(req.body, req.jwtPayload));

exports.managementDelete = handleService((req) =>
  floorTagService.managementDelete(req.body, req.jwtPayload)
);
