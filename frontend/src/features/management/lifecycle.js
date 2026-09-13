const DELETE_FILTER_ACTIVE = 'active';
const DELETE_FILTER_DELETED = 'deleted';
const DELETE_FILTER_ALL = 'all';

const DELETE_FILTER_VALUES = new Set([
  DELETE_FILTER_ACTIVE,
  DELETE_FILTER_DELETED,
  DELETE_FILTER_ALL,
]);

const normalizeDeleteFilter = (value) =>
  DELETE_FILTER_VALUES.has(value) ? value : DELETE_FILTER_ALL;

const withDeleteFilter = (payload, filter) => {
  const nextPayload = { ...payload };
  const normalizedFilter = normalizeDeleteFilter(filter);
  if (normalizedFilter === DELETE_FILTER_ACTIVE) nextPayload.delete_flg = false;
  if (normalizedFilter === DELETE_FILTER_DELETED) nextPayload.delete_flg = true;
  return nextPayload;
};

export {
  DELETE_FILTER_ACTIVE,
  DELETE_FILTER_ALL,
  DELETE_FILTER_DELETED,
  normalizeDeleteFilter,
  withDeleteFilter,
};
