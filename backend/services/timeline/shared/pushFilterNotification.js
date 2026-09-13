const PushFilter = require('../../../models/PushFilter');
const matchConditions = require('./matchConditions');
const { dispatchPushNotification } = require('./notificationSender');

const SNIPPET_LIMIT = 40;

const buildSnippet = (content) => (content ? `${content.slice(0, SNIPPET_LIMIT)}…` : '');

const normalizeId = (value) => (value == null ? null : value.toString());

async function notifyPushFilterUsers({ roomId, msgInfo, excludeUserId, headings, contents, url }) {
  const room = normalizeId(roomId);
  const exclude = normalizeId(excludeUserId);

  const pushFilters = await PushFilter.find({ room }).populate('user', '_id push_enabled');

  const targets = [];
  for (const pf of pushFilters) {
    if (!pf.user || !pf.user.push_enabled) continue;
    const uid = pf.user._id.toString();
    if (exclude && uid === exclude) continue;
    if (matchConditions(msgInfo, pf.conditions)) targets.push(uid);
  }

  if (targets.length) {
    await dispatchPushNotification({
      userIds: targets,
      roomId: room,
      headings,
      contents,
      url,
    });
  }

  return targets;
}

module.exports = { buildSnippet, notifyPushFilterUsers };
