const express = require('express');
const router = express.Router();
const { validateUserName, validateLang, validatePage, validateMongoId } = require('../validates/base.validate');
const { validateImageName } = require('../validates/media.validate');
const {
  validateEyeFriendlyMode,
  validatePushEnabled,
  validateReplyPushEnabled,
  validateRepliedPostPushEnabled,
  validateOldPassword,
  validateNewPassword,
  validateUserSearch,
  validateNullableMail,
  validatePasswordNone,
  validateUserRole,
  validateDeleteFlg,
  validateOptionalDeleteFlg,
  validateOptionalQueryDeleteFlg,
} = require('../validates/user.validate');
const { finalize } = require('../middlewares/validation');
const ensureJsonWebToken = require('../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../middlewares/ensureAdminUser');
const userController = require('../controllers/user.controller');
const { assignQueryToBody } = require('./_shared/queryToBody');
const {
  validateAllowedBodyFields,
  validateResultUserSearch,
} = require('../validates/aiAnalysisSetting.validate');

router.get('/detail', ensureJsonWebToken, userController.getUserDetail);

router.post(
  '/update',
  ensureJsonWebToken,
  [
    validateUserName('username'),
    validateImageName('image_name'),
    validateLang('lang'),
    validateEyeFriendlyMode('eye_friendly_mode'),
    validatePushEnabled('push_enabled'),
    validateReplyPushEnabled('reply_push_enabled'),
    validateRepliedPostPushEnabled('replied_post_push_enabled'),
  ],
  finalize,
  userController.updateUser
);

router.post(
  '/changepassword',
  ensureJsonWebToken,
  [validateOldPassword('old_password'), validateNewPassword('new_password')],
  finalize,
  userController.changePassword
);

const managementPageValidator = validatePage('page');
const managementSearchValidator = validateUserSearch('search');
const managementPaginateHandlers = (deleteFlagValidator) => [
  assignQueryToBody,
  ensureJsonWebToken,
  ensureAdminUser,
  [managementPageValidator, managementSearchValidator, deleteFlagValidator],
  finalize,
  userController.getUserListPaginate,
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
    validateUserName('username'),
    validateNullableMail('mail'),
    validatePasswordNone('password'),
    validateUserRole('role'),
    validateDeleteFlg('delete_flg'),
  ],
  finalize,
  userController.managementUpdateUser
);

router.post(
  '/management/delete-state',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateMongoId('_id'), validateDeleteFlg('delete_flg')],
  finalize,
  userController.managementSetDeleteState
);

router.post(
  '/ai-analysis-result-users/search',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateAllowedBodyFields(['search']), validateResultUserSearch('search')],
  finalize,
  userController.searchAIAnalysisResultUsers
);

module.exports = router;
