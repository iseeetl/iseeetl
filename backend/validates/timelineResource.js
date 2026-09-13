const AppError = require('../utils/appError');
const { ALLOWED_LANGUAGES } = require('../constants/languages');

const invalid = () => { throw new AppError({ code: 'INVALID_PARAMS' }); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value, fields) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  if (Object.keys(value).some((key) => !fields.includes(key))) invalid();
};
const id = (value) => {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) invalid();
  return value.toLowerCase();
};
const nullableString = (value, max) => {
  if (value !== null && (typeof value !== 'string' || value.length > max)) invalid();
  return value;
};
const MEDIA = {
  image: { file_name: 'image_name', thumbnail_name: 'image_thumbnail_name', caption: 'image_caption' },
  video: { file_name: 'video_name', thumbnail_name: 'video_thumbnail_name' },
  audio: { file_name: 'audio_name', title: 'audio_title', description: 'audio_description' },
};
const SUBTITLE = { file_name: 'video_subtitle_name', original_name: 'video_subtitle_originalname' };
const mediaFields = [...Object.values(MEDIA).flatMap(Object.values), ...Object.values(SUBTITLE)];

function mapMedia(media) {
  if (media === null) return Object.fromEntries(mediaFields.map((key) => [key, null]));
  object(media, Object.keys(MEDIA));
  const result = {};
  for (const [kind, mapping] of Object.entries(MEDIA)) {
    if (!own(media, kind)) continue;
    const group = media[kind];
    const fields = kind === 'video' ? [...Object.values(mapping), ...Object.values(SUBTITLE)] : Object.values(mapping);
    if (group === null) {
      for (const field of fields) result[field] = null;
      continue;
    }
    object(group, [...Object.keys(mapping), ...(kind === 'video' ? ['subtitle'] : [])]);
    for (const [key, field] of Object.entries(mapping)) {
      if (own(group, key)) result[field] = nullableString(group[key], key.endsWith('name') ? 255 : 200);
    }
    if (kind === 'video' && own(group, 'subtitle')) {
      if (group.subtitle === null) {
        for (const field of Object.values(SUBTITLE)) result[field] = null;
      } else {
        object(group.subtitle, Object.keys(SUBTITLE));
        for (const [key, field] of Object.entries(SUBTITLE)) {
          if (own(group.subtitle, key)) result[field] = nullableString(group.subtitle[key], key === 'original_name' ? 100 : 255);
        }
      }
    }
  }
  return result;
}

function mapTimelineRequest(params, body, operation, kind = 'post') {
  const scope = { room_id: id(params.room_id) };
  if (kind !== 'post') scope.post_id = id(params.post_id);
  if (kind === 'replySupplement') scope.reply_id = id(params.reply_id);
  if (operation !== 'create') scope._id = id(params[kind === 'post' ? 'post_id' : kind === 'reply' ? 'reply_id' : 'supplement_id']);
  const supplement = kind === 'postSupplement' || kind === 'replySupplement';
  const fields = ['content', 'lang', 'media', ...(!supplement ? ['room_tags', 'animation'] : []), ...(kind === 'reply' ? ['notify_all'] : [])];
  object(body, operation === 'delete' ? [] : fields);
  if (operation === 'delete') return scope;
  const data = {};
  if (own(body, 'content')) {
    data.content = nullableString(body.content, 400);
    if (data.content !== null && !data.content.trim()) invalid();
  }
  if (own(body, 'lang')) {
    if (!ALLOWED_LANGUAGES.includes(body.lang)) invalid();
    data.lang = body.lang;
  }
  if (own(body, 'room_tags')) {
    if (!Array.isArray(body.room_tags) || body.room_tags.length > 100) invalid();
    data.room_tags = [...new Set(body.room_tags.map(id))];
  }
  if (own(body, 'animation')) {
    if (body.animation !== null && body.animation !== 'move-and-erase') invalid();
    data.animation = body.animation;
  }
  if (own(body, 'notify_all')) {
    if (typeof body.notify_all !== 'boolean') invalid();
    data.notify_all = body.notify_all;
  }
  if (own(body, 'media')) Object.assign(data, mapMedia(body.media));
  if (operation === 'create') {
    if (!data.lang) invalid();
    if (!data.content && ![data.image_name, data.video_name, data.audio_name].some(Boolean)) invalid();
    if (!own(data, 'content')) data.content = null;
  }
  return { ...data, ...scope };
}

const mapPostRequest = (params, body, operation) => mapTimelineRequest(params, body, operation);
const mapTagRequest = (params, body, kind) => {
  object(body, ['room_tags']);
  if (!own(body, 'room_tags')) invalid();
  return mapTimelineRequest(params, body, 'update', kind);
};
module.exports = { mapPostRequest, mapTimelineRequest, mapTagRequest };
