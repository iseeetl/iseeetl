const SPECIAL_FILTER_KEYS = ['notags', 'animation', 'fav'];
const SPECIAL_FILTER_TRANSLATION_KEYS = Object.freeze({
  notags: 'タグ無し',
  animation: '流す',
  fav: 'お気に入り',
});

export const isSpecialFilterKey = (key) => SPECIAL_FILTER_KEYS.includes(key);
export const getSpecialFilterTranslationKey = (key) => SPECIAL_FILTER_TRANSLATION_KEYS[key] || '';

export const getFilterModeLabel = (conditions, t) => {
  if (!conditions) return '';
  return conditions.filterMode === 'exclude' ? t('表示しない') : t('表示する');
};

const getConditionTagText = (item, getTranslatedTagName, t) => {
  if (!item || !item.key) return '';
  if (isSpecialFilterKey(item.key)) {
    const translationKey = getSpecialFilterTranslationKey(item.key);
    return translationKey ? t(translationKey) : '';
  }
  return `#${getTranslatedTagName(item.key)}`;
};

export const buildFilterSummaryText = ({ filter, localTagIds = [], getTranslatedTagName, t }) => {
  if (!filter || !filter.conditions) {
    const parts = [t('タイムライン')];
    if (Array.isArray(localTagIds) && localTagIds.length) {
      const tags = localTagIds.map((id) => `#${getTranslatedTagName(id)}`).join(' ');
      parts.push(tags);
    }
    return parts.join(' ').trim();
  }

  const conditions = filter.conditions;
  const parts = [getFilterModeLabel(conditions, t)];
  if (conditions.keyword) parts.push(conditions.keyword);
  if (conditions.userName) parts.push(conditions.userName);

  if (Array.isArray(conditions.displayOrder)) {
    conditions.displayOrder.forEach((item) => {
      const text = getConditionTagText(item, getTranslatedTagName, t);
      if (text) parts.push(text);
    });
  }

  return parts.join(' ').trim();
};
