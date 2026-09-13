const DEFAULT_PANE_SIZE = 33;
const NON_PRESET_TAG_KEYS = new Set(['notags', 'animation', 'fav']);

const normalizePaneSize = (size) => {
  if (size && typeof size === 'object') {
    return typeof size.size === 'number' ? size.size : DEFAULT_PANE_SIZE;
  }
  return size;
};

const isEmptyFilterObject = (filter) => JSON.stringify(filter) === '{}';

export const normalizeFiltersFromStore = (rawFilters = []) =>
  rawFilters.map((filter) => {
    const copy = { ...filter };
    if (copy.size && typeof copy.size === 'object') {
      copy.size = normalizePaneSize(copy.size);
    }
    return copy;
  });

export const prepareFiltersForSession = (filters = []) =>
  filters
    .filter((filter) => !isEmptyFilterObject(filter))
    .map((filter) => {
      const rest = { ...filter };
      delete rest.posts;
      delete rest._sending;
      return { ...rest, posts: [] };
    });

export const sanitizeFiltersForStore = (filters = []) =>
  filters.map((filter) => {
    const size = normalizePaneSize(filter.size);
    return {
      id: filter.id || undefined,
      size: typeof size === 'number' ? size : undefined,
      conditions: typeof filter.conditions === 'undefined' ? null : filter.conditions,
      showUserIcon: typeof filter.showUserIcon === 'boolean' ? filter.showUserIcon : true,
      speech: !!filter.speech,
      webPush: !!filter.webPush,
      pushFilterId: filter.pushFilterId || null,
    };
  });

export const getConditionlessIndexes = (filters = []) => {
  const indexes = [];
  filters.forEach((filter, index) => {
    if (filter && filter.conditions === null) indexes.push(index);
  });
  return indexes;
};

export const getDefaultIndex = (filters = []) => filters.findIndex((filter) => filter && filter.conditions === null);

export const getPresetTagIdsFromFilter = (filter) => {
  const conditions = filter && filter.conditions;
  if (!conditions || conditions.filterMode === 'exclude' || !Array.isArray(conditions.displayOrder)) return [];

  return conditions.displayOrder
    .filter((condition) => condition && typeof condition.key === 'string' && !NON_PRESET_TAG_KEYS.has(condition.key))
    .map((condition) => condition.key);
};

export const getLatestReplyablePost = ({ filters = [], currentTabIndex = 0 } = {}) => {
  const defaultIndex = getDefaultIndex(filters);
  const targetIndex = defaultIndex !== -1 ? defaultIndex : currentTabIndex;
  const list = filters[targetIndex]?.posts || [];
  return list.find(
    (post) =>
      post && post.animation === null && !post.origin_id && !post.replyNotification && !post.reactionNotification
  );
};

export const ensurePostsArray = ({ filters = [], index } = {}) => {
  const filter = filters[index];
  if (!filter) return;
  if (!Array.isArray(filter.posts)) {
    filter.posts = [];
  }
};

export const insertNewToFiltersHead = ({ filters = [], post, matchesAny, ensurePostsArray } = {}) => {
  if (!post || typeof matchesAny !== 'function') return;
  filters.forEach((filter, index) => {
    if (!filter) return;
    if (!matchesAny(post, filter.conditions)) return;
    if (typeof ensurePostsArray === 'function') ensurePostsArray(index);
    const arr = filter.posts;
    if (!Array.isArray(arr)) return;
    const idx = arr.findIndex((p) => p._id === post._id);
    if (idx === -1) arr.unshift(post);
    else arr.splice(idx, 1, post);
  });
};

export const updateExistingInFilters = ({ filters = [], post, matchesAny } = {}) => {
  if (!post || typeof matchesAny !== 'function') return;
  filters.forEach((filter) => {
    const arr = filter?.posts;
    if (!Array.isArray(arr)) return;
    const idx = arr.findIndex((p) => p._id === post._id);
    if (idx === -1) return;
    if (matchesAny(post, filter.conditions)) {
      arr.splice(idx, 1, post);
    } else {
      arr.splice(idx, 1);
    }
  });
};

export const reconcilePostInFilters = ({ filters = [], post, matchesAny, ensurePostsArray } = {}) => {
  if (!post || typeof matchesAny !== 'function') return;
  filters.forEach((filter, index) => {
    if (!filter) return;

    const matched = matchesAny(post, filter.conditions);
    if (matched && !Array.isArray(filter.posts) && typeof ensurePostsArray === 'function') {
      ensurePostsArray(index);
    }

    const arr = filter.posts;
    if (!Array.isArray(arr)) return;
    const idx = arr.findIndex((item) => item._id === post._id);

    if (!matched) {
      if (idx !== -1) arr.splice(idx, 1);
      return;
    }

    if (idx === -1) arr.unshift(post);
    else arr.splice(idx, 1, post);
  });
};

export const removeFromFilters = ({ filters = [], postId } = {}) => {
  if (!postId) return;
  filters.forEach((filter) => {
    const arr = filter?.posts;
    if (!Array.isArray(arr)) return;
    const rm = arr.findIndex((p) => p._id === postId);
    if (rm !== -1) arr.splice(rm, 1);
  });
};
