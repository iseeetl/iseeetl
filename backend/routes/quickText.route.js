const express = require('express');
const router = express.Router();
const ensureJsonWebToken = require('../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../middlewares/ensureAdminUser');
const ctrl = require('../controllers/quickText.controller');
const { master: v } = require('../validates/quickText.validate');

router.get('/management/quick-text/groups/all', ensureJsonWebToken, ensureAdminUser, v.group.list, ctrl.listAllGroups);

router.get('/management/quick-text/groups', ensureJsonWebToken, ensureAdminUser, v.group.list, ctrl.paginateGroups);

router.post('/management/quick-text/groups', ensureJsonWebToken, ensureAdminUser, v.group.create, ctrl.createGroup);

router.patch(
  '/management/quick-text/groups/:id',
  ensureJsonWebToken,
  ensureAdminUser,
  v.group.update,
  ctrl.updateGroup
);

router.delete(
  '/management/quick-text/groups/:id',
  ensureJsonWebToken,
  ensureAdminUser,
  v.group.remove,
  ctrl.deleteGroup
);

router.get(
  '/management/quick-text/groups/:groupId/items',
  ensureJsonWebToken,
  ensureAdminUser,
  v.item.list,
  ctrl.listItems
);

router.post(
  '/management/quick-text/groups/:groupId/items',
  ensureJsonWebToken,
  ensureAdminUser,
  v.item.create,
  ctrl.createItem
);

router.patch('/management/quick-text/items/:id', ensureJsonWebToken, ensureAdminUser, v.item.update, ctrl.updateItem);

router.delete('/management/quick-text/items/:id', ensureJsonWebToken, ensureAdminUser, v.item.remove, ctrl.deleteItem);

module.exports = router;
