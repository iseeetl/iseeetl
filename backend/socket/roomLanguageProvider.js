const { ALLOWED_LANGUAGES } = require('../constants/languages');

const allowed = new Set(ALLOWED_LANGUAGES);

function createRoomLanguageProvider(roomParticipants) {
  return {
    getLanguages(roomId) {
      const users = roomParticipants.get(String(roomId));
      if (!users) return [];

      const languages = new Set();
      users.forEach((user) => {
        if (user?.languages instanceof Map) {
          user.languages.forEach((lang) => {
            if (allowed.has(lang)) languages.add(lang);
          });
        } else if (allowed.has(user?.lang)) {
          languages.add(user.lang);
        }
      });
      return Array.from(languages);
    },
  };
}

module.exports = { createRoomLanguageProvider };
