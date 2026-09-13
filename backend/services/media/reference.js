const fs = require('fs');
const path = require('path');

const Chat = require('../../models/Chat');
const Room = require('../../models/Room');
const AppError = require('../../utils/appError');
const { resolveLeafFilePath, resolveMongoIdPath } = require('../../utils/safePath');

const MEDIA_FIELDS = [
  { key: 'image_name', type: 'image', extensions: ['.jpg', '.jpeg', '.png'] },
  { key: 'image_thumbnail_name', type: 'imageThumbnail', extensions: ['.jpg', '.jpeg', '.png'], thumbnail: true },
  { key: 'video_name', type: 'video', extensions: ['.mp4', '.ogv', '.webm', '.mov'] },
  { key: 'video_thumbnail_name', type: 'videoThumbnail', extensions: ['.png'] },
  { key: 'video_subtitle_name', type: 'subtitle', extensions: ['.srt', '.vtt'] },
  { key: 'audio_name', type: 'audio', extensions: ['.mp3'] },
];
const MEDIA_FIELD_NAMES = MEDIA_FIELDS.map(({ key }) => key);
const MEDIA_STATE_FIELDS = [
  ...MEDIA_FIELD_NAMES,
  'image_caption',
  'video_subtitle_originalname',
  'audio_title',
  'audio_description',
];
const FILE_NAME_PATTERN = /^(\d+)_([0-9a-fA-F]{24})(_thumbnail)?(\.[a-zA-Z0-9]+)$/;

const invalidMedia = () => new AppError({ code: 'INVALID_PARAMS' });
const toId = (value) => (value == null ? null : String(value));

const parseMediaFileName = (fileName) => {
  if (typeof fileName !== 'string' || path.basename(fileName) !== fileName) return null;
  const match = FILE_NAME_PATTERN.exec(fileName);
  if (!match) return null;
  return {
    timestamp: match[1],
    userId: match[2],
    thumbnail: Boolean(match[3]),
    extension: match[4].toLowerCase(),
    baseName: `${match[1]}_${match[2]}`,
  };
};

const mediaFrom = (item = {}) =>
  MEDIA_STATE_FIELDS.reduce((result, field) => {
    result[field] = item?.[field] ?? null;
    return result;
  }, {});

const sameMedia = (left, right) => MEDIA_STATE_FIELDS.every((field) => left[field] === right[field]);

const assertPairs = (media) => {
  const activeGroups = [media.image_name, media.video_name, media.audio_name].filter(Boolean);
  if (activeGroups.length > 1) throw invalidMedia();

  if (Boolean(media.image_name) !== Boolean(media.image_thumbnail_name)) throw invalidMedia();
  if (media.image_name) {
    const main = parseMediaFileName(media.image_name);
    const thumb = parseMediaFileName(media.image_thumbnail_name);
    if (!main || !thumb || !thumb.thumbnail || main.baseName !== thumb.baseName || main.extension !== thumb.extension) {
      throw invalidMedia();
    }
  }
  if (media.image_caption && !media.image_name) throw invalidMedia();

  if (Boolean(media.video_name) !== Boolean(media.video_thumbnail_name)) throw invalidMedia();
  if (media.video_name) {
    const main = parseMediaFileName(media.video_name);
    const thumb = parseMediaFileName(media.video_thumbnail_name);
    if (!main || !thumb || thumb.thumbnail || main.baseName !== thumb.baseName || thumb.extension !== '.png') {
      throw invalidMedia();
    }
  }
  if (media.video_subtitle_name && !media.video_name) throw invalidMedia();
  if (Boolean(media.video_subtitle_name) !== Boolean(media.video_subtitle_originalname)) {
    throw invalidMedia();
  }
  if ((media.audio_title || media.audio_description) && !media.audio_name) throw invalidMedia();
};

const isExcluded = ({ exclude, kind, postId, replyId, supplementId }) => {
  if (!exclude || exclude.kind !== kind) return false;
  if (toId(exclude.postId) !== toId(postId)) return false;
  if (kind === 'reply' && toId(exclude.replyId) !== toId(replyId)) return false;
  if (kind === 'postSupplement' && toId(exclude.supplementId) !== toId(supplementId)) return false;
  if (kind === 'replySupplement') {
    return toId(exclude.replyId) === toId(replyId) && toId(exclude.supplementId) === toId(supplementId);
  }
  return true;
};

const itemReferencesFile = (item, fileName) =>
  Boolean(item) && MEDIA_FIELD_NAMES.some((field) => item[field] === fileName);

