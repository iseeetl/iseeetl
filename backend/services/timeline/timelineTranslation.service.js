const translationService = require('../translation.service');
const serializeTimeline = require('./shared/timelineSerializer');
const { normalizeId } = require('./shared/notificationUtils');
const Chat = require('../../models/Chat');
const { publishSocketEvent } = require('../../socket/publication');

const shouldSkip = (content, targets) => !content || !targets || targets.length === 0;

const populateUpdatedChat = async (chat, { guestMain = false } = {}) => {
  if (typeof chat.populate !== 'function') return chat;
  let populated = await chat.populate('user', 'username image_name delete_flg');
  if (guestMain) return populated;
  for (const path of ['replies.user', 'replies.supplementaries.user', 'supplementaries.user']) {
    populated = await populated.populate(path, 'username image_name delete_flg');
  }
  return populated;
};

const emitTranslationFailure = async ({ io, chatId, roomId, failedLanguages }) => {
  if (!failedLanguages.length) return;
  await publishSocketEvent('TRANSLATION_ERROR', async () => {
    if (!io) return;
    let targetRoomId = roomId;
    if (!targetRoomId) {
      const chat = await Chat.findById(chatId).select('room').lean();
      targetRoomId = chat?.room;
    }
    if (targetRoomId) {
      return io.to(normalizeId(targetRoomId)).emit('TRANSLATION_ERROR', { failedLanguages });
    }
  });
};

const translateAndEmit = async ({ chatId, content, targetLangs, translate, update, event, io, guestMain = false }) => {
  if (shouldSkip(content, targetLangs)) return;
  const translations = await translate();
  const failedLanguages = translationService.getFailedTranslationLanguages(translations);
  if (!translations.length) {
    await emitTranslationFailure({ io, chatId, failedLanguages });
    return;
  }

  const updated = await update(translations);
  if (!updated) return;
  let roomId;
  await publishSocketEvent(event, async () => {
    if (!io) return;
    const cleaned = serializeTimeline(await populateUpdatedChat(updated, { guestMain }));
    roomId = normalizeId(cleaned.room?._id || cleaned.room);
    return io.to(roomId).emit(event, cleaned);
  });
  await emitTranslationFailure({ io, chatId, roomId, failedLanguages });
};

const translateMainContentIfNeeded = ({ userId, chatId, content, lang, targetLangs, io }) =>
  translateAndEmit({
    chatId,
    content,
    targetLangs,
    translate: () => translationService.translateContent(userId, content, lang, targetLangs),
    update: (translations) =>
      Chat.findOneAndUpdate(
        { _id: chatId, delete_flg: false },
        { $set: { translations } },
        { new: true, runValidators: true }
      ),
    event: 'POST_UPDATE',
    io,
  });

const translateGuestMainContentIfNeeded = ({ guestId, chatId, content, lang, targetLangs, io }) =>
  translateAndEmit({
    chatId,
    content,
    targetLangs,
    translate: () => translationService.translateGuestContent(guestId, content, lang, targetLangs),
    update: (translations) =>
      Chat.findOneAndUpdate(
        { _id: chatId, delete_flg: false },
        { $set: { translations } },
        { new: true, runValidators: true }
      ),
    event: 'POST_UPDATE',
    io,
    guestMain: true,
  });

const translateReply = ({ chatId, reply, targetLangs, io, translate }) =>
  translateAndEmit({
    chatId,
    content: reply.content,
    targetLangs,
    translate,
    update: (translations) =>
      Chat.findOneAndUpdate(
        { _id: chatId, delete_flg: false },
        { $set: { 'replies.$[reply].translations': translations } },
        { arrayFilters: [{ 'reply._id': reply._id }], new: true, runValidators: true }
      ),
    event: 'REPLY_UPDATE',
    io,
  });

const translateReplyIfNeeded = ({ chatId, reply, targetLangs, io, userId }) =>
  translateReply({
    chatId,
    reply,
    targetLangs,
    io,
    translate: () => translationService.translateContent(userId, reply.content, reply.lang, targetLangs),
  });

const translateGuestReplyIfNeeded = ({ chatId, reply, targetLangs, io, guestId }) =>
  translateReply({
    chatId,
    reply,
    targetLangs,
    io,
    translate: () => translationService.translateGuestContent(guestId, reply.content, reply.lang, targetLangs),
  });

const translateSupplementIfNeeded = ({ chatId, supplementId, content, lang, targetLangs, userId, io }) =>
  translateAndEmit({
    chatId,
    content,
    targetLangs,
    translate: () => translationService.translateContent(userId, content, lang, targetLangs),
    update: (translations) =>
      Chat.findOneAndUpdate(
        { _id: chatId, delete_flg: false },
        { $set: { 'supplementaries.$[supplement].translations': translations } },
        { arrayFilters: [{ 'supplement._id': supplementId }], new: true, runValidators: true }
      ),
    event: 'SUPPLEMENT_UPDATE',
    io,
  });

const translateReplySupplementIfNeeded = ({
  chatId,
  replyId,
  supplementId,
  content,
  lang,
  targetLangs,
  userId,
  io,
}) =>
  translateAndEmit({
    chatId,
    content,
    targetLangs,
    translate: () => translationService.translateContent(userId, content, lang, targetLangs),
    update: (translations) =>
      Chat.findOneAndUpdate(
        { _id: chatId, delete_flg: false },
        { $set: { 'replies.$[reply].supplementaries.$[supp].translations': translations } },
        {
          arrayFilters: [{ 'reply._id': replyId }, { 'supp._id': supplementId }],
          new: true,
          runValidators: true,
        }
      ),
    event: 'REPLY_SUPPLEMENT_UPDATE',
    io,
  });

module.exports = {
  translateGuestMainContentIfNeeded,
  translateGuestReplyIfNeeded,
  translateMainContentIfNeeded,
  translateReplyIfNeeded,
  translateReplySupplementIfNeeded,
  translateSupplementIfNeeded,
};
