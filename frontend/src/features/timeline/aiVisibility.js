export const AI_UNKNOWN_TAG = '__unknown__';
export const normalizeAIVisibility = (value) => ({
  mode: ['all', 'tags', 'none'].includes(value?.mode) ? value.mode : 'all',
  hiddenTagIds: Array.isArray(value?.hiddenTagIds)
    ? [...new Set(value.hiddenTagIds.filter((id) => typeof id === 'string' && id.length > 0))] : [],
});
export const sanitizeRoomAIVisibility = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id]) => /^[a-f0-9]{24}$/i.test(id))
    .map(([id, setting]) => [id, normalizeAIVisibility(setting)]));
};
export const isSupplementVisible = (supplement, displaySupplement, preference) => {
  if (displaySupplement === false) return false;
  if (!supplement?.ai_origin) return true;
  const { mode, hiddenTagIds } = normalizeAIVisibility(preference);
  if (mode === 'none') return false;
  return mode !== 'tags' || !hiddenTagIds.includes(supplement.ai_origin.tag_id || AI_UNKNOWN_TAG);
};
