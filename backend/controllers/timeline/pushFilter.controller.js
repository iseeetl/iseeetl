const pushFilterService = require('../../services/timeline/pushFilter.service');
const { handleService } = require('../_shared/serviceHandler');

exports.create = handleService((req) => pushFilterService.create(req.body, req.jwtPayload));

exports.update = handleService((req) =>
  pushFilterService.update(req.params.id, req.body.conditions, req.jwtPayload)
);

exports.remove = handleService(async (req) => {
  await pushFilterService.remove(req.params.id, req.jwtPayload);
  return { ok: true };
});
