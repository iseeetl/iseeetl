const service = require('../../services/timeline/postSupplementReactions.service');
const { handleService } = require('../_shared/serviceHandler');

exports.createSupplementReaction = handleService((req) =>
  service.createSupplementReaction(req.body, req.jwtPayload, req.io)
);

exports.deleteSupplementReaction = handleService((req) =>
  service.deleteSupplementReaction(req.body, req.jwtPayload, req.io)
);
