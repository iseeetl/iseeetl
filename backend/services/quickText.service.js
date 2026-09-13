const { deleteQuickTextGroup } = require('./_shared/quickTextDeletion');
const AppError = require('../utils/appError');

const QuickTextGroup = require('../models/QuickTextGroup');
const QuickTextItem = require('../models/QuickTextItem');
const { requireAdminUser } = require('./_shared/memberHelpers');

async function ensureAdmin(jwtPayload) {
  const userId = jwtPayload && jwtPayload.user_id;
  if (!userId) throw new AppError({ code: 'INVALID_PERMISSION' });
  return requireAdminUser(userId);
}

exports.listAllGroups = async ({ jwtPayload }) => {
  await ensureAdmin(jwtPayload);
  return QuickTextGroup.find({}).sort({ order: 1, created_at: 1, _id: 1 }).lean();
};

exports.paginateGroups = async ({ page = 1, jwtPayload }) => {
  await ensureAdmin(jwtPayload);

  const options = {
    page,
    limit: 10,
    sort: { order: 1, created_at: 1, _id: 1 },
    lean: true,
  };

  if (typeof QuickTextGroup.paginate === 'function') {
    return QuickTextGroup.paginate({}, options);
  }

  const [docs, total] = await Promise.all([
    QuickTextGroup.find({})
      .sort(options.sort)
      .skip((page - 1) * options.limit)
      .limit(options.limit)
      .lean(),
    QuickTextGroup.countDocuments({}),
  ]);

  const pages = Math.max(1, Math.ceil(total / options.limit));
  return {
    total,
    pages,
    docs,
    page,
    nextPage: page < pages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
    pagingCounter: (page - 1) * options.limit + 1,
    hasPrevPage: page > 1,
    hasNextPage: page < pages,
  };
};

exports.createGroup = async ({ title, lang, jwtPayload }) => {
  const admin = await ensureAdmin(jwtPayload);
  const last = await QuickTextGroup.findOne({}).sort({ order: -1 }).select('order').lean();
  const nextOrder = (last?.order || 0) + 1;
  const created = await QuickTextGroup.create({ user: admin._id, order: nextOrder, title, lang });
  return created;
};

exports.updateGroup = async ({ id, order, title, lang, jwtPayload }) => {
  await ensureAdmin(jwtPayload);

  const updateData = {};
  if (typeof order !== 'undefined') updateData.order = order;
  if (typeof title !== 'undefined') updateData.title = title;
  if (typeof lang !== 'undefined') updateData.lang = lang;

  const updated = await QuickTextGroup.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new AppError({ code: 'NOT_FOUND' });
  return updated;
};

// 単語グループの削除では、配下の単語も物理削除する。
exports.deleteGroup = async ({ id, jwtPayload }) => {
  await ensureAdmin(jwtPayload);

  return deleteQuickTextGroup({ groupModel: QuickTextGroup,
    itemModel: QuickTextItem, filter: { _id: id } });
};

exports.listItems = async ({ groupId, jwtPayload }) => {
  await ensureAdmin(jwtPayload);
  if (!await QuickTextGroup.exists({ _id: groupId })) throw new AppError({ code: 'NOT_FOUND' });
  return QuickTextItem.find({ group: groupId }).sort({ order: 1, created_at: 1, _id: 1 }).lean();
};

exports.createItem = async ({ groupId, label, lang, jwtPayload }) => {
  await ensureAdmin(jwtPayload);

  const exists = await QuickTextGroup.exists({ _id: groupId });
  if (!exists) throw new AppError({ code: 'INVALID_PARAMS' });

  const last = await QuickTextItem.findOne({ group: groupId }).sort({ order: -1 }).select('order').lean();
  const nextOrder = (last?.order || 0) + 1;
  const created = await QuickTextItem.create({ group: groupId, order: nextOrder, label, lang });
  if (!await QuickTextGroup.exists({ _id: groupId })) {
    await QuickTextItem.deleteOne({ _id: created._id });
    throw new AppError({ code: 'NOT_FOUND' });
  }
  return created;
};

exports.updateItem = async ({ id, order, label, lang, jwtPayload }) => {
  await ensureAdmin(jwtPayload);

  const updateData = {};
  if (typeof order !== 'undefined') updateData.order = order;
  if (typeof label !== 'undefined') updateData.label = label;
  if (typeof lang !== 'undefined') updateData.lang = lang;

  const updated = await QuickTextItem.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new AppError({ code: 'NOT_FOUND' });
  return updated;
};

exports.deleteItem = async ({ id, jwtPayload }) => {
  await ensureAdmin(jwtPayload);

  const deleted = await QuickTextItem.findByIdAndDelete(id);
  if (!deleted) throw new AppError({ code: 'NOT_FOUND' });
  return { ok: true, deletedItemId: String(id) };
};
