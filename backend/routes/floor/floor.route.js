const express = require('express');
const router = express.Router();
const { validatePage, validateMongoId, validateLang, validateTargetLangs } = require('../../validates/base.validate');
const { validateImageName } = require('../../validates/media.validate');
const {
  validateFloorSearch,
  validateFloorTitle,
  validateFloorDescription,
  validateFloorDisplayHidden,
} = require('../../validates/floor.validate');
const {
  validateDeleteFlg,
  validateOptionalDeleteFlg,
  validateOptionalQueryDeleteFlg,
} = require('../../validates/user.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../../middlewares/ensureAdminUser');
const floorController = require('../../controllers/floor/floor.controller');
const { assignQueryToBody } = require('../_shared/queryToBody');

router.post(
  '/guest/paginate',
  [validatePage('page'), validateFloorSearch('search')],
  finalize,
  floorController.guestPaginate
);

router.post(
  '/paginate',
  ensureJsonWebToken,
  [validatePage('page'), validateFloorSearch('search')],
  finalize,
  floorController.paginate
);

router.post(
  '/role',
  ensureJsonWebToken,
  [validateMongoId('floor_id')],
  finalize,
  floorController.getRole
);

router.post('/detail', [validateMongoId('_id')], finalize, floorController.getDetail);

router.post(
  '/create',
  ensureJsonWebToken,
  [
    validateFloorTitle('title'),
    validateFloorDescription('description'),
    validateFloorDisplayHidden('floor_display_hidden'),
    validateLang('lang'),
    validateTargetLangs('target_langs'),
    validateLang('target_langs.*'),
  ],
  finalize,
  floorController.create
);

router.post(
  '/update',
  ensureJsonWebToken,
  [
    validateMongoId('_id'),
    validateFloorTitle('title'),
    validateFloorDescription('description'),
    validateLang('lang'),
    validateTargetLangs('target_langs'),
    validateLang('target_langs.*'),
    validateImageName('image_name'),
    validateFloorDisplayHidden('floor_display_hidden'),
  ],
  finalize,
  floorController.update
);

router.post(
  '/update/floordisplayhidden',
  ensureJsonWebToken,
  [validateFloorDisplayHidden('floor_display_hidden')],
  finalize,
  floorController.updateFloorDisplayHidden
);

router.post(
  '/delete',
  ensureJsonWebToken,
  [validateMongoId('_id')],
  finalize,
  floorController.delete
);

const managementPageValidator = validatePage('page');
const managementSearchValidator = validateFloorSearch('search');
const managementPaginateHandlers = (deleteFlagValidator) => [
  assignQueryToBody,
  ensureJsonWebToken,
  ensureAdminUser,
  [managementPageValidator, managementSearchValidator, deleteFlagValidator],
  finalize,
  floorController.managementPaginate,
];

router
  .route('/management/paginate')
  .get(...managementPaginateHandlers(validateOptionalQueryDeleteFlg('delete_flg')))
  .post(...managementPaginateHandlers(validateOptionalDeleteFlg('delete_flg')));

router.post(
  '/management/detail',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateMongoId('_id')],
  finalize,
  floorController.managementGetDetail
);

router.post(
  '/management/update',
  ensureJsonWebToken,
  ensureAdminUser,
  [
    validateMongoId('_id'),
    validateFloorTitle('title'),
    validateFloorDescription('description'),
    validateLang('lang'),
    validateTargetLangs('target_langs'),
    validateLang('target_langs.*'),
    validateImageName('image_name'),
    validateFloorDisplayHidden('floor_display_hidden'),
    validateDeleteFlg('delete_flg'),
  ],
  finalize,
  floorController.managementUpdate
);

router.post(
  '/management/delete-state',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateMongoId('_id'), validateDeleteFlg('delete_flg')],
  finalize,
  floorController.managementSetDeleteState
);

module.exports = router;
