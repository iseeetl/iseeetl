const svc = require('../../services/floor/floorQuickText.service');
const { handleService } = require('../_shared/serviceHandler');

exports.listGroups = handleService((req) => {
  const { floorId } = req.params;
  const { lang = null } = req.query;
  return svc.listGroups({ floorId, lang, jwtPayload: req.jwtPayload });
});

exports.createGroup = handleService((req) => {
  const { floorId } = req.params;
  const { order, title, lang } = req.body;
  return svc.createGroup({ floorId, order, title, lang, jwtPayload: req.jwtPayload });
});

exports.updateGroup = handleService((req) => {
  const { floorId, id } = req.params;
  const { order, title, lang } = req.body;
  return svc.updateGroup({ floorId, id, order, title, lang, jwtPayload: req.jwtPayload });
});

exports.deleteGroup = handleService((req) => {
  const { floorId, id } = req.params;
  return svc.deleteGroup({ floorId, id, jwtPayload: req.jwtPayload });
});

exports.listItems = handleService((req) => {
  const { floorId, groupId } = req.params;
  const { lang = null } = req.query;
  return svc.listItems({ floorId, groupId, lang, jwtPayload: req.jwtPayload });
});

exports.createItem = handleService((req) => {
  const { floorId, groupId } = req.params;
  const { order, label, lang } = req.body;
  return svc.createItem({ floorId, groupId, order, label, lang, jwtPayload: req.jwtPayload });
});

exports.updateItem = handleService((req) => {
  const { floorId, id } = req.params;
  const { order, label, lang } = req.body;
  return svc.updateItem({ floorId, id, order, label, lang, jwtPayload: req.jwtPayload });
});

exports.deleteItem = handleService((req) => {
  const { floorId, id } = req.params;
  return svc.deleteItem({ floorId, id, jwtPayload: req.jwtPayload });
});
