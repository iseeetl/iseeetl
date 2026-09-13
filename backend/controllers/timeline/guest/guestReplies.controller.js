const guestRepliesService = require('../../../services/timeline/guest/guestReplies.service');
const { handleService } = require('../../_shared/serviceHandler');

exports.createReply = handleService((req) => guestRepliesService.createReply(req.body, req.io));
