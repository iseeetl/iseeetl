// アップロード上限を変更するときは、フロントエンド・バックエンド・リバースプロキシの上限を合わせる。

export const ALLOWED_IMAGE_TYPES = ['image/jpg', 'image/jpeg', 'image/png'];
export const MAX_IMAGE_SIZE_IN_BYTES = 3 * 1024 * 1024;

export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/ogv',
  'video/webm',
  'video/quicktime',
  'application/octet-stream',
];
const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.ogv', '.webm', '.mov'];
export const MAX_VIDEO_SIZE_IN_BYTES = 150 * 1024 * 1024;
export const MAX_VIDEO_DURATION_IN_SECONDS = 30;

export const ALLOWED_AUDIO_TYPES = [
  'audio/x-m4a',
  'audio/m4a',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
];
export const MAX_AUDIO_SIZE_IN_BYTES = 6 * 1024 * 1024;
export const MAX_AUDIO_DURATION_IN_SECONDS = 30;

const normalizeMime = (value) => (value ? String(value).split(';')[0].toLowerCase() : '');
const getExtension = (name = '') => {
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index).toLowerCase();
};

export const isAllowedImageFile = (file) => {
  if (!file) return false;
  const type = normalizeMime(file.type);
  return ALLOWED_IMAGE_TYPES.includes(type);
};

export const isImageSizeWithinLimit = (size) => typeof size === 'number' && size <= MAX_IMAGE_SIZE_IN_BYTES;

export const isAllowedVideoFile = (file) => {
  if (!file) return false;
  const type = normalizeMime(file.type);
  const ext = getExtension(file.name || '');
  if (!ALLOWED_VIDEO_TYPES.includes(type)) return false;
  return ALLOWED_VIDEO_EXTENSIONS.includes(ext);
};

export const isAllowedAudioFile = (file) => {
  if (!file) return false;
  const type = normalizeMime(file.type);
  return ALLOWED_AUDIO_TYPES.includes(type);
};
