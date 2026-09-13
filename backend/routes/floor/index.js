const express = require('express');

module.exports = (io) => {
  const router = express.Router();
  router.use('/floor', require('./floor.route'));
  router.use('/floormember', require('./floorMember.route')(io));
  router.use('/floortag', require('./floorTag.route'));
  router.use('/', require('./floorQuickText.route'));

  return router;
};
