const express = require('express');
const router = express.Router();
const { validatePage, validateMongoId } = require('../validates/base.validate');
const { validateSpamSearch, validateSpamWord } = require('../validates/spam.validate');
const { finalize } = require('../middlewares/validation');
const ensureJsonWebToken = require('../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../middlewares/ensureAdminUser');
const spamController = require('../controllers/spam.controller');
const { assignQueryToBody } = require('./_shared/queryToBody');

const managementPaginateHandlers = [
  assignQueryToBody,
  ensureJsonWebToken,
  ensureAdminUser,
  [validatePage('page'), validateSpamSearch('search')],
  finalize,
  spamController.getSpamList,
];

router
  .route('/management/paginate')
  .get(...managementPaginateHandlers)
  .post(...managementPaginateHandlers);

router.post(
  '/management/create',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateSpamWord('word')],
  finalize,
  spamController.createSpam
);

router.post(
  '/management/update',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateMongoId('_id'), validateSpamWord('word')],
  finalize,
  spamController.updateSpam
);

router.post(
  '/management/delete',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateMongoId('_id')],
  finalize,
  spamController.deleteSpam
);

module.exports = router;
