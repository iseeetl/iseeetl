const express = require('express');
const { validateMongoId } = require('../validates/base.validate');
const { finalize } = require('../middlewares/validation');
const ensureJsonWebToken = require('../middlewares/ensureJsonWebToken');
const kickedUserController = require('../controllers/kickedUser.controller');

module.exports = (io) => {
  const router = express.Router();

  router.post(
    '/',
    ensureJsonWebToken,
    [validateMongoId('floor_id')],
    finalize,
    kickedUserController.getKickedUserList
  );

  router.post(
    '/check',
    ensureJsonWebToken,
    [
      validateMongoId('floor_id', { required: false }),
      validateMongoId('room_id', { required: false }),
    ],
    finalize,
    kickedUserController.checkKickedUser
  );

  router.post(
    '/create',
    ensureJsonWebToken,
    [validateMongoId('user_id'), validateMongoId('room_id')],
    finalize,
    (req, res, next) => kickedUserController.createKickedUser(req, res, next, io)
  );

  router.post(
    '/delete',
    ensureJsonWebToken,
    [validateMongoId('user_id'), validateMongoId('floor_id')],
    finalize,
    kickedUserController.deleteKickedUser
  );

  return router;
};
