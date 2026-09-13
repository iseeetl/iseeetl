const { validateMongoId, validatePage } = require('../../validates/base.validate');
const { validatePeriod, validateFloorMemberInviteToken } = require('../../validates/member.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../../middlewares/ensureAdminUser');
const floorMemberController = require('../../controllers/floor/floorMember.controller');
const { buildMemberRouter } = require('../_shared/memberRoutes');

module.exports = (io) =>
  buildMemberRouter({
    controller: {
      ...floorMemberController,
      delete: (req, res, next) => floorMemberController.delete(req, res, next, io),
      leave: (req, res, next) => floorMemberController.leave(req, res, next, io),
      managementDelete: (req, res, next) => floorMemberController.managementDelete(req, res, next, io),
    },
    ensureJsonWebToken,
    ensureAdminUser,
    validateMongoId,
    validatePage,
    validatePeriod,
    validateInviteToken: validateFloorMemberInviteToken,
    listIdField: 'floor_id',
    deleteValidators: [validateMongoId('_id'), validateMongoId('floor_id')],
    includeContains: false,
    includeManagementDelete: true,
    finalize,
  });
