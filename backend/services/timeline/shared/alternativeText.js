const AppError = require('../../../utils/appError');
const fields = ['image_name', 'video_name', 'audio_name', 'image_caption', 'video_description', 'audio_description'];
const textFields = { image: 'image_caption', video: 'video_description', audio: 'audio_description' };
const snapshot = (item) => Object.fromEntries(fields.map((key) => [key, item?.[key] ?? null]));
function validateSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || fields.some((key) =>
        !Object.hasOwn(value, key) || (value[key] !== null &&
          (typeof value[key] !== 'string' || value[key].length > (key.endsWith('_name') ? 255 : 2000))))) {
    throw new AppError({ code: 'INVALID_PARAMS' });
  }
  return value;
}
function assertSnapshot(item, expected) {
  if (expected === undefined) return;
  validateSnapshot(expected);
  const current = snapshot(item);
  if (fields.some((key) => current[key] !== expected[key])) throw new AppError({ code: 'CONFLICT' });
}
module.exports = { fields, textFields, snapshot, validateSnapshot, assertSnapshot };
