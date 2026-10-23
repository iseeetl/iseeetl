// Column presentation and composition options are not search conditions.
export const normalizePostTagMode = (value) => value === 'empty' ? 'empty' : 'auto';
export const availableTagIds = (ids, tags) => [...new Set((ids || []).filter(id => tags.some(tag => tag._id === id)))];
export const initialPostTags = ({ mode = 'auto', column = [], previous = [], continuation = null, tags = [] } = {}) => {
  if (continuation) {
    const ids = availableTagIds(continuation.tags, tags);
    return { tags: ids, source: ids.length === continuation.tags.length ? continuation.source : null };
  }
  if (mode === 'empty') return { tags: [], source: 'clear' };
  const columnIds = availableTagIds(column, tags);
  if (columnIds.length) return { tags: columnIds, source: 'tab' };
  const previousIds = availableTagIds(previous, tags);
  return { tags: previousIds, source: previousIds.length ? 'previous' : 'clear' };
};
export const parseColumnOptions = (query = {}) => {
  const warnings = [];
  const read = (key, allowed, fallback) => {
    if (!(key in query)) return fallback;
    const value = typeof query[key] === 'string' ? query[key].trim() : null;
    if (!allowed.includes(value)) { warnings.push(key); return fallback; }
    return value;
  };
  const initialTab = read('initialTab', ['first', ...Array.from({ length: 10 }, (_, i) => `col${i + 1}`)], 'first');
  const modes = {};
  Object.keys(query).filter(key => /^col\d+_postTagMode$/.test(key)).forEach(key => {
    const number = Number(key.match(/^col(\d+)/)[1]);
    if (number < 1 || number > 10) { warnings.push(key); return; }
    modes[number] = read(key, ['auto', 'empty'], 'auto');
  });
  return { initialTab, modes, warnings };
};
export const columnOptionsSignature = (query = {}) => JSON.stringify(Object.keys(query)
  .filter(key => key === 'initialTab' || /^col\d+_postTagMode$/.test(key)).sort().map(key => [key, query[key]]));
export const columnIdentity = (filter) => filter?.queryColumnNumber ? `query:${filter.queryColumnNumber}`
  : filter?.id || filter?.pushFilterId || JSON.stringify(filter?.conditions ?? null);
export const initialColumnIndex = (filters, initialTab, detail = false) => {
  if (detail) return Math.max(0, filters.findIndex(filter => !filter.conditions));
  if (initialTab === 'first') return 0;
  return filters.findIndex(filter => filter.queryColumnNumber === Number(initialTab.slice(3)));
};
