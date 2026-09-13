const { escapeRegExp } = require('../../../utils/regex');
const User = require('../../../models/User');

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeQueryObject(sq) {
  if (!sq || typeof sq !== 'object') return null;
  const out = {};
  out.filterMode = sq.filterMode ?? sq.filter_mode ?? 'include';
  out.logicalOperator = sq.logicalOperator ?? sq.logical_operator ?? 'or';
  out.keywordArray = Array.isArray(sq.keywordArray ?? sq.keyword_array) ? sq.keywordArray ?? sq.keyword_array : [];
  out.keyword = typeof sq.keyword === 'string' ? sq.keyword : null;
  out.userName = sq.userName ?? sq.user_name ?? null;
  out.tags = Array.isArray(sq.tags) ? sq.tags : [];
  out.tagSearchOperator = sq.tagSearchOperator ?? sq.tag_search_operator ?? 'or';
  out.noTags = normalizeBoolean(sq.noTags ?? sq.no_tags);
  out.animation = normalizeBoolean(sq.animation);
  return out;
}

function normalizeServerQuery(raw) {
  return normalizeQueryObject(raw?.server_query ?? raw?.serverQuery ?? null);
}

function normalizeGlobalServerQuery(raw) {
  return normalizeQueryObject(raw?.globalServerQuery ?? raw?.global_server_query ?? null);
}

async function applyNormalizedServerQueryFilters(sq, andCond) {
  if (!sq) return null;

  const and = [];

  if (sq.keywordArray?.length) {
    const regs = sq.keywordArray.map((k) => new RegExp(escapeRegExp(k), 'i'));
    if (sq.logicalOperator === 'and') {
      and.push({
        $and: regs.map((r) => ({
          $or: [
            { content: { $regex: r } },
            { 'replies.content': { $regex: r } },
            { 'supplementaries.content': { $regex: r } },
            { 'replies.supplementaries.content': { $regex: r } },
          ],
        })),
      });
    } else {
      and.push({
        $or: [
          { content: { $in: regs } },
          { 'replies.content': { $in: regs } },
          { 'supplementaries.content': { $in: regs } },
          { 'replies.supplementaries.content': { $in: regs } },
        ],
      });
    }
  }

  if (sq.keyword && !sq.keywordArray?.length) {
    const r = new RegExp(escapeRegExp(sq.keyword), 'i');
    and.push({
      $or: [
        { content: { $regex: r } },
        { 'replies.content': { $regex: r } },
        { 'supplementaries.content': { $regex: r } },
        { 'replies.supplementaries.content': { $regex: r } },
      ],
    });
  }

  if (sq.userName) {
    const users = await User.find({ username: sq.userName, delete_flg: false }).select('_id').lean();
    const userIds = users.map((u) => u._id);

    const userIdOrs = userIds.length
      ? [
          { user: { $in: userIds } },
          { 'replies.user': { $in: userIds } },
          { 'supplementaries.user': { $in: userIds } },
          { 'replies.supplementaries.user': { $in: userIds } },
        ]
      : [];

    const guestNameOrs = [{ guest_name: sq.userName }, { 'replies.guest_name': sq.userName }];

    and.push({ $or: [...userIdOrs, ...guestNameOrs] });
  }

  if (sq.tags?.length) {
    const postTagsCond =
      sq.tagSearchOperator === 'and' ? { room_tags: { $all: sq.tags } } : { room_tags: { $in: sq.tags } };
    const replyTagsCond =
      sq.tagSearchOperator === 'and'
        ? { replies: { $elemMatch: { room_tags: { $all: sq.tags } } } }
        : { replies: { $elemMatch: { room_tags: { $in: sq.tags } } } };
    and.push({ $or: [postTagsCond, replyTagsCond] });
  }

  if (sq.noTags === true) {
    and.push({ $or: [{ room_tags: { $exists: false } }, { room_tags: { $size: 0 } }] });
  }

  if (sq.animation === true) {
    and.push({ animation: { $ne: null } });
  }

  if (and.length) {
    const includeCond = { $and: and };
    if (sq.filterMode === 'exclude') {
      andCond.push({ $nor: [includeCond] });
    } else {
      andCond.push(includeCond);
    }
  }

  return sq;
}

async function applyServerQueryFilters(body, andCond) {
  return applyNormalizedServerQueryFilters(normalizeServerQuery(body), andCond);
}

async function applyGlobalServerQueryFilters(body, andCond) {
  return applyNormalizedServerQueryFilters(normalizeGlobalServerQuery(body), andCond);
}

module.exports = {
  applyGlobalServerQueryFilters,
  applyNormalizedServerQueryFilters,
  applyServerQueryFilters,
  normalizeGlobalServerQuery,
  normalizeQueryObject,
  normalizeServerQuery,
};
