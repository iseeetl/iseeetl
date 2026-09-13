const isAtomicObject = (value) =>
  value instanceof Date ||
  Buffer.isBuffer(value) ||
  value instanceof RegExp ||
  (value && typeof value === 'object' && typeof value._bsontype === 'string');

const cloneValue = (value) => {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (typeof value.toObject === 'function') {
    return cloneValue(value.toObject({ depopulate: false, flattenMaps: true }));
  }
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isAtomicObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
};

const serializeSupplement = (supplement) => {
  const result = cloneValue(supplement);
  if (!result || typeof result !== 'object') return result;
  delete result.meta;
  return result;
};

const serializeReply = (reply, { preserveDeleted = false } = {}) => {
  const result = cloneValue(reply);
  if (!result || typeof result !== 'object') return result;
  delete result.analysis_source_revision;
  if (Array.isArray(result.supplementaries)) {
    result.supplementaries = result.supplementaries
      .filter((supplement) => preserveDeleted || !supplement?.delete_flg)
      .map(serializeSupplement);
  }
  return result;
};

const serializeTimelinePost = (data, { preserveDeleted = false } = {}) => {
  const result = cloneValue(data);
  if (!result || typeof result !== 'object') return result;

  delete result.analysis_source_revision;
  if (Array.isArray(result.replies)) {
    result.replies = result.replies
      .filter((reply) => preserveDeleted || !reply?.delete_flg)
      .map((reply) => serializeReply(reply, { preserveDeleted }));
  }
  if (Array.isArray(result.supplementaries)) {
    result.supplementaries = result.supplementaries
      .filter((supplement) => preserveDeleted || !supplement?.delete_flg)
      .map(serializeSupplement);
  }
  return result;
};

const serializeTimeline = (data) =>
  Array.isArray(data) ? data.map(serializeTimelinePost) : serializeTimelinePost(data);

const serializeTimelineForPublic = (data, options = {}) =>
  Array.isArray(data)
    ? data.map((entry) => serializeTimelinePost(entry, options))
    : serializeTimelinePost(data, options);

module.exports = serializeTimeline;
module.exports.cloneValue = cloneValue;
module.exports.serializeSupplement = serializeSupplement;
module.exports.serializeTimelineForPublic = serializeTimelineForPublic;
module.exports.serializeTimelinePost = serializeTimelinePost;
