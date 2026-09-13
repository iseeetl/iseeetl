const express = require('express');

module.exports = () => {
  const router = express.Router();

  router.use('/', require('./role.route')());
  router.use('/', require('./postReactions.route')());
  router.use('/', require('./postSupplementReactions.route')());
  router.use('/', require('./replyReactions.route')());
  router.use('/', require('./replySupplementReactions.route')());
  router.use('/', require('./transcription.route'));
  router.use('/', require('./pushFilter.route')());
  router.use('/management', require('./management.route')());
  return router;
};
