const express = require('express');
const { validateMongoId, validateParamMongoId } = require('../../validates/base.validate');
const { validateConditions } = require('../../validates/pushFilter.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const pushFilterCtrl = require('../../controllers/timeline/pushFilter.controller');

module.exports = () => {
  const router = express.Router();

  router.post(
    '/pushfilter',
    ensureJsonWebToken,
    [
      validateMongoId('floor_id'),
      validateMongoId('room_id'),
      validateConditions('conditions'),
    ],
    finalize,
    pushFilterCtrl.create
  );

  router.put(
    '/pushfilter/:id',
    ensureJsonWebToken,
    [validateParamMongoId('id'), validateConditions('conditions')],
    finalize,
    pushFilterCtrl.update
  );

  router.delete(
    '/pushfilter/:id',
    ensureJsonWebToken,
    [validateParamMongoId('id')],
    finalize,
    pushFilterCtrl.remove
  );

  return router;
};
