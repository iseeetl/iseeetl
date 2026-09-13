const replyReactionsService = require('../../services/timeline/replyReactions.service');
const { handleService } = require('../_shared/serviceHandler');

exports.create = handleService((req) => replyReactionsService.create(req.body, req.jwtPayload, req.io));

exports.delete = handleService((req) => replyReactionsService.delete(req.body, req.jwtPayload, req.io));
