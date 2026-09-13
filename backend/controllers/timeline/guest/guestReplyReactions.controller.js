const guestReplyReactionsService = require('../../../services/timeline/guest/guestReplyReactions.service');
const { handleService } = require('../../_shared/serviceHandler');

exports.createReplyReaction = handleService((req) =>
  guestReplyReactionsService.createReplyReaction(req.body, req.io)
);

exports.deleteReplyReaction = handleService((req) =>
  guestReplyReactionsService.deleteReplyReaction(req.body, req.io)
);
