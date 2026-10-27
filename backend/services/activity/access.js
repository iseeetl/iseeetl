const AppError = require('../../utils/appError');
const { authorizeRoomAccess } = require('../room/roomAccess.service');
const { ensureGuestRoomContext } = require('../timeline/shared/guestAccess');
const id = value => String(value?._id || value || '');
function principal({ jwtPayload, guest } = {}) {
  if (jwtPayload?.user_id) return { key: `user:${jwtPayload.user_id}`, jwtPayload };
  if (guest?.id) return { key: `guest:${guest.id}`, guest };
  throw new AppError({ code: 'TOKEN_INVALID' });
}
async function authorize(roomId, identity) {
  if (typeof roomId !== 'string' || !/^[a-f0-9]{24}$/i.test(roomId)) throw new AppError({ code: 'INVALID_PARAMS' });
  if (identity.jwtPayload) {
    const result = await authorizeRoomAccess(identity.jwtPayload.user_id, identity.jwtPayload.user_role, roomId, { errors: { permission: { code: 'FORBIDDEN' }, kicked: { code: 'FORBIDDEN' } } });
    return { room: result.foundRoom, floor: result.foundFloor };
  }
  if (!identity.guest?.id) throw new AppError({ code: 'TOKEN_INVALID' });
  return ensureGuestRoomContext(roomId);
}
function targetFor(chat, event) {
  if (!chat || chat.delete_flg || id(chat.room) !== id(event.room_id) || id(chat._id) !== id(event.root_post_id)) return null;
  let target = event.reply_id ? chat.replies?.find(item => id(item) === id(event.reply_id) && !item.delete_flg) : chat;
  if (!target) return null;
  if (event.supplement_id) target = target.supplementaries?.find(item => id(item) === id(event.supplement_id) && !item.delete_flg);
  if (!target || (event.media && !target[`${event.media}_name`])) return null;
  if (event.type === 'reaction' && event.reaction_id &&
    !(target[event.media ? 'alternative_reactions' : 'reactions'] || []).some(value => id(value) === id(event.reaction_id))) return null;
  return target;
}
module.exports = { principal, authorize, targetFor, id };
