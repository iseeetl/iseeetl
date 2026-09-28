const { isGoogleTranslateEnabled } = require('../../config/featureFlags');
const translationService = require('../translation.service');

exports.buildEmptyMessageUpdate = async ({ body, room, floor, userId }) => {
  const previous = room?.empty_message || '';
  const message = body.empty_message === undefined ? previous : (body.empty_message || '').trim();
  if (room && previous === message && room.lang === body.lang) return {};

  const translations = message && isGoogleTranslateEnabled()
    ? await translationService.translateContent(userId, message, body.lang, floor.target_langs || [])
    : [];
  return {
    empty_message: message,
    empty_message_translations: translations.filter((entry) => entry.content?.trim()),
  };
};
