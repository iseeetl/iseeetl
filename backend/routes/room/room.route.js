const express = require('express');
const router = express.Router();
const { validateMongoId, validateLang, validatePage } = require('../../validates/base.validate');
const { validateImageName } = require('../../validates/media.validate');
const {
  validateRoomTitle,
  validateRoomDescription,
  validateRoomSearch,
  validateGuestReactionOnly,
  validateMemberOnly,
  validateRoomDisplayHidden,
  validateNotification,
  validateRoomExternalSnsButton,
  validateRoomDisplayOrders,
  validateRoomDisplayOrder,
} = require('../../validates/room.validate');
const {
  validateDeleteFlg,
  validateOptionalDeleteFlg,
  validateOptionalQueryDeleteFlg,
} = require('../../validates/user.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../../middlewares/ensureAdminUser');
const roomController = require('../../controllers/room/room.controller');
const { assignQueryToBody } = require('../_shared/queryToBody');

router.post(
  '/guest',
  [validateMongoId('floor_id')],
  finalize,
  roomController.guestList
);

router.post(
  '/',
  ensureJsonWebToken,
  [validateMongoId('floor_id')],
  finalize,
  roomController.list
);

router.post('/detail', [validateMongoId('_id')], finalize, roomController.detail);

router.post(
  '/create',
  ensureJsonWebToken,
  [
    validateMongoId('floor_id'),
    validateRoomTitle('title'),
    validateRoomDescription('description'),
    validateLang('lang'),
    validateGuestReactionOnly('guest_reaction_only'),
    validateMemberOnly('member_only'),
    validateRoomDisplayHidden('room_display_hidden'),
    validateNotification('notification'),
    validateRoomExternalSnsButton('external_sns_button'),
  ],
  finalize,
  roomController.create
);

router.post(
  '/update',
  ensureJsonWebToken,
  [
    validateMongoId('_id'),
    validateRoomTitle('title'),
    validateRoomDescription('description'),
    validateLang('lang'),
    validateImageName('image_name'),
    validateGuestReactionOnly('guest_reaction_only'),
    validateMemberOnly('member_only'),
    validateRoomDisplayHidden('room_display_hidden'),
    validateNotification('notification'),
    validateRoomExternalSnsButton('external_sns_button'),
  ],
  finalize,
  roomController.update
);

router.post(
  '/update/roomdisplayhidden',
  ensureJsonWebToken,
  [validateMongoId('floor_id'), validateRoomDisplayHidden('room_display_hidden')],
  finalize,
  roomController.updateRoomDisplayHidden
);

router.post(
  '/update/displayorder',
  ensureJsonWebToken,
  [
    validateMongoId('floor_id'),
    validateRoomDisplayOrders('displayorders'),
    validateMongoId('displayorders.*._id'),
    validateRoomDisplayOrder('displayorders.*.display_order'),
  ],
  finalize,
  roomController.updateDisplayOrder
);

router.post(
  '/delete',
  ensureJsonWebToken,
  [validateMongoId('_id')],
  finalize,
  roomController.delete
);

const managementPageValidator = validatePage('page');
const managementSearchValidator = validateRoomSearch('search');
const managementFloorValidator = validateMongoId('floor_id', { required: false });
const managementPaginateHandlers = (deleteFlagValidator) => [
  assignQueryToBody,
  ensureJsonWebToken,
  ensureAdminUser,
  [managementPageValidator, managementSearchValidator, managementFloorValidator, deleteFlagValidator],
  finalize,
  roomController.managementPaginate,
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
    validateRoomTitle('title'),
    validateRoomDescription('description'),
    validateLang('lang'),
    validateImageName('image_name'),
    validateGuestReactionOnly('guest_reaction_only'),
    validateMemberOnly('member_only'),
    validateRoomDisplayHidden('room_display_hidden'),
    validateNotification('notification'),
    validateRoomExternalSnsButton('external_sns_button'),
    validateDeleteFlg('delete_flg'),
  ],
  finalize,
  roomController.managementUpdate
);

router.post(
  '/management/delete-state',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateMongoId('_id'), validateDeleteFlg('delete_flg')],
  finalize,
  roomController.managementSetDeleteState
);

module.exports = router;
