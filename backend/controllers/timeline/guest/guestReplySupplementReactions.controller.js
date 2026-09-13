const service = require('../../../services/timeline/guest/guestReplySupplementReactions.service');
const { handleService } = require('../../_shared/serviceHandler');

exports.createReplySupplementReaction = handleService((req) =>
  service.createReplySupplementReaction(req.body, req.io)
);

exports.deleteReplySupplementReaction = handleService((req) =>
  service.deleteReplySupplementReaction(req.body, req.io)
);
