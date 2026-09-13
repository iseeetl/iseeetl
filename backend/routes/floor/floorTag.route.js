const express = require('express');
const router = express.Router();
const { validateMongoId, validateLang, validatePage, validateSearch } = require('../../validates/base.validate');
const { validateRoomTagOrder, validateRoomTagName, validateRoomTagCsv } = require('../../validates/tag.validate');
const { body } = require('express-validator');
const rejectDeleteState = () => body('delete_flg').not().exists();
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../../middlewares/ensureAdminUser');
const floorTagController = require('../../controllers/floor/floorTag.controller');
const { assignQueryToBody } = require('../_shared/queryToBody');

router.post(
  '/',
  ensureJsonWebToken,
  [validateMongoId('floor_id')],
  finalize,
  floorTagController.list
);

router.post(
  '/create',
  ensureJsonWebToken,
  [
    validateMongoId('floor_id'),
    validateRoomTagOrder('order'),
    validateRoomTagName('name'),
    validateLang('lang'),
  ],
  finalize,
  floorTagController.create
);

router.post(
  '/update',
  ensureJsonWebToken,
  [
    validateMongoId('_id'),
    validateRoomTagOrder('order'),
    validateRoomTagName('name'),
    validateLang('lang'),
  ],
  finalize,
  floorTagController.update
);

router.post(
  '/delete',
  ensureJsonWebToken,
  [validateMongoId('_id')],
  finalize,
  floorTagController.delete
);

router.post(
  '/import',
  ensureJsonWebToken,
  [
    validateMongoId('floor_id'),
    validateRoomTagCsv('csv'),
    validateRoomTagOrder('csv.*.0'),
    validateRoomTagName('csv.*.1'),
  ],
  finalize,
  floorTagController.import
);

router.post(
  '/init',
  ensureJsonWebToken,
  [validateMongoId('floor_id')],
  finalize,
  floorTagController.init
);

const managementPageValidator = validatePage('page');
const managementSearchValidator = validateSearch('search');
const managementPaginateHandlers = () => [
  assignQueryToBody,
  ensureJsonWebToken,
  ensureAdminUser,
  [managementPageValidator, managementSearchValidator, rejectDeleteState()],
  finalize,
  floorTagController.managementPaginate,
];

router
  .route('/management/paginate')
  .get(...managementPaginateHandlers())
  .post(...managementPaginateHandlers());

router.post(
  '/management/update',
  ensureJsonWebToken,
  ensureAdminUser,
  [
    validateMongoId('_id'),
    validateRoomTagOrder('order'),
    validateRoomTagName('name'),
    validateLang('lang'),
    rejectDeleteState(),
  ],
  finalize,
  floorTagController.managementUpdate
);

router.post(
  '/management/delete',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateMongoId('_id'), rejectDeleteState()],
  finalize,
  floorTagController.managementDelete
);

module.exports = router;
