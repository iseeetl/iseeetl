const Chat = require('../../models/Chat');
const AppError = require('../../utils/appError');
const { authorizeRoomAccess } = require('../room/roomAccess.service');
const serializeTimeline = require('./shared/timelineSerializer');
const { publishSocketEvent } = require('../../socket/publication');
const { canEditSupplement } = require('./shared/supplementCommon');
const { ALLOWED_LANGUAGES } = require('../../constants/languages');

const invalid = () => { throw new AppError({ code: 'INVALID_PARAMS' }); };
const snapshot = (item) => ({ content: item.content ?? null, lang: item.lang ?? null });
function parse(params, body) {
  for (const key of ['room_id', 'post_id', 'supplement_id', 'reply_id']) {
    if ((key !== 'reply_id' || params[key] !== undefined) && (typeof params[key] !== 'string' || !/^[a-f\d]{24}$/i.test(params[key]))) invalid();
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['text','lang','expected'].includes(k)) ||
      typeof body.text !== 'string' || !body.text.trim() || body.text.length > 2000 || !ALLOWED_LANGUAGES.includes(body.lang)) invalid();
  const e=body.expected;
  if (!e || typeof e !== 'object' || Array.isArray(e) || Object.keys(e).length !== 2 ||
      !Object.hasOwn(e,'content') || !Object.hasOwn(e,'lang') ||
      (e.content !== null && (typeof e.content !== 'string' || e.content.length > 2000)) ||
      (e.lang !== null && !ALLOWED_LANGUAGES.includes(e.lang))) invalid();
  return body;
}
// Only text is mutable. The same room-access gate as collaborative tag editing applies.
async function update(params, body, identity, io) {
  const { text, lang, expected } = parse(params, body);
  const access = await authorizeRoomAccess(identity.user_id, identity.user_role, params.room_id,
    { ...require('../../controllers/timeline/resourceOptions'), roomSelect: '_id floor member_only title collaborative_text_editing' });
  const chat = await Chat.findOne({ _id: params.post_id, room: params.room_id, delete_flg: false });
  if (!chat) throw new AppError({ code: 'NOT_FOUND' });
  let item = chat;
  let prefix = '';
  const conditions = { _id: chat._id, room: params.room_id, delete_flg: false };
  if (params.reply_id) {
    const index = chat.replies.findIndex((value) => String(value._id) === params.reply_id && !value.delete_flg);
    if (index < 0) throw new AppError({ code: 'NOT_FOUND' });
    prefix = `replies.${index}.`; item = chat.replies[index];
    conditions[`${prefix}_id`] = item._id; conditions[`${prefix}delete_flg`] = false;
  }
  if (params.supplement_id) {
    const index = item.supplementaries.findIndex((value) => String(value._id) === params.supplement_id && !value.delete_flg);
    if (index < 0) throw new AppError({ code: 'NOT_FOUND' });
    prefix += `supplementaries.${index}.`; item = item.supplementaries[index];
    conditions[`${prefix}_id`] = item._id; conditions[`${prefix}delete_flg`] = false;
  }
  if (access.foundRoom.collaborative_text_editing !== true && !canEditSupplement({ role: identity.user_role, floor: access.foundFloor, floorMember: access.foundFloorMember, supplementUser: item.user, userId: identity.user_id })) throw new AppError({ code: 'FORBIDDEN' });
  if (Object.entries(snapshot(item)).some(([k,v]) => v !== expected[k])) throw new AppError({ code: 'CONFLICT' });
  for (const [key, value] of Object.entries(snapshot(item))) conditions[`${prefix}${key}`] = value;
  const result = await Chat.findOneAndUpdate(conditions, {
    $set: { [`${prefix}content`]: text, [`${prefix}lang`]: lang, [`${prefix}translations`]: [] },
  }, { new: true, runValidators: true })
    .populate('user', 'username image_name delete_flg')
    .populate('replies.user', 'username image_name delete_flg')
    .populate('supplementaries.user', 'username image_name delete_flg')
    .populate('replies.supplementaries.user', 'username image_name delete_flg');
  if (!result) throw new AppError({ code: 'CONFLICT' });
  const serialized = serializeTimeline(result);
  await publishSocketEvent('POST_UPDATE', () => io.to(String(params.room_id)).emit('POST_UPDATE', serialized));
  // Rebuild translations for the corrected text; a delayed result cannot overwrite a newer edit.
  if (require('../../config/featureFlags').isGoogleTranslateEnabled() && access.foundFloor.target_langs?.length) {
    require('../backgroundTaskRunner').runBackgroundTask('timeline.sharedText.translate', async () => {
      const translations = await require('../translation.service').translateContent(identity.user_id, text, lang, access.foundFloor.target_langs);
      const currentConditions = { ...conditions, [`${prefix}content`]: text, [`${prefix}lang`]: lang };
      const translated = await Chat.findOneAndUpdate(currentConditions, { $set: { [`${prefix}translations`]: translations } }, {new:true,runValidators:true})
        .populate('user', 'username image_name delete_flg').populate('replies.user', 'username image_name delete_flg')
        .populate('supplementaries.user', 'username image_name delete_flg').populate('replies.supplementaries.user', 'username image_name delete_flg');
      if (translated) await publishSocketEvent('POST_UPDATE', () => io.to(String(params.room_id)).emit('POST_UPDATE', serializeTimeline(translated)));
    });
  }
  return serialized;
}
module.exports = { parse, update };
