const express = require('express');
const { body } = require('express-validator');
const { validatePage, validateSearch, validateMongoId } = require('../../validates/base.validate');
const { validateDeleteFlg } = require('../../validates/user.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../../middlewares/ensureAdminUser');
const managementController = require('../../controllers/timeline/management.controller');
const { assignQueryToBody } = require('../_shared/queryToBody');

module.exports = () => {
  const router = express.Router();

  const paginateHandlers = [
    assignQueryToBody,
    ensureJsonWebToken,
    ensureAdminUser,
    [validatePage('page'), validateSearch('search')],
    finalize,
    managementController.paginate,
  ];
  router.route('/paginate').get(...paginateHandlers).post(...paginateHandlers);

  router.post(
    '/timeline',
    ensureJsonWebToken,
    ensureAdminUser,
    [validateMongoId('floor_id'), validateMongoId('room_id')],
    finalize,
    managementController.timeline
  );

  router.post(
    '/timeline/media',
    ensureJsonWebToken,
    ensureAdminUser,
    [validateMongoId('floor_id'), validateMongoId('room_id')],
    finalize,
    managementController.timelineMedia
  );

  router.post(
    '/delete',
    ensureJsonWebToken,
    ensureAdminUser,
    [
      validateMongoId('post_id'),
      validateMongoId('reply_id', { required: false }),
      validateMongoId('supplement_id', { required: false }),
      validateDeleteFlg('delete_flg'),
    ],
    finalize,
    managementController.delete
  );

  router.post('/timeline/estimate', ensureJsonWebToken, ensureAdminUser,
    [validateMongoId('floor_id'), validateMongoId('room_id'), body('type').isIn(['json', 'media'])],
    finalize, managementController.estimate);

  return router;
};
