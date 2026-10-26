export const mediaTextFields = { image: 'image_caption', video: 'video_description', audio: 'audio_description' };
export const mediaTextSnapshot = (item = {}) => Object.fromEntries(
  ['image_name', 'video_name', 'audio_name', ...Object.values(mediaTextFields)].map((key) => [key, item[key] ?? null])
);
export const mediaText = (item, kind) => item?.[mediaTextFields[kind]] || '';
