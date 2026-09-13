const guestPostReactionsService = require('../../../services/timeline/guest/guestPostReactions.service');
const { handleService } = require('../../_shared/serviceHandler');

exports.createReaction = handleService((req) => guestPostReactionsService.createReaction(req.body, req.io));

exports.deleteReaction = handleService((req) => guestPostReactionsService.deleteReaction(req.body, req.io));
