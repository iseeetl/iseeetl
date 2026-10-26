const Chat = require('../../models/Chat');
const AppError = require('../../utils/appError');
const { authorizeRoomAccess } = require('../room/roomAccess.service');
const serializeTimeline = require('./shared/timelineSerializer');
const { publishSocketEvent } = require('../../socket/publication');
const { canEditSupplement } = require('./shared/supplementCommon');
const { textFields, snapshot, validateSnapshot, assertSnapshot } = require('./shared/alternativeText');

const invalid = () => { throw new AppError({ code: 'INVALID_PARAMS' }); };
function parse(params, body) {
  for (const key of ['room_id', 'post_id', 'reply_id', 'supplement_id']) {
    if ((['room_id', 'post_id'].includes(key) || params[key] !== undefined) &&
        (typeof params[key] !== 'string' || !/^[a-f\d]{24}$/i.test(params[key]))) invalid();
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some((key) => !['kind', 'text', 'expected'].includes(key)) ||
      !Object.hasOwn(textFields, body.kind) || typeof body.text !== 'string' || body.text.length > 2000) invalid();
  validateSnapshot(body.expected);
  return body;
}
// Only text is mutable. The same room-access gate as collaborative tag editing applies.
async function update(params, body, identity, io) {
  const { kind, text, expected } = parse(params, body);
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
  if (!item[`${kind}_name`]) throw new AppError({ code: 'CONFLICT' });
  assertSnapshot(item, expected);
  for (const [key, value] of Object.entries(snapshot(item))) conditions[`${prefix}${key}`] = value;
  const result = await Chat.findOneAndUpdate(conditions, {
    $set: { [`${prefix}${textFields[kind]}`]: text },
  }, { new: true, runValidators: true })
    .populate('user', 'username image_name delete_flg')
    .populate('replies.user', 'username image_name delete_flg')
    .populate('supplementaries.user', 'username image_name delete_flg')
    .populate('replies.supplementaries.user', 'username image_name delete_flg');
  if (!result) throw new AppError({ code: 'CONFLICT' });
  const serialized = serializeTimeline(result);
  await publishSocketEvent('POST_UPDATE', () => io.to(String(params.room_id)).emit('POST_UPDATE', serialized));
  return serialized;
}
module.exports = { parse, update };
