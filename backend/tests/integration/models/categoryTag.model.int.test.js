const mongoose = require('mongoose');
const CategoryTag = require('../../../models/CategoryTag');

describe('共通タグモデルの保存制約', () => {
  const userId = new mongoose.Types.ObjectId();

  test('必須項目で保存し、削除状態と作成・更新・削除日時に既定値を設定する', async () => {
    const doc = await CategoryTag.create({
      user: userId,
      order: 10,
      name: 'tag-1',
    });

    expect(doc._id).toBeDefined();
    expect(doc.user.toString()).toBe(userId.toString());
    expect(doc.order).toBe(10);
    expect(doc.name).toBe('tag-1');

    expect(doc.delete_flg).toBe(false);
    expect(doc.created_at).toBeInstanceOf(Date);
    expect(doc.updated_at).toBeNull();
    expect(doc.deleted_at).toBeNull();
  });

  test('ユーザが未指定なら保存を拒否する', async () => {
    await expect(CategoryTag.create({ order: 1, name: 'x' })).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
  });

  test('表示順が未指定なら保存を拒否する', async () => {
    await expect(CategoryTag.create({ user: userId, name: 'x' })).rejects.toBeInstanceOf(
      mongoose.Error.ValidationError
    );
  });

  test('名前が未指定なら保存を拒否する', async () => {
    await expect(CategoryTag.create({ user: userId, order: 1 })).rejects.toBeInstanceOf(mongoose.Error.ValidationError);
  });

  test('表示順が1または100なら保存できる', async () => {
    await expect(CategoryTag.create({ user: userId, order: 1, name: 'min' })).resolves.toBeTruthy();

    await expect(CategoryTag.create({ user: userId, order: 100, name: 'max' })).resolves.toBeTruthy();
  });

  test('表示順が1未満ならValidationErrorにする', async () => {
    await expect(CategoryTag.create({ user: userId, order: 0, name: 'bad' })).rejects.toBeInstanceOf(
      mongoose.Error.ValidationError
    );

    await expect(CategoryTag.create({ user: userId, order: -5, name: 'bad' })).rejects.toBeInstanceOf(
      mongoose.Error.ValidationError
    );
  });

  test('表示順が100を超えた場合はValidationErrorにする', async () => {
    await expect(CategoryTag.create({ user: userId, order: 101, name: 'bad' })).rejects.toBeInstanceOf(
      mongoose.Error.ValidationError
    );
  });

  test('updated_atに更新日時を設定できる', async () => {
    const doc = await CategoryTag.create({ user: userId, order: 5, name: 'to-update' });
    expect(doc.updated_at).toBeNull();

    const now = new Date();
    doc.updated_at = now;
    await doc.save();

    const reloaded = await CategoryTag.findById(doc._id);
    expect(reloaded.updated_at).toBeInstanceOf(Date);
    expect(reloaded.updated_at.getTime()).toBe(now.getTime());
  });

  test('ページ・取得件数・並べ替えを指定し、総数とページ数を取得できる', async () => {
    const base = [];
    for (let i = 1; i <= 23; i++) {
      base.push({ user: userId, order: i, name: `t-${i}` });
    }
    await CategoryTag.insertMany(base);

    const page1 = await CategoryTag.paginate({}, { page: 1, limit: 10, sort: { order: 1 } });
    expect(page1.docs.length).toBe(10);
    expect(page1.totalDocs ?? page1.total).toBe(23);
    expect(page1.totalPages ?? page1.pages).toBe(3);
    expect(page1.page).toBe(1);

    expect(page1.docs[0].order).toBeLessThan(page1.docs[9].order);

    const page3 = await CategoryTag.paginate({}, { page: 3, limit: 10, sort: { order: 1 } });
    expect(page3.docs.length).toBe(3);
    expect(page3.page).toBe(3);
  });
});
