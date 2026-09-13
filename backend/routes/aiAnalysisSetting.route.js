const express = require('express');
const { validateMongoId } = require('../validates/base.validate');
const {
  validateAIAnalysisSearch,
  validateAdditionalPrompt,
  validateAllowedBodyFields,
  validateAnalysisKind,
  validateCanonicalPage,
  validateRevision,
} = require('../validates/aiAnalysisSetting.validate');
const { finalize } = require('../middlewares/validation');
const ensureJsonWebToken = require('../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../middlewares/ensureAdminUser');
const controller = require('../controllers/analysis/aiAnalysisSetting.controller');
const { assignQueryToBody } = require('./_shared/queryToBody');

const router = express.Router();
const adminAuth = [ensureJsonWebToken, ensureAdminUser];

router.post(
  '/management/default-result-user',
  ...adminAuth,
  [validateAllowedBodyFields([])],
  finalize,
  controller.getDefaultResultUser
);

router.post(
  '/management',
  ...adminAuth,
  [validateAllowedBodyFields([])],
  finalize,
  controller.listCommon
);

router.get(
  '/management/paginate',
  assignQueryToBody,
  ...adminAuth,
  [
    validateAllowedBodyFields(['page', 'search']),
    validateCanonicalPage('page'),
    validateAIAnalysisSearch('search'),
  ],
  finalize,
  controller.paginateCommon
);

router.post(
  '/management/create',
  ...adminAuth,
  [
    validateAllowedBodyFields([
      'category_tag',
      'analysis_kind',
      'additional_prompt',
      'result_user',
    ]),
    validateMongoId('category_tag'),
    validateAnalysisKind(),
    validateAdditionalPrompt(),
    validateMongoId('result_user'),
  ],
  finalize,
  controller.createCommon
);

router.post(
  '/management/update',
  ...adminAuth,
  [
    validateAllowedBodyFields([
      '_id',
      'category_tag',
      'analysis_kind',
      'additional_prompt',
      'result_user',
      'revision',
    ]),
    validateMongoId('_id'),
    validateMongoId('category_tag'),
    validateAnalysisKind(),
    validateAdditionalPrompt(),
    validateMongoId('result_user'),
    validateRevision(),
  ],
  finalize,
  controller.updateCommon
);

router.post(
  '/management/delete',
  ...adminAuth,
  [
    validateAllowedBodyFields(['_id', 'revision']),
    validateMongoId('_id'),
    validateRevision(),
  ],
  finalize,
  controller.deleteCommon
);

module.exports = router;
