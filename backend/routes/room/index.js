const express = require('express');

module.exports = (io) => {
  const router = express.Router();
  router.use('/room', require('./room.route'));
  router.use('/roommember', require('./roomMember.route')(io));
  router.use('/roomtag', require('./roomTag.route'));
  router.use('/', require('./roomQuickText.route'));

  return router;
};
