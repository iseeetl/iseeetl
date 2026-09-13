const MAX_QUERY_COLUMNS = 10;
const MAX_QUERY_TAGS = 100;

const QUERY_FIELDS = new Set([
  'keyword',
  'logicalOperator',
  'tag',
  'tagOperator',
  'userName',
  'noTags',
  'animation',
  'filterMode',
  'showRange',
]);

const addWarning = (warnings, code) => {
  if (!warnings.includes(code)) warnings.push(code);
};

const getSingleString = (value, warnings, { maxLength = null } = {}) => {
  if (typeof value === 'undefined' || value === null) return null;
  if (Array.isArray(value) || typeof value !== 'string') {
    addWarning(warnings, 'invalid_value');
    return null;
  }

  const normalized = value.trim();
  if (!normalized) return null;
  if (maxLength !== null && normalized.length > maxLength) {
    addWarning(warnings, 'invalid_value');
    return null;
  }
  return normalized;
};

const getEnum = (value, allowed, fallback, warnings) => {
  if (typeof value === 'undefined' || value === null || value === '') return fallback;
  if (Array.isArray(value) || typeof value !== 'string' || !allowed.includes(value)) {
    addWarning(warnings, 'invalid_value');
    return fallback;
  }
  return value;
};

const getBoolean = (value, fallback, warnings) => {
  if (typeof value === 'undefined' || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  addWarning(warnings, 'invalid_value');
  return fallback;
};

export const splitFilterKeyword = (keyword) => {
  if (!keyword) return [];
  const parts = keyword.match(/[^\s"]+|"([^"]*)"/g);
  if (!parts) return [];
  return parts.map((item) => item.replace(/^"(.*)"$/, '$1')).filter(Boolean);
};

const findRoomTagByNameOrTranslation = (roomTags, tagText) =>
  roomTags.find((tag) => {
    if (tag?.name === tagText) return true;
    return Array.isArray(tag?.translations) && tag.translations.some((translation) => translation?.name === tagText);
  }) || null;

const resolveTagConditions = (value, roomTags, warnings) => {
  const raw = getSingleString(value, warnings);
  if (!raw) return [];

  const resolved = [];
  raw
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .forEach((name) => {
      const tag = findRoomTagByNameOrTranslation(roomTags, name);
      if (!tag?._id) {
        addWarning(warnings, 'unknown_tag');
        return;
      }
      if (resolved.some((item) => item.id === tag._id)) return;

      if (resolved.length >= MAX_QUERY_TAGS) {
        addWarning(warnings, 'invalid_value');
        return;
      }

      resolved.push({ id: tag._id, display: tag.name || name });
    });

  return resolved;
};

const buildConditionGroup = ({ values = {}, roomTags = [], warnings = [], isGlobal = false } = {}) => {
  const keyword = getSingleString(values.keyword, warnings, { maxLength: 200 });
  const keywordArray = splitFilterKeyword(keyword);
  const userName = getSingleString(values.userName, warnings, { maxLength: 20 });
  const resolvedTags = resolveTagConditions(values.tag, roomTags, warnings);
  const noTags = getBoolean(values.noTags, false, warnings);
  const animation = getBoolean(values.animation, false, warnings);
  const logicalOperator = getEnum(values.logicalOperator, ['or', 'and'], 'or', warnings);
  const tagSearchOperator = getEnum(values.tagOperator, ['or', 'and'], 'or', warnings);
  const filterMode = getEnum(values.filterMode, ['include', 'exclude'], 'include', warnings);
  const showRange = getEnum(values.showRange, ['all', 'target'], isGlobal ? null : 'all', warnings);

  const hasConditions = Boolean(keywordArray.length || userName || resolvedTags.length || noTags || animation);
  if (!hasConditions) {
    return {
      conditions: null,
      showRange,
    };
  }

  const displayOrder = resolvedTags.map((tag) => ({ key: tag.id }));
  if (noTags) displayOrder.push({ key: 'notags' });
  if (animation) displayOrder.push({ key: 'animation' });

  return {
    conditions: {
      filterMode,
      ...(isGlobal ? {} : { showRange }),
      keyword,
      keywordArray,
      logicalOperator,
      tags: resolvedTags.map((tag) => tag.id),
      tagSearchOperator,
      noTags,
      animation,
      displayOrder,
      userName,
    },
    showRange,
  };
};

const collectQueryGroups = (query, warnings) => {
  const globalValues = {};
  const columnValues = new Map();
  let hasGlobalKeys = false;
  let hasColumnQueries = false;

  Object.keys(query || {}).forEach((key) => {
    if (QUERY_FIELDS.has(key)) {
      globalValues[key] = query[key];
      hasGlobalKeys = true;
      return;
    }

    const matched = key.match(/^col(\d+)_(.+)$/);
    if (!matched || !QUERY_FIELDS.has(matched[2])) return;

    const columnNumber = Number(matched[1]);
    if (!Number.isInteger(columnNumber) || columnNumber < 1 || columnNumber > MAX_QUERY_COLUMNS) {
      addWarning(warnings, 'column_out_of_range');
      return;
    }

    hasColumnQueries = true;
    if (!columnValues.has(columnNumber)) columnValues.set(columnNumber, {});
    columnValues.get(columnNumber)[matched[2]] = query[key];
  });

  return { globalValues, columnValues, hasGlobalKeys, hasColumnQueries };
};

const isTimelineFilterQueryKey = (key) => {
  if (QUERY_FIELDS.has(key)) return true;
  const matched = key.match(/^col\d+_(.+)$/);
  return !!matched && QUERY_FIELDS.has(matched[1]);
};

export const getTimelineFilterQuerySignature = (query = {}) =>
  JSON.stringify(
    Object.keys(query || {})
      .filter(isTimelineFilterQueryKey)
      .sort()
      .map((key) => [key, query[key]])
  );

export const createEmptyTimelineQueryState = () => ({
  active: false,
  hasColumnQueries: false,
  globalConditions: null,
  globalShowRange: null,
  filters: [],
  warnings: [],
});

export const parseTimelineQueryFilters = ({ query = {}, roomTags = [] } = {}) => {
  const warnings = [];
  const { globalValues, columnValues, hasGlobalKeys, hasColumnQueries } = collectQueryGroups(query, warnings);
  const globalGroup = buildConditionGroup({
    values: globalValues,
    roomTags,
    warnings,
    isGlobal: true,
  });

  const filters = [];
  [...columnValues.keys()]
    .sort((left, right) => left - right)
    .forEach((columnNumber) => {
      const group = buildConditionGroup({
        values: columnValues.get(columnNumber),
        roomTags,
        warnings,
      });
      if (!group.conditions) {
        addWarning(warnings, 'empty_condition');
        return;
      }
      filters.push({
        queryColumnNumber: columnNumber,
        pushFilterId: null,
        webPush: false,
        showUserIcon: true,
        speech: false,
        conditions: group.conditions,
        posts: [],
      });
    });

  if (hasColumnQueries && filters.length === 0) addWarning(warnings, 'no_valid_columns');

  return {
    active: hasGlobalKeys || hasColumnQueries,
    hasColumnQueries,
    globalConditions: globalGroup.conditions,
    globalShowRange: globalGroup.showRange,
    filters,
    warnings,
  };
};

export const getEffectiveShowRange = (globalShowRange, columnConditions) =>
  globalShowRange || columnConditions?.showRange || 'all';

export const matchesConditionGroups = ({ target, globalConditions = null, columnConditions = null, matcher } = {}) => {
  if (typeof matcher !== 'function') return true;
  const matchesGlobal = !globalConditions || matcher(target, globalConditions);
  const matchesColumn = !columnConditions || matcher(target, columnConditions);
  return matchesGlobal && matchesColumn;
};

const getPostConditionTargets = (post) => {
  const replies = Array.isArray(post?.replies) ? post.replies : [];
  const postSupplementaries = Array.isArray(post?.supplementaries) ? post.supplementaries : [];
  const replySupplementaries = replies.flatMap((reply) =>
    Array.isArray(reply?.supplementaries) ? reply.supplementaries : []
  );
  return {
    all: [post, ...replies, ...postSupplementaries, ...replySupplementaries].filter(Boolean),
    post: post ? [post] : [],
    postAndReplies: [post, ...replies].filter(Boolean),
  };
};

const buildPostConditionCriteria = (post, conditions) => {
  const targets = getPostConditionTargets(post);
  const criteria = [];
  const keywordArray = Array.isArray(conditions.keywordArray) ? conditions.keywordArray : [];

  if (keywordArray.length && conditions.logicalOperator === 'and') {
    keywordArray.forEach((keyword) => {
      criteria.push({
        targets: targets.all,
        conditions: { filterMode: 'include', keywordArray: [keyword], logicalOperator: 'or' },
      });
    });
  } else if (keywordArray.length) {
    criteria.push({
      targets: targets.all,
      conditions: { filterMode: 'include', keywordArray, logicalOperator: 'or' },
    });
  } else if (conditions.keyword) {
    criteria.push({
      targets: targets.all,
      conditions: { filterMode: 'include', keyword: conditions.keyword },
    });
  }

  if (conditions.userName) {
    criteria.push({
      targets: targets.all,
      conditions: { filterMode: 'include', userName: conditions.userName },
    });
  }
  if (Array.isArray(conditions.tags) && conditions.tags.length) {
    criteria.push({
      targets: targets.postAndReplies,
      conditions: {
        filterMode: 'include',
        tags: conditions.tags,
        tagSearchOperator: conditions.tagSearchOperator,
      },
    });
  }
  if (conditions.noTags) {
    criteria.push({ targets: targets.post, conditions: { filterMode: 'include', noTags: true } });
  }
  if (conditions.animation) {
    criteria.push({ targets: targets.post, conditions: { filterMode: 'include', animation: true } });
  }

  if (!criteria.length) {
    criteria.push({ targets: targets.all, conditions: { ...conditions, filterMode: 'include' } });
  }
  return criteria;
};

const matchesPostConditionGroup = (post, conditions, matcher) => {
  if (!conditions) return true;
  const isExclude = conditions.filterMode === 'exclude';
  const hasMatch = buildPostConditionCriteria(post, conditions).every((criterion) =>
    criterion.targets.some((target) => matcher(target, criterion.conditions))
  );
  return isExclude ? !hasMatch : hasMatch;
};

export const matchesPostConditionGroups = ({
  post,
  globalConditions = null,
  columnConditions = null,
  matcher,
} = {}) => {
  if (typeof matcher !== 'function') return true;
  return (
    matchesPostConditionGroup(post, globalConditions, matcher) &&
    matchesPostConditionGroup(post, columnConditions, matcher)
  );
};

export const toServerQuery = (conditions) => {
  if (!conditions) return null;
  const serverQuery = { ...conditions };
  delete serverQuery.showRange;
  delete serverQuery.displayOrder;
  return serverQuery;
};

export { MAX_QUERY_COLUMNS, MAX_QUERY_TAGS };
