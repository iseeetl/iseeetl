// Only public room/post identifiers and short display labels belong in this setting.
const parseRoomGuides = (raw = '') => {
  if (!raw.trim()) return {};
  const fail = () => { throw new Error('VITE_ROOM_GUIDES must contain valid room guide references'); };
  let value;
  try { value = JSON.parse(raw); } catch { return fail(); }
  const objectId = /^[a-f0-9]{24}$/;
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length > 20) return fail();
  for (const [roomId, groups] of Object.entries(value)) {
    if (!objectId.test(roomId) || !Array.isArray(groups) || groups.length > 6) return fail();
    const languages = new Set();
    for (const group of groups) {
      if (!group || typeof group !== 'object' || Array.isArray(group) ||
          Object.keys(group).some((key) => !['lang', 'label', 'postIds'].includes(key)) ||
          typeof group.lang !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(group.lang) ||
          languages.has(group.lang) || typeof group.label !== 'string' || !group.label.trim() ||
          group.label.length > 60 || /[\r\n]/.test(group.label) ||
          !Array.isArray(group.postIds) || group.postIds.length < 1 || group.postIds.length > 4 ||
          group.postIds.some((id) => typeof id !== 'string' || !objectId.test(id)) ||
          new Set(group.postIds).size !== group.postIds.length) return fail();
      languages.add(group.lang);
    }
  }
  return value;
};

module.exports = { parseRoomGuides };
