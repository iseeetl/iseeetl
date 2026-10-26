const ALLOWED_EMOJIS = ['👍', '💖', '👏', '😊', '😲'];
const onlyFrom = (content, emojis) => {
  if (typeof content !== 'string') return false;
  return [...emojis].sort((a,b)=>b.length-a.length).reduce((text, emoji) => text.split(emoji).join(''), content).trim() === '';
};
// Without a room, preserve the fixed legacy set. Room-specific choices use the same catalog as the UI.
const containsOnlyAllowedEmojis = (content, roomId) => {
  if (!roomId) return onlyFrom(content, ALLOWED_EMOJIS);
  return (async () => {
    const Group = require('../../../models/RoomQuickTextGroup');
    const Item = require('../../../models/RoomQuickTextItem');
    const groups = await Group.find({room:roomId,is_emoji:true}).select('_id').lean();
    if (!groups.length) return onlyFrom(content, ALLOWED_EMOJIS);
    const items = await Item.find({room:roomId,group:{$in:groups.map(g=>g._id)}}).select('emoji').lean();
    return onlyFrom(content, items.map(i=>i.emoji).filter(Boolean));
  })();
};
module.exports = { ALLOWED_EMOJIS, containsOnlyAllowedEmojis };
