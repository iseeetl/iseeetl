const ALLOWED_EMOJIS = ['👍', '💖', '👏', '😊', '😲'];

const containsOnlyAllowedEmojis = (content) => {
  if (typeof content !== 'string') return false;
  return ALLOWED_EMOJIS.reduce((acc, e) => acc.replace(new RegExp(e, 'g'), ''), content).trim() === '';
};

module.exports = { ALLOWED_EMOJIS, containsOnlyAllowedEmojis };
