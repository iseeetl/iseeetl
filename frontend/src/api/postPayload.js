const scalarFields = ['content', 'lang', 'room_tags', 'animation'];
const groups = {
  image: { file_name: 'image_name', thumbnail_name: 'image_thumbnail_name', caption: 'image_caption' },
  video: { file_name: 'video_name', thumbnail_name: 'video_thumbnail_name' },
  audio: { file_name: 'audio_name', title: 'audio_title', description: 'audio_description' },
};

const mediaState = (value = {}) => Object.fromEntries(Object.entries(groups).map(([kind, fields]) => {
  if (!value[fields.file_name]) return [kind, null];
  const group = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, value[field] ?? null]));
  if (kind === 'video') group.subtitle = value.video_subtitle_name ? {
    file_name: value.video_subtitle_name,
    original_name: value.video_subtitle_originalname,
  } : null;
  return [kind, group];
}));

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const scalar = (value, key) => key === 'room_tags' ? [...(value[key] || [])].sort() : value[key] ?? null;

export function buildPostCreate(value) {
  const body = Object.fromEntries(scalarFields
    .filter((key) => value[key] != null && (key !== 'room_tags' || value[key].length))
    .map((key) => [key, value[key]]));
  const media = Object.fromEntries(Object.entries(mediaState(value)).filter(([, group]) => group !== null));
  if (Object.keys(media).length) body.media = media;
  return body;
}

export function buildPostPatch(value, initial) {
  const body = Object.fromEntries(scalarFields
    .filter((key) => !equal(scalar(value, key), scalar(initial, key)))
    .map((key) => [key, value[key] ?? null]));
  const before = mediaState(initial);
  const after = mediaState(value);
  const media = {};
  for (const kind of Object.keys(groups)) {
    if (equal(before[kind], after[kind])) continue;
    if (!before[kind] || !after[kind]) media[kind] = after[kind];
    else media[kind] = Object.fromEntries(Object.entries(after[kind])
      .filter(([key, next]) => !equal(next, before[kind][key])));
  }
  if (Object.keys(media).length) body.media = media;
  return body;
}
