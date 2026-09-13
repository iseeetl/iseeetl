const crypto = require('crypto');
const { publishSocketEvent } = require('../../../socket/publication');

const {
  translateReplyIfNeeded,
  translateGuestReplyIfNeeded,
} = require('../../../services/timeline/timelineTranslation.service');

function createNotificationEventId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function attachReplyNotificationEvent(
  reply,
  notifyAll,
  { createId = createNotificationEventId, createTimestamp = () => new Date().toISOString() } = {}
) {
  if (!reply) return reply;

  reply.notify_all = !!notifyAll;
  if (!notifyAll) return reply;

  reply.notification_event_id = createId();
  reply.notified_at = createTimestamp();
  return reply;
}

function resolveRoomId(result) {
  return result?.room?._id || result?.room || null;
}

function emitReplyCreate(io, result, { includeNotifyAll = false, notifyAll = false } = {}) {
  return publishSocketEvent('REPLY_CREATE', () => {
    const roomId = resolveRoomId(result);
    if (!io || !roomId) return;

    if (includeNotifyAll) {
      const emitData = JSON.parse(JSON.stringify(result));
      const lastIdx = emitData.replies.length - 1;
      attachReplyNotificationEvent(emitData.replies[lastIdx], notifyAll);
      return io.to(roomId).emit('REPLY_CREATE', emitData);
    }

    return io.to(roomId).emit('REPLY_CREATE', result);
  });
}

async function translateReplyAfterCreate({ result, updatedChat, targetLangs, io, actor }) {
  const source = updatedChat?.replies?.length ? updatedChat : result;
  const reply = source?.replies?.[source.replies.length - 1];
  if (!reply) return;

  const chatId = result?._id || updatedChat?._id;
  if (!chatId) return;

  if (actor?.type === 'guest') {
    return translateGuestReplyIfNeeded({
      chatId,
      reply,
      targetLangs,
      io,
      guestId: actor.id,
    });
  }

  return translateReplyIfNeeded({
    chatId,
    reply,
    targetLangs,
    io,
    userId: actor?.id,
  });
}

module.exports = {
  attachReplyNotificationEvent,
  emitReplyCreate,
  translateReplyAfterCreate,
};
