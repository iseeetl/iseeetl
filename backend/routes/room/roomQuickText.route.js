const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const optionalRoomMetadataIdentity = require('../../middlewares/optionalRoomMetadataIdentity');
const ctrl = require('../../controllers/room/roomQuickText.controller');
const { room: v } = require('../../validates/quickText.validate');
const { buildQuickTextRouter } = require('../_shared/quickTextRoutes');

module.exports = buildQuickTextRouter({
  scope: 'room',
  ctrl,
  validators: v,
  ensureJsonWebToken,
  listRequiresJwt: false,
  listIdentityMiddleware: optionalRoomMetadataIdentity,
});
