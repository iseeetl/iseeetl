const service = require('../../../services/timeline/guest/guestPostSupplementReactions.service');
const { handleService } = require('../../_shared/serviceHandler');

exports.createSupplementReaction = handleService((req) => service.createSupplementReaction(req.body, req.io));

exports.deleteSupplementReaction = handleService((req) => service.deleteSupplementReaction(req.body, req.io));
