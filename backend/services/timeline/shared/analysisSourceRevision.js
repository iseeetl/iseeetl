const ANALYSIS_SOURCE_FIELDS = [
  'content',
  'lang',
  'room_tags',
  'image_name',
  'video_name',
  'audio_name',
];

const normalizeScalar = (value) => (value === undefined || value === null ? null : value);

const normalizeId = (value) => {
  const candidate = value && typeof value === 'object' && value._id != null ? value._id : value;
  return candidate === undefined || candidate === null ? null : String(candidate);
};

const normalizeTagSet = (values) =>
  Array.from(new Set((Array.isArray(values) ? values : []).map(normalizeId).filter(Boolean))).sort();

const areRoomTagSetsEqual = (left, right) => {
  const normalizedLeft = normalizeTagSet(left);
  const normalizedRight = normalizeTagSet(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
};

const hasAnalysisSourceChanged = (current = {}, next = {}) =>
  ANALYSIS_SOURCE_FIELDS.some((field) => {
    if (field === 'room_tags') return !areRoomTagSetsEqual(current[field], next[field]);
    return normalizeScalar(current[field]) !== normalizeScalar(next[field]);
  });

const readAnalysisSourceRevision = (source) => {
  const revision = source?.analysis_source_revision;
  if (revision === undefined) return 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError('Invalid analysis source revision');
  }
  return revision;
};

const buildRevisionValueGuard = (path = 'analysis_source_revision') => ({
  $or: [
    { [path]: { $exists: false } },
    { [path]: { $type: 'number', $gte: 0, $lt: Number.MAX_SAFE_INTEGER, $mod: [1, 0] } },
  ],
});

const buildRevisionGuard = (path = 'analysis_source_revision') => buildRevisionValueGuard(path);

const buildNestedRevisionGuard = (prefix) => ({
  $or: [
    { [`${prefix}.analysis_source_revision`]: { $exists: false } },
    {
      [`${prefix}.analysis_source_revision`]: {
        $type: 'number',
        $gte: 0,
        $lt: Number.MAX_SAFE_INTEGER,
        $mod: [1, 0],
      },
    },
  ],
});

module.exports = {
  ANALYSIS_SOURCE_FIELDS,
  areRoomTagSetsEqual,
  buildNestedRevisionGuard,
  buildRevisionGuard,
  buildRevisionValueGuard,
  hasAnalysisSourceChanged,
  readAnalysisSourceRevision,
};
