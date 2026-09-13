const express = require('express');
const { assignQueryToBody } = require('./queryToBody');

function buildMemberRouter({
  controller,
  ensureJsonWebToken,
  ensureAdminUser,
  validateMongoId,
  validatePage,
  validatePeriod,
  validateInviteToken,
  listIdField,
  deleteValidators,
  includeContains,
  includeManagementDelete,
  finalize,
}) {
  const router = express.Router();

  router.post('/', ensureJsonWebToken, [validateMongoId(listIdField)], finalize, controller.list);

  router.post(
    '/invite',
    ensureJsonWebToken,
    [validateMongoId(listIdField), validatePeriod('period')],
    finalize,
    controller.invite
  );

  router.post(
    '/create',
    ensureJsonWebToken,
    [validateMongoId(listIdField), validateInviteToken('invite_token')],
    finalize,
    controller.create
  );

  router.post('/delete', ensureJsonWebToken, deleteValidators, finalize, controller.delete);

  router.post('/leave', ensureJsonWebToken, [validateMongoId(listIdField)], finalize, controller.leave);

  if (includeContains) {
    router.post('/contains', ensureJsonWebToken, [validateMongoId(listIdField)], finalize, controller.contains);
  }

  const managementPaginateHandlers = [
    assignQueryToBody,
    ensureJsonWebToken,
    ensureAdminUser,
    [validatePage('page')],
    finalize,
    controller.managementPaginate,
  ];

  router
    .route('/management/paginate')
    .get(...managementPaginateHandlers)
    .post(...managementPaginateHandlers);

  if (includeManagementDelete) {
    router.post(
      '/management/delete',
      ensureJsonWebToken,
      ensureAdminUser,
      [validateMongoId('_id')],
      finalize,
      controller.managementDelete
    );
  }

  return router;
}

module.exports = {
  buildMemberRouter,
};
