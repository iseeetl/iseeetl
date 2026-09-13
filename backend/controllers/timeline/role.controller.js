const roleService = require('../../services/timeline/role.service');
const { handleService } = require('../_shared/serviceHandler');

exports.resolveTimelineRole = handleService((req) => roleService.resolveTimelineRole(req.body, req.jwtPayload));
