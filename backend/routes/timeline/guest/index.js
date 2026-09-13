const express = require('express');

module.exports = () => {
  const router = express.Router();

  router.use('/', require('./guestPosts.route')());
  router.use('/', require('./guestPostReactions.route')());
  router.use('/', require('./guestPostSupplementReactions.route')());
  router.use('/', require('./guestReplies.route')());
  router.use('/', require('./guestReplyReactions.route')());
  router.use('/', require('./guestReplySupplementReactions.route')());

  return router;
};
