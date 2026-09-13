const { deleteQuickTextGroup } = require('../../../../services/_shared/quickTextDeletion');
let Group, Item, options;
beforeEach(() => {
  Group = { findOne: jest.fn().mockResolvedValue({ _id: 'g' }), findOneAndDelete: jest.fn().mockResolvedValue({ _id: 'g' }) };
  Item = { deleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }) };
  options = { groupModel: Group, itemModel: Item, filter: { _id: 'g', floor: 'f', room: 'r' } };
});
test('存在・所属を確認できなければ配下を削除しない', async () => {
  Group.findOne.mockResolvedValue(null);
  await expect(deleteQuickTextGroup(options)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(Group.findOne).toHaveBeenCalledWith(options.filter);
  expect(Item.deleteMany).not.toHaveBeenCalled();
  expect(Group.findOneAndDelete).not.toHaveBeenCalled();
});
test('配下削除失敗では親を残してエラーを返す', async () => {
  Item.deleteMany.mockRejectedValueOnce(new Error('item delete failed'));
  await expect(deleteQuickTextGroup(options)).rejects.toThrow('item delete failed');
  expect(Group.findOneAndDelete).not.toHaveBeenCalled();
});
test('親削除失敗を成功にせず、同じ対象で再試行できる', async () => {
  Group.findOneAndDelete.mockRejectedValueOnce(new Error('group delete failed'));
  await expect(deleteQuickTextGroup(options)).rejects.toThrow('group delete failed');
  await expect(deleteQuickTextGroup(options)).resolves.toEqual({ ok: true, deletedGroupId: 'g' });
  expect(Item.deleteMany).toHaveBeenCalledWith({ floor: 'f', room: 'r', group: 'g' });
  expect(Group.findOneAndDelete).toHaveBeenCalledWith(options.filter);
});
test('配下の削除完了を待ってから親を削除する', async () => {
  let resolveItems;
  Item.deleteMany.mockReturnValue(new Promise((resolve) => { resolveItems = resolve; }));
  const deletion = deleteQuickTextGroup(options);
  await Promise.resolve();
  expect(Group.findOneAndDelete).not.toHaveBeenCalled();
  resolveItems({ deletedCount: 1 });
  await expect(deletion).resolves.toMatchObject({ ok: true });
  expect(Group.findOneAndDelete).toHaveBeenCalledTimes(1);
});
