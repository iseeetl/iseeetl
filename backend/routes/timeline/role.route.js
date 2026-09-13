const express = require('express');
const { validateMongoId } = require('../../validates/base.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const roleController = require('../../controllers/timeline/role.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/role',
    ensureJsonWebToken,
    [validateMongoId('floor_id'), validateMongoId('room_id')],
    finalize,
    roleController.resolveTimelineRole
  );

  return router;
};
