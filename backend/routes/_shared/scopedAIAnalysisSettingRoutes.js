const express = require('express');
const { validateMongoId } = require('../../validates/base.validate');
const {
  validateAdditionalPrompt,
  validateAllowedBodyFields,
  validateAnalysisKind,
  validateResultUserSearch,
  validateRevision,
} = require('../../validates/aiAnalysisSetting.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const controller = require('../../controllers/analysis/aiAnalysisSetting.controller');

const buildScopedAIAnalysisSettingRouter = ({ type }) => {
  const router = express.Router();
  const isFloor = type === 'floor';
  const tagId = isFloor ? 'floor_tag' : 'room_tag';
  const listHandler = isFloor ? controller.listFloor : controller.listRoom;
  const createHandler = isFloor ? controller.createFloor : controller.createRoom;
  const updateHandler = isFloor ? controller.updateFloor : controller.updateRoom;
  const deleteHandler = isFloor ? controller.deleteFloor : controller.deleteRoom;
  const searchResultUsersHandler = isFloor
    ? controller.searchFloorResultUsers
    : controller.searchRoomResultUsers;
  const scopeFields = isFloor ? ['floor_id'] : ['floor_id', 'room_id'];
  const scopeValidators = isFloor
    ? [validateMongoId('floor_id')]
    : [validateMongoId('floor_id'), validateMongoId('room_id')];
  const authenticated = [ensureJsonWebToken];

  router.post(
    '/default-result-user',
    ...authenticated,
    [validateAllowedBodyFields(scopeFields), ...scopeValidators],
    finalize,
    isFloor ? controller.getFloorDefaultResultUser : controller.getRoomDefaultResultUser
  );

  router.post(
    '/',
    ...authenticated,
    [
      validateAllowedBodyFields(scopeFields),
      ...scopeValidators,
    ],
    finalize,
    listHandler
  );

  router.post(
    '/create',
    ...authenticated,
    [
      validateAllowedBodyFields([
        ...scopeFields,
        tagId,
        'analysis_kind',
        'additional_prompt',
        'result_user',
      ]),
      ...scopeValidators,
      validateMongoId(tagId),
      validateAnalysisKind(),
      validateAdditionalPrompt(),
      validateMongoId('result_user'),
    ],
    finalize,
    createHandler
  );

  router.post(
    '/update',
    ...authenticated,
    [
      validateAllowedBodyFields([
        '_id',
        ...scopeFields,
        tagId,
        'analysis_kind',
        'additional_prompt',
        'result_user',
        'revision',
      ]),
      validateMongoId('_id'),
      ...scopeValidators,
      validateMongoId(tagId),
      validateAnalysisKind(),
      validateAdditionalPrompt(),
      validateMongoId('result_user'),
      validateRevision(),
    ],
    finalize,
    updateHandler
  );

  const deleteValidators = [
    validateAllowedBodyFields(['_id', ...scopeFields, 'revision']),
    validateMongoId('_id'),
    ...scopeValidators,
    validateRevision(),
  ];
  router.post('/delete', ...authenticated, deleteValidators, finalize, deleteHandler);

  router.post(
    '/result-users/search',
    ...authenticated,
    [
      validateAllowedBodyFields([...scopeFields, 'search']),
      ...scopeValidators,
      validateResultUserSearch('search'),
    ],
    finalize,
    searchResultUsersHandler
  );

  return router;
};

module.exports = { buildScopedAIAnalysisSettingRouter };
