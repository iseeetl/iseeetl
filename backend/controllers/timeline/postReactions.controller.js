const postReactionsService = require('../../services/timeline/postReactions.service');
const { handleService } = require('../_shared/serviceHandler');

exports.createReaction = handleService((req) =>
  postReactionsService.createReaction(req.body, req.jwtPayload, req.io)
);

exports.deleteReaction = handleService((req) =>
  postReactionsService.deleteReaction(req.body, req.jwtPayload, req.io)
);
