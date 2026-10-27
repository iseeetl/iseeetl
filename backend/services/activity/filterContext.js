const Chat = require('../../models/Chat');
const { normalizeContext } = require('./preferences');
const { applyNormalizedServerQueryFilters } = require('../timeline/shared/serverQuery');
async function contextClauses(context) {
  const checked = normalizeContext(context || { globalQuery: null, columns: [] });
  const clauses = [];
  if (checked.globalQuery) await applyNormalizedServerQueryFilters(checked.globalQuery, clauses);
  const columns = [];
  for (const column of checked.columns) {
    const parts = []; if (column) await applyNormalizedServerQueryFilters(column, parts);
    columns.push(parts.length ? { $and: parts } : {});
  }
  if (columns.length) clauses.push({ $or: columns });
  return clauses;
}
async function contextMatches(event, context) {
  const clauses = await contextClauses(context);
  return !clauses.length || !!await Chat.exists({ _id: event.root_post_id, room: event.room_id, delete_flg: false, $and: clauses });
}
module.exports = { contextClauses, contextMatches };
