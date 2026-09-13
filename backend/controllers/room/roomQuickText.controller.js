const svc = require('../../services/room/roomQuickText.service');
const { handleService } = require('../_shared/serviceHandler');

// 一覧取得ではルーム情報へのアクセス権を確認し、ゲストも対象にする。
exports.listGroups = handleService((req) => {
  const { roomId } = req.params;
  const { lang = null } = req.query;
  return svc.listGroups({ roomId, lang, jwtPayload: req.jwtPayload, guest: req.guest });
});

exports.listItems = handleService((req) => {
  const { roomId, groupId } = req.params;
  const { lang = null } = req.query;
  return svc.listItems({ roomId, groupId, lang, jwtPayload: req.jwtPayload, guest: req.guest });
});

// 作成・更新・削除では、ログインとフロアの操作権限を確認する。
exports.createGroup = handleService((req) => {
  const { roomId } = req.params;
  const { order, title, lang } = req.body;
  return svc.createGroup({ roomId, order, title, lang, jwtPayload: req.jwtPayload });
});

exports.updateGroup = handleService((req) => {
  const { roomId, id } = req.params;
  const { order, title, lang } = req.body;
  return svc.updateGroup({ roomId, id, order, title, lang, jwtPayload: req.jwtPayload });
});

exports.deleteGroup = handleService((req) => {
  const { roomId, id } = req.params;
  return svc.deleteGroup({ roomId, id, jwtPayload: req.jwtPayload });
});

exports.createItem = handleService((req) => {
  const { roomId, groupId } = req.params;
  const { order, label, lang } = req.body;
  return svc.createItem({ roomId, groupId, order, label, lang, jwtPayload: req.jwtPayload });
});

exports.updateItem = handleService((req) => {
  const { roomId, id } = req.params;
  const { order, label, lang } = req.body;
  return svc.updateItem({ roomId, id, order, label, lang, jwtPayload: req.jwtPayload });
});

exports.deleteItem = handleService((req) => {
  const { roomId, id } = req.params;
  return svc.deleteItem({ roomId, id, jwtPayload: req.jwtPayload });
});
