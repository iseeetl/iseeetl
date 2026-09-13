const TIMELINE_MUTABLE_FIELDS = [
  'content',
  'lang',
  'room_tags',
  'animation',
  'image_name',
  'image_thumbnail_name',
  'image_caption',
  'video_name',
  'video_thumbnail_name',
  'video_subtitle_originalname',
  'video_subtitle_name',
  'audio_name',
  'audio_title',
  'audio_description',
];

const SUPPLEMENT_MUTABLE_FIELDS = [
  'content',
  'lang',
  'image_name',
  'image_thumbnail_name',
  'image_caption',
  'video_name',
  'video_thumbnail_name',
  'video_subtitle_originalname',
  'video_subtitle_name',
  'audio_name',
  'audio_title',
  'audio_description',
];

const SUPPLEMENT_MEDIA_VALIDATION_FIELDS = [
  'image_name',
  'image_thumbnail_name',
  'video_name',
  'video_thumbnail_name',
  'video_subtitle_originalname',
  'video_subtitle_name',
  'audio_name',
];

const SUPPLEMENT_MEDIA_FIELDS = SUPPLEMENT_MUTABLE_FIELDS.filter((field) =>
  field.startsWith('image_') || field.startsWith('video_') || field.startsWith('audio_')
);
const TIMELINE_MEDIA_FIELDS = TIMELINE_MUTABLE_FIELDS.filter((field) =>
  field.startsWith('image_') || field.startsWith('video_') || field.startsWith('audio_')
);

const SUPPLEMENT_DERIVED_FIELDS = new Set(['translations']);

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

// 認可後に取得した現在値へ指定された項目だけを重ね、検証・保存用の状態を作る。
// HTTP入力を変換する側ではDBを参照せず、項目が指定されたかどうかを保持して渡す。
function mergeTimelinePatch(current, patch, fields = TIMELINE_MUTABLE_FIELDS) {
  return fields.reduce((result, field) => {
    const next = hasOwn(patch || {}, field) && patch[field] !== undefined
      ? patch[field]
      : current?.[field];
    result[field] = next ?? null;
    return result;
  }, {});
}

const hasDefinedOwn = (value, key) => hasOwn(value || {}, key) && value[key] !== undefined;

const snapshotValue = (value) => value ?? null;

// メディアの検証に使った現在値を更新条件に含め、検証後に別の変更が入った場合は更新を拒否する。
function buildMediaSnapshotMatch(current, patch) {
  if (!TIMELINE_MEDIA_FIELDS.some((field) => hasDefinedOwn(patch, field))) return {};
  return buildMediaStateMatch(current);
}

function buildMediaStateMatch(current) {
  return Object.fromEntries(
    TIMELINE_MEDIA_FIELDS.map((field) => [field, snapshotValue(current?.[field])])
  );
}

// 付加情報の指定項目だけを更新するため、対象パス配下の$setと現在値の一致条件を作る。
// 本文の変更時は元の言語も、メディアの変更時は組み合わせの検証に使った全ファイル項目も一致条件に含める。
// 別処理が更新するリアクションや翻訳は、明示的に指定した派生項目を除いて変更しない。
function buildSupplementMutation({ current, patch, updated, targetPath, derivedFields = [] }) {
  const requestedFields = SUPPLEMENT_MUTABLE_FIELDS.filter((field) => hasDefinedOwn(patch, field));
  const invalidDerivedField = derivedFields.find((field) => !SUPPLEMENT_DERIVED_FIELDS.has(field));
  if (invalidDerivedField) throw new TypeError(`Unsupported derived supplement field: ${invalidDerivedField}`);

  const set = {
    [`${targetPath}.updated_at`]: updated.updated_at,
  };
  for (const field of [...requestedFields, ...derivedFields]) {
    set[`${targetPath}.${field}`] = updated[field];
  }

  const snapshotFields = new Set(requestedFields);
  if (requestedFields.includes('content')) snapshotFields.add('lang');
  if (requestedFields.some((field) => SUPPLEMENT_MEDIA_FIELDS.includes(field))) {
    for (const field of SUPPLEMENT_MEDIA_VALIDATION_FIELDS) snapshotFields.add(field);
  }

  const snapshotMatch = {};
  for (const field of snapshotFields) snapshotMatch[field] = snapshotValue(current?.[field]);

  return {
    requestedFields,
    set,
    snapshotMatch,
  };
}

module.exports = {
  SUPPLEMENT_MUTABLE_FIELDS,
  TIMELINE_MUTABLE_FIELDS,
  buildMediaSnapshotMatch,
  buildMediaStateMatch,
  buildSupplementMutation,
  mergeTimelinePatch,
};
