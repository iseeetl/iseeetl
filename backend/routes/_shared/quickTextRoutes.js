const express = require('express');

function buildQuickTextRouter({
  scope,
  ctrl,
  validators,
  ensureJsonWebToken,
  listRequiresJwt,
  listIdentityMiddleware,
}) {
  const router = express.Router();
  const base = `/${scope}s/:${scope}Id/quick-text`;

  const listMiddlewares = listRequiresJwt
    ? [ensureJsonWebToken]
    : listIdentityMiddleware
      ? [listIdentityMiddleware]
      : [];
  const auth = [ensureJsonWebToken];

  router.get(`${base}/groups`, ...listMiddlewares, validators.group.list, ctrl.listGroups);
  router.post(`${base}/groups`, ...auth, validators.group.create, ctrl.createGroup);
  router.patch(`${base}/groups/:id`, ...auth, validators.group.update, ctrl.updateGroup);
  router.delete(`${base}/groups/:id`, ...auth, validators.group.remove, ctrl.deleteGroup);

  router.get(`${base}/groups/:groupId/items`, ...listMiddlewares, validators.item.list, ctrl.listItems);
  router.post(`${base}/groups/:groupId/items`, ...auth, validators.item.create, ctrl.createItem);
  router.patch(`${base}/items/:id`, ...auth, validators.item.update, ctrl.updateItem);
  router.delete(`${base}/items/:id`, ...auth, validators.item.remove, ctrl.deleteItem);

  return router;
}

module.exports = {
  buildQuickTextRouter,
};
