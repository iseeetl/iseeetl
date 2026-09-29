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

// 翻訳中にタイトルが変更・削除された場合は、古い結果を保存しない。
const translateSupplementTitleIfNeeded = ({ chatId, replyId, supplementId, title, titleLang, targetLangs, userId, io }) => {
  const match = { _id: supplementId, delete_flg: false, title, title_lang: titleLang };
  const query = replyId
    ? { _id: chatId, delete_flg: false, replies: { $elemMatch: {
      _id: replyId, delete_flg: false, supplementaries: { $elemMatch: match },
    } } }
    : { _id: chatId, delete_flg: false, supplementaries: { $elemMatch: match } };
  const targetPath = replyId ? 'replies.$[reply].supplementaries.$[supplement]' : 'supplementaries.$[supplement]';
  const arrayFilters = [Object.fromEntries(Object.entries(match).map(([key, value]) => [`supplement.${key}`, value]))];
  if (replyId) arrayFilters.push({ 'reply._id': replyId, 'reply.delete_flg': false });
  return translateAndEmit({
    chatId, content: title, targetLangs, io,
    translate: () => translationService.translateContent(userId, title, titleLang, targetLangs),
    update: (translations) => Chat.findOneAndUpdate(query,
      { $set: { [`${targetPath}.title_translations`]: translations } },
      { arrayFilters, new: true, runValidators: true }),
    event: replyId ? 'REPLY_SUPPLEMENT_UPDATE' : 'SUPPLEMENT_UPDATE',
  });
};

module.exports = {
  translateSupplementTitleIfNeeded,
  translateGuestMainContentIfNeeded,
  translateGuestReplyIfNeeded,
  translateMainContentIfNeeded,
  translateReplyIfNeeded,
  translateReplySupplementIfNeeded,
  translateSupplementIfNeeded,
};
