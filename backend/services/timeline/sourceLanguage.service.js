const Chat = require('../../models/Chat');
const AppError = require('../../utils/appError');
const { ALLOWED_LANGUAGES } = require('../../constants/languages');
const { authorizeRoomAccess } = require('../room/roomAccess.service');
const serializeTimeline = require('./shared/timelineSerializer');
const { TIMELINE_POPULATE_WITH_REPLIES } = require('./shared/chatPopulate');
const { publishSocketEvent } = require('../../socket/publication');
const { runBackgroundTask } = require('../backgroundTaskRunner');
const translation = require('./timelineTranslation.service');
const { buildExpectedRevisionCondition } = require('./shared/analysisSourceMutation');
const { withAIAnalysisIntegrityLock } = require('../analysis/settings/referenceIntegrity');

const invalid = () => { throw new AppError({ code: 'INVALID_PARAMS' }); };
const snapshot = item => ({ content: item.content ?? null, lang: item.lang ?? null });
function parse(params, body) {
  for (const key of ['room_id', 'post_id', 'reply_id', 'supplement_id']) {
    if ((['room_id', 'post_id'].includes(key) || params[key] !== undefined) &&
        (typeof params[key] !== 'string' || !/^[a-f\d]{24}$/i.test(params[key]))) invalid();
  }
  if (!body || Array.isArray(body) || typeof body !== 'object' ||
      Object.keys(body).length !== 2 || !Object.hasOwn(body, 'expected') ||
      !Object.hasOwn(body, 'lang') || !ALLOWED_LANGUAGES.includes(body.lang)) invalid();
  const expected = body.expected;
  if (!expected || Array.isArray(expected) || typeof expected !== 'object' ||
      Object.keys(expected).length !== 2 || !Object.hasOwn(expected, 'content') || !Object.hasOwn(expected, 'lang') ||
      (expected.content !== null && (typeof expected.content !== 'string' || expected.content.length > 2000)) ||
      (expected.lang !== null && !ALLOWED_LANGUAGES.includes(expected.lang))) invalid();
}

// Classification metadata only: authenticated room access is enough, as for tags.
async function update(params, body, identity, io) {
  parse(params, body);
  const { foundRoom, foundFloor } = await authorizeRoomAccess(identity.user_id, identity.user_role, params.room_id,
    require('../../controllers/timeline/resourceOptions'));
  const chat = await Chat.findOne({ _id: params.post_id, room: foundRoom._id, delete_flg: false });
  if (!chat) throw new AppError({ code: 'NOT_FOUND' });
  const conditions = { _id: chat._id, room: foundRoom._id, delete_flg: false };
  let item = chat;
  let prefix = '';
  if (params.reply_id) {
    const index = chat.replies.findIndex(x => String(x._id) === params.reply_id && !x.delete_flg);
    if (index < 0) throw new AppError({ code: 'NOT_FOUND' });
    prefix = `replies.${index}.`; item = chat.replies[index];
    conditions[`${prefix}_id`] = item._id; conditions[`${prefix}delete_flg`] = false;
  }
  if (params.supplement_id) {
    const index = item.supplementaries.findIndex(x => String(x._id) === params.supplement_id && !x.delete_flg);
    if (index < 0) throw new AppError({ code: 'NOT_FOUND' });
    prefix += `supplementaries.${index}.`; item = item.supplementaries[index];
    conditions[`${prefix}_id`] = item._id; conditions[`${prefix}delete_flg`] = false;
  }
  const current = snapshot(item);
  if (Object.entries(current).some(([key, value]) => body.expected[key] !== value)) {
    throw new AppError({ code: 'CONFLICT' });
  }
  if (body.lang === current.lang) return serializeTimeline(await chat.populate(TIMELINE_POPULATE_WITH_REPLIES));
  for (const [key, value] of Object.entries(current)) conditions[`${prefix}${key}`] = value;
  const changes = { $set: { [`${prefix}lang`]: body.lang, [`${prefix}translations`]: [] } };
  // Match existing source edits: invalidate in-flight AI work, without scheduling it again.
  if (!params.supplement_id) {
    Object.assign(conditions, buildExpectedRevisionCondition(item, `${prefix}analysis_source_revision`));
    changes.$inc = { [`${prefix}analysis_source_revision`]: 1 };
  }
  const saved = await withAIAnalysisIntegrityLock(() => Chat.findOneAndUpdate(conditions, changes,
    { new: true, runValidators: true }).populate(TIMELINE_POPULATE_WITH_REPLIES));
  if (!saved) throw new AppError({ code: 'CONFLICT' });
  const serialized = serializeTimeline(saved);
  await publishSocketEvent('POST_UPDATE', () => io.to(String(foundRoom._id)).emit('POST_UPDATE', serialized));
  if (require('../../config/featureFlags').isGoogleTranslateEnabled() && foundFloor.target_langs?.length) {
    const args = { userId: identity.user_id, chatId: chat._id, replyId: params.reply_id,
      supplementId: params.supplement_id, content: current.content, lang: body.lang,
      reply: { _id: params.reply_id, content: current.content, lang: body.lang }, targetLangs: foundFloor.target_langs, io };
    const translate = params.supplement_id
      ? (params.reply_id ? translation.translateReplySupplementIfNeeded : translation.translateSupplementIfNeeded)
      : (params.reply_id ? translation.translateReplyIfNeeded : translation.translateMainContentIfNeeded);
    runBackgroundTask('timeline.sourceLanguage.translate', () => translate(args));
  }
  return serialized;
}
module.exports = { parse, update };
