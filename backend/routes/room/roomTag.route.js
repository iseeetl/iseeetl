const express = require('express');
const router = express.Router();
const { validateMongoId, validateLang, validatePage, validateOptionalSearch } = require('../../validates/base.validate');
const { validateRoomTagOrder, validateRoomTagName, validateRoomTagCsv } = require('../../validates/tag.validate');
const {
  validateDeleteFlg,
  validateOptionalDeleteFlg,
  validateOptionalQueryDeleteFlg,
} = require('../../validates/user.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../../middlewares/ensureAdminUser');
const roomTagController = require('../../controllers/room/roomTag.controller');
const { assignQueryToBody } = require('../_shared/queryToBody');

router.post(
  '/create',
  ensureJsonWebToken,
  [
    validateMongoId('room_id'),
    validateRoomTagOrder('order'),
    validateRoomTagName('name'),
    validateLang('lang'),
  ],
  finalize,
  roomTagController.create
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
  roomTagController.update
);

router.post(
  '/delete',
  ensureJsonWebToken,
  [validateMongoId('_id')],
  finalize,
  roomTagController.delete
);

router.post(
  '/import',
  ensureJsonWebToken,
  [
    validateMongoId('room_id'),
    validateRoomTagCsv('csv'),
    validateRoomTagOrder('csv.*.0'),
    validateRoomTagName('csv.*.1'),
  ],
  finalize,
  roomTagController.import
);

router.post(
  '/init',
  ensureJsonWebToken,
  [validateMongoId('room_id')],
  finalize,
  roomTagController.init
);

const managementPageValidator = validatePage('page');
const managementSearchValidator = validateOptionalSearch('search');
const managementPaginateHandlers = (deleteFlagValidator) => [
  assignQueryToBody,
  ensureJsonWebToken,
  ensureAdminUser,
  [managementPageValidator, managementSearchValidator, deleteFlagValidator],
  finalize,
  roomTagController.managementPaginate,
];

router
  .route('/management/paginate')
  .get(...managementPaginateHandlers(validateOptionalQueryDeleteFlg('delete_flg')))
  .post(...managementPaginateHandlers(validateOptionalDeleteFlg('delete_flg')));

router.post(
  '/management/update',
  ensureJsonWebToken,
  ensureAdminUser,
  [
    validateMongoId('_id'),
    validateRoomTagOrder('order'),
    validateRoomTagName('name'),
    validateLang('lang'),
    validateDeleteFlg('delete_flg'),
  ],
  finalize,
  roomTagController.managementUpdate
);

router.post(
  '/management/delete-state',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateMongoId('_id'), validateDeleteFlg('delete_flg')],
  finalize,
  roomTagController.managementSetDeleteState
);

module.exports = router;
