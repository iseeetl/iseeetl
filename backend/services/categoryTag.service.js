const { escapeRegExp } = require('../utils/regex');
const { buildPaginationOptions } = require('./_shared/paginationHelpers');
const AppError = require('../utils/appError');
const {
  assertUniqueTagNames,
  reconcileTagsByName,
  deleteTag,
} = require('./_shared/tagServiceHelpers');

const CategoryTag = require('../models/CategoryTag');
const {
  withAIAnalysisIntegrityLock,
} = require('./analysis/settings/referenceIntegrity');

exports.list = async () => {
  return await CategoryTag.find({ delete_flg: false });
};

exports.paginate = async (body) => {
  const { page, search } = body;

  const query = { delete_flg: false };
  if (search) {
    query.name = { $regex: escapeRegExp(search), $options: 'i' };
  }

  const options = buildPaginationOptions({
    page,
    sort: { order: 'asc' },
  });

  return await CategoryTag.paginate(query, options);
};

exports.create = async (body, userId) => {
  const order = body.order;
  const name = body.name;

  const createdCategoryTag = await CategoryTag.create({
    user: userId,
    order,
    name,
  });
  return createdCategoryTag;
};

exports.update = async (body) => {
  const id = body._id;
  const order = body.order;
  const name = body.name;

  return withAIAnalysisIntegrityLock(async () => {
    const currentTag = await CategoryTag.findOne({ _id: id, delete_flg: false });
    if (!currentTag) throw new AppError({ code: 'NOT_FOUND' });
    const updateData = {
      order,
      name,
      updated_at: Date.now(),
    };
    const updatedTag = await CategoryTag.findOneAndUpdate(
      { _id: id, delete_flg: false },
      updateData,
      { new: true, runValidators: true }
    );
    if (!updatedTag) {
      const latestTag = await CategoryTag.findOne({ _id: id, delete_flg: false });
      throw new AppError({ code: latestTag ? 'CONFLICT' : 'NOT_FOUND' });
    }
    return updatedTag;
  });
};

exports.delete = async (body) =>
  deleteTag({
    Model: CategoryTag,
    id: body._id,
  });

exports.import = async (body, userId) => {
  const csv = body.csv.map((row) => [row[0], String(row[1] ?? '').trim()]);

  const newTags = csv.map(([order, name]) => ({
    user: userId,
    order,
    name,
  }));
  assertUniqueTagNames(newTags);

  await reconcileTagsByName({
    Model: CategoryTag,
    userId,
    tags: newTags,
  });

  return CategoryTag.find({ delete_flg: false })
    .sort({ order: 1, created_at: -1 })
    .lean();
};
