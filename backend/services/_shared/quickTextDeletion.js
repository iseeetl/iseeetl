const AppError = require('../../utils/appError');

async function deleteQuickTextGroup({ groupModel, itemModel, filter }) {
  const group = await groupModel.findOne(filter);
  if (!group) throw new AppError({ code: 'NOT_FOUND' });

  // 配下削除の途中で失敗しても、一覧に残るグループから再試行できる。
  const { _id, ...scope } = filter;
  await itemModel.deleteMany({ ...scope, group: _id });
  await groupModel.findOneAndDelete(filter);
  return { ok: true, deletedGroupId: String(_id) };
}

module.exports = { deleteQuickTextGroup };
