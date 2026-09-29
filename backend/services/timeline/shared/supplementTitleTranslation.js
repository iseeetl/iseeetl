const { isGoogleTranslateEnabled } = require('../../../config/featureFlags');
const { titleChanged } = require('../../../utils/supplementTitle');
const { runBackgroundTask } = require('../../backgroundTaskRunner');
const { resolveMutationTargetLangs } = require('./targetLanguages');
const { translateSupplementTitleIfNeeded } = require('../timelineTranslation.service');

function scheduleSupplementTitleTranslation({ chatId, replyId, supplement, previous, body, context, io }) {
  if (!supplement.title || !isGoogleTranslateEnabled() || (previous && !titleChanged(previous, supplement))) return;
  const targetLangs = resolveMutationTargetLangs({
    requested: body.target_langs, floor: context.foundFloor, roomId: context.foundRoom._id,
    io, sourceLang: supplement.title_lang,
  });
  if (!targetLangs.length) return;
  runBackgroundTask('timeline.supplementTitle', () => translateSupplementTitleIfNeeded({
    chatId, replyId, supplementId: supplement._id, title: supplement.title,
    titleLang: supplement.title_lang, targetLangs, userId: context.userId, io,
  }), { context: { postId: String(chatId), supplementId: String(supplement._id) } });
}

module.exports = { scheduleSupplementTitleTranslation };
