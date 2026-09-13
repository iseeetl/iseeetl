const mongoose = require('mongoose');
const CategoryTag = require('../../../models/CategoryTag');
const categoryTagService = require('../../../services/categoryTag.service');

describe('共通タグサービスの結合動作', () => {
  const userId = new mongoose.Types.ObjectId();

  describe('共通タグの一覧取得', () => {
    test('delete_flg=false のみ返る', async () => {
      await CategoryTag.create([
        { user: userId, order: 1, name: 'alive-1', delete_flg: false },
        { user: userId, order: 2, name: 'deleted-1', delete_flg: true },
        { user: userId, order: 3, name: 'alive-2', delete_flg: false },
      ]);

      const res = await categoryTagService.list();
      const names = res.map((d) => d.name);
      expect(names).toEqual(expect.arrayContaining(['alive-1', 'alive-2']));
      expect(names).not.toEqual(expect.arrayContaining(['deleted-1']));
    });
  });

  describe('共通タグのページ指定取得', () => {
    beforeEach(async () => {
      await CategoryTag.create([
        { user: userId, order: 1, name: 'alpha' },
        { user: userId, order: 2, name: 'a+b' },
        { user: userId, order: 3, name: 'ab' },
        { user: userId, order: 4, name: 'beta' },
        { user: userId, order: 5, name: 'omega' },
      ]);
    });

    test('検索語なしで1ページ目を取得し、docs・page・pages・totalを返す', async () => {
      const res = await categoryTagService.paginate({ page: 1 });
      expect(res).toHaveProperty('docs');
      expect(res).toHaveProperty('page', 1);
      expect(res).toHaveProperty('pages');
      expect(res).toHaveProperty('total');
      expect(res.docs[0].order).toBeLessThanOrEqual(res.docs[res.docs.length - 1].order);
    });

    test('検索: 正規表現メタ文字をリテラルとして扱う', async () => {
      const res = await categoryTagService.paginate({ page: 1, search: 'a+b' });
      const names = res.docs.map((d) => d.name);
      expect(names).toEqual(expect.arrayContaining(['a+b']));
      expect(names).not.toContain('ab');
    });
  });

  describe('共通タグの作成', () => {
    test('処理済みの名前を使って共通タグを作成できる', async () => {
      const created = await categoryTagService.create({ order: 10, name: '  New ' }, userId.toHexString());
      expect(created).toBeTruthy();
      expect(created.order).toBe(10);
      expect(created.name).toBe('  New ');
      expect(created.user.toString()).toBe(userId.toString());
    });
  });

  describe('共通タグの更新', () => {
    test('通常更新後に物理削除でき、削除したIDは更新できない', async () => {
      const doc = await CategoryTag.create({ user: userId, order: 5, name: 'to-update', delete_flg: false });
      const upd = await categoryTagService.update({ _id: doc._id, order: 6, name: 'updated', delete_flg: false });
      expect(upd).toBeTruthy();
      expect(upd.order).toBe(6);
      expect(upd.name).toBe('updated');
      expect(upd.delete_flg).toBe(false);
      expect(upd.updated_at).toBeInstanceOf(Date);
      expect(upd.deleted_at).toBeNull();

      const deleted = await categoryTagService.delete({ _id: doc._id });
      expect(deleted).toEqual({ _id: doc._id });
      expect(await CategoryTag.findById(doc._id)).toBeNull();
      await expect(categoryTagService.update({ _id: doc._id, order: 1, name: 'Missing' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('共通タグのCSV取込', () => {
    test('有効タグをCSVへ同期し、旧削除済みタグを復元せずCSV外タグを物理削除する', async () => {
      const [reusableTag, staleTag] = await CategoryTag.create([
        {
          user: userId,
          order: 98,
          name: 'One',
          delete_flg: true,
          deleted_at: new Date(),
        },
        { user: userId, order: 99, name: 'old' },
      ]);
      const csv = [
        [1, 'One'],
        [2, 'Two'],
        [3, 'Three'],
      ];
      const created = await categoryTagService.import({ csv }, userId.toHexString());
      expect(Array.isArray(created)).toBe(true);
      expect(created).toHaveLength(3);
      expect(await CategoryTag.countDocuments({ delete_flg: false })).toBe(3);
      const names = (await CategoryTag.find({ delete_flg: false }).sort({ order: 1 })).map((d) => d.name);
      expect(names).toEqual(['One', 'Two', 'Three']);

      const revivedTag = await CategoryTag.findOne({ name: 'One', delete_flg: false });
      expect(revivedTag._id.toString()).not.toBe(reusableTag._id.toString());
      expect((await CategoryTag.findById(reusableTag._id)).delete_flg).toBe(true);
      expect(revivedTag.order).toBe(1);
      expect(revivedTag.delete_flg).toBe(false);
      expect(revivedTag.deleted_at).toBeNull();

      const deletedStaleTag = await CategoryTag.findById(staleTag._id);
      expect(deletedStaleTag).toBeNull();
    });
  });
});
