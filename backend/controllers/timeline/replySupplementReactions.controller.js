const service = require('../../services/timeline/replySupplementReactions.service');
const { handleService } = require('../_shared/serviceHandler');

exports.create = handleService((req) => service.create(req.body, req.jwtPayload, req.io));

exports.delete = handleService((req) => service.delete(req.body, req.jwtPayload, req.io));
