const express = require('express');
const router = express.Router();
const { validatePage, validateMongoId } = require('../validates/base.validate');
const {
  validateCategoryTagSearch,
  validateCategoryTagOrder,
  validateCategoryTagName,
  validateCategoryTagCsv,
} = require('../validates/tag.validate');
const { body } = require('express-validator');
const rejectDeleteState = () => body('delete_flg').not().exists();
const { finalize } = require('../middlewares/validation');
const ensureJsonWebToken = require('../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../middlewares/ensureAdminUser');
const categoryTagController = require('../controllers/categoryTag.controller');
const { assignQueryToBody } = require('./_shared/queryToBody');

router.post('/management', ensureJsonWebToken, ensureAdminUser, categoryTagController.list);

const managementPageValidator = validatePage('page');
const managementSearchValidator = validateCategoryTagSearch('search');
const managementPaginateHandlers = () => [
  assignQueryToBody,
  ensureJsonWebToken,
  ensureAdminUser,
  [managementPageValidator, managementSearchValidator, rejectDeleteState()],
  finalize,
  categoryTagController.paginate,
];

router
  .route('/management/paginate')
  .get(...managementPaginateHandlers())
  .post(...managementPaginateHandlers());

router.post(
  '/management/create',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateCategoryTagOrder('order'), validateCategoryTagName('name')],
  finalize,
  categoryTagController.create
);

router.post(
  '/management/update',
  ensureJsonWebToken,
  ensureAdminUser,
  [
    validateMongoId('_id'),
    validateCategoryTagOrder('order'),
    validateCategoryTagName('name'),
    rejectDeleteState(),
  ],
  finalize,
  categoryTagController.update
);

router.post(
  '/management/delete',
  ensureJsonWebToken,
  ensureAdminUser,
  [validateMongoId('_id'), rejectDeleteState()],
  finalize,
  categoryTagController.delete
);

router.post(
  '/management/import',
  ensureJsonWebToken,
  ensureAdminUser,
  [
    validateCategoryTagCsv('csv'),
    validateCategoryTagOrder('csv.*.0'),
    validateCategoryTagName('csv.*.1'),
  ],
  finalize,
  categoryTagController.import
);

module.exports = router;