const chatReferencesFile = (chat, fileName, exclude) => {
  const postId = chat?._id;
  if (!chat?.delete_flg && !isExcluded({ exclude, kind: 'post', postId }) && itemReferencesFile(chat, fileName)) {
    return true;
  }

  for (const supplement of chat?.supplementaries || []) {
    if (supplement?.delete_flg) continue;
    if (isExcluded({ exclude, kind: 'postSupplement', postId, supplementId: supplement._id })) continue;
    if (itemReferencesFile(supplement, fileName)) return true;
  }

  for (const reply of chat?.replies || []) {
    if (reply?.delete_flg) continue;
    if (!isExcluded({ exclude, kind: 'reply', postId, replyId: reply._id }) && itemReferencesFile(reply, fileName)) {
      return true;
    }
    for (const supplement of reply?.supplementaries || []) {
      if (supplement?.delete_flg) continue;
      if (
        isExcluded({
          exclude,
          kind: 'replySupplement',
          postId,
          replyId: reply._id,
          supplementId: supplement._id,
        })
      ) {
        continue;
      }
      if (itemReferencesFile(supplement, fileName)) return true;
    }
  }
  return false;
};

const buildReferenceQuery = (roomId, fileName) => ({
  room: roomId,
  delete_flg: false,
  $or: [
    ...MEDIA_FIELD_NAMES.map((field) => ({ [field]: fileName })),
    ...MEDIA_FIELD_NAMES.map((field) => ({ [`supplementaries.${field}`]: fileName })),
    ...MEDIA_FIELD_NAMES.map((field) => ({ [`replies.${field}`]: fileName })),
    ...MEDIA_FIELD_NAMES.map((field) => ({ [`replies.supplementaries.${field}`]: fileName })),
  ],
});

const findCandidateChats = async (roomId, fileName) => {
  const query = Chat.find(buildReferenceQuery(roomId, fileName));
  const selected = typeof query?.select === 'function'
    ? query.select(`delete_flg ${MEDIA_FIELD_NAMES.join(' ')} supplementaries replies`)
    : query;
  if (typeof selected?.lean === 'function') return selected.lean();
  return selected || [];
};

const isMediaFileReferenced = async ({ roomId, fileName, exclude = null }) => {
  if (!fileName) return false;
  const roomReference = await Room.exists({
    _id: roomId,
    delete_flg: false,
    image_name: fileName,
  });
  if (roomReference) return true;

  const chats = await findCandidateChats(roomId, fileName);
  return (chats || []).some((chat) => chatReferencesFile(chat, fileName, exclude));
};

const validateFile = async ({ floorId, roomId, userId, field, fileName, exclude }) => {
  const definition = MEDIA_FIELDS.find(({ key }) => key === field);
  const parsed = parseMediaFileName(fileName);
  if (
    !definition ||
    !parsed ||
    parsed.userId !== toId(userId) ||
    parsed.thumbnail !== Boolean(definition.thumbnail) ||
    !definition.extensions.includes(parsed.extension)
  ) {
    throw invalidMedia();
  }

  const mediaRoot = process.env.MEDIA_PATH;
  if (typeof mediaRoot !== 'string' || !mediaRoot) throw invalidMedia();
  const roomDir = resolveMongoIdPath(mediaRoot, [toId(floorId), toId(roomId)], {
    createError: invalidMedia,
  });
  const filePath = resolveLeafFilePath(roomDir, fileName, { createError: invalidMedia });
  try {
    await fs.promises.access(filePath);
  } catch {
    throw invalidMedia();
  }

  if (await isMediaFileReferenced({ roomId, fileName, exclude })) throw invalidMedia();
};

const validateMediaChanges = async ({ floorId, roomId, userId, newItem, oldItem = null, exclude = null }) => {
  const nextMedia = mediaFrom(newItem);
  const previousMedia = mediaFrom(oldItem);
  if (oldItem && sameMedia(nextMedia, previousMedia)) return;

  assertPairs(nextMedia);
  for (const { key } of MEDIA_FIELDS) {
    const fileName = nextMedia[key];
    if (!fileName || fileName === previousMedia[key]) continue;
    await validateFile({ floorId, roomId, userId, field: key, fileName, exclude });
  }
};

module.exports = {
  MEDIA_FIELD_NAMES,
  chatReferencesFile,
  isMediaFileReferenced,
  mediaFrom,
  parseMediaFileName,
  validateMediaChanges,
};
