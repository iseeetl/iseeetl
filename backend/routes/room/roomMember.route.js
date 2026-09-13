const { validateMongoId, validatePage } = require('../../validates/base.validate');
const { validatePeriod, validateRoomMemberInviteToken } = require('../../validates/member.validate');
const { finalize } = require('../../middlewares/validation');
const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const ensureAdminUser = require('../../middlewares/ensureAdminUser');
const roomMemberController = require('../../controllers/room/roomMember.controller');
const { buildMemberRouter } = require('../_shared/memberRoutes');

module.exports = (io) =>
  buildMemberRouter({
    controller: {
      ...roomMemberController,
      delete: (req, res, next) => roomMemberController.delete(req, res, next, io),
      leave: (req, res, next) => roomMemberController.leave(req, res, next, io),
      managementDelete: (req, res, next) => roomMemberController.managementDelete(req, res, next, io),
    },
    ensureJsonWebToken,
    ensureAdminUser,
    validateMongoId,
    validatePage,
    validatePeriod,
    validateInviteToken: validateRoomMemberInviteToken,
    listIdField: 'room_id',
    deleteValidators: [validateMongoId('_id')],
    includeContains: true,
    includeManagementDelete: true,
    finalize,
  });
