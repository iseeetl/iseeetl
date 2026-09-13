const ensureJsonWebToken = require('../../middlewares/ensureJsonWebToken');
const ctrl = require('../../controllers/floor/floorQuickText.controller');
const { floor: v } = require('../../validates/quickText.validate');
const { buildQuickTextRouter } = require('../_shared/quickTextRoutes');

module.exports = buildQuickTextRouter({
  scope: 'floor',
  ctrl,
  validators: v,
  ensureJsonWebToken,
  listRequiresJwt: true,
});
