const mongoose = require('mongoose');
const Floor = require('../../../models/Floor');

describe('フロアモデルの保存制約', () => {
  const uid = () => new mongoose.Types.ObjectId();
  const tid = () => new mongoose.Types.ObjectId();

  beforeEach(async () => {
    await Floor.deleteMany({});
  });

  test('ユーザとタイトルを指定し、前後の空白を除いて既定値付きで保存する', async () => {
    const user = uid();
    const doc = await Floor.create({
      user,
      title: '  Hello Floor  ',
      description: '  desc  ',
      lang: '  en  ',
      image_name: '  IMG_001.png  ',
      target_langs: ['ja', 'fr'],
    });

    expect(doc._id).toBeDefined();
    expect(doc.user.toString()).toBe(user.toString());
    expect(doc.title).toBe('Hello Floor');
    expect(doc.description).toBe('desc');
    expect(doc.lang).toBe('en');
    expect(doc.image_name).toBe('IMG_001.png');
    expect(doc.target_langs).toEqual(['ja', 'fr']);

    expect(doc.created_at).toBeInstanceOf(Date);
    expect(doc.updated_at).toBeNull();
    expect(doc.deleted_at).toBeNull();
    expect(doc.floor_display_hidden).toBe(false);
    expect(doc.delete_flg).toBe(false);
    expect(doc.translations).toEqual([]);
  });

  test('ユーザが未指定なら保存を拒否する', async () => {
    await expect(Floor.create({ title: 'x' })).rejects.toThrow(mongoose.Error.ValidationError);
  });

  test('タイトルが未指定なら保存を拒否する', async () => {
    await expect(Floor.create({ user: uid() })).rejects.toThrow(mongoose.Error.ValidationError);
  });

  test('前後の空白を除いたタイトルが空なら保存を拒否する', async () => {
    await expect(Floor.create({ user: uid(), title: '' })).rejects.toThrow(mongoose.Error.ValidationError);
    await expect(Floor.create({ user: uid(), title: '   ' })).rejects.toThrow(mongoose.Error.ValidationError);
  });

  test('タイトルは100文字を許可し、101文字を拒否する', async () => {
    await expect(Floor.create({ user: uid(), title: 'a'.repeat(100) })).resolves.toBeTruthy();
    await expect(Floor.create({ user: uid(), title: 'a'.repeat(101) })).rejects.toThrow(mongoose.Error.ValidationError);
  });

  test('説明は前後の空白を除いて200文字を許可し、201文字を拒否する', async () => {
    const user = uid();
    await expect(Floor.create({ user, title: 't', description: 'a'.repeat(200) })).resolves.toBeTruthy();
    await expect(Floor.create({ user, title: 't', description: 'a'.repeat(201) })).rejects.toThrow(
      mongoose.Error.ValidationError
    );
    // 最小文字数の制約がないため、空白を除去した結果が空でも保存できる。
    await expect(Floor.create({ user, title: 't', description: '    ' })).resolves.toBeTruthy();
  });

  test('言語が未指定ならnullを設定し、指定時は前後の空白を除く', async () => {
    const u = uid();
    const a = await Floor.create({ user: u, title: 't1' });
    expect(a.lang).toBeNull();

    const b = await Floor.create({ user: u, title: 't2', lang: '  ja  ' });
    expect(b.lang).toBe('ja');
  });

  test('翻訳の前後の空白を除いて既定値を設定し、翻訳ごとの_idを作らない', async () => {
    const trUser = tid();
    const floor = await Floor.create({
      user: uid(),
      title: 'base',
      translations: [
        {
          user: trUser,
          title: '  タイトル  ',
          description: '  せつめい  ',
          lang: '  fr  ',
        },
      ],
    });

    expect(floor.translations).toHaveLength(1);
    const tr = floor.translations[0];
    expect(tr.user.toString()).toBe(trUser.toString());
    expect(tr.title).toBe('タイトル');
    expect(tr.description).toBe('せつめい');
    expect(tr.lang).toBe('fr');
    expect(tr.created_at).toBeInstanceOf(Date);
    expect(tr).not.toHaveProperty('_id');
  });

  test('翻訳のユーザ・言語が未指定、またはタイトルが空なら保存を拒否する', async () => {
    const user = uid();

    await expect(
      Floor.create({
        user,
        title: 'base',
        translations: [{ title: 'ok', lang: 'en' }],
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);

    await expect(
      Floor.create({
        user,
        title: 'base',
        translations: [{ user: tid(), title: '   ', lang: 'en' }],
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);

    await expect(
      Floor.create({
        user,
        title: 'base',
        translations: [{ user: tid(), title: 'ok' }],
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  test('翻訳のタイトルと説明は5000文字まで許可し、5001文字を拒否する', async () => {
    const user = uid();
    const trUser = tid();

    await expect(
      Floor.create({
        user,
        title: 'base',
        translations: [{ user: trUser, title: 'a'.repeat(5000), lang: 'en' }],
      })
    ).resolves.toBeTruthy();

    await expect(
      Floor.create({
        user,
        title: 'base',
        translations: [{ user: trUser, title: 'a'.repeat(5001), lang: 'en' }],
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);

    await expect(
      Floor.create({
        user,
        title: 'base',
        translations: [
          {
            user: trUser,
            title: 'ok',
            description: 'a'.repeat(5000),
            lang: 'en',
          },
        ],
      })
    ).resolves.toBeTruthy();

    await expect(
      Floor.create({
        user,
        title: 'base',
        translations: [
          {
            user: trUser,
            title: 'ok',
            description: 'a'.repeat(5001),
            lang: 'en',
          },
        ],
      })
    ).rejects.toThrow(mongoose.Error.ValidationError);
  });

  test('updateOne + $pushは有効な翻訳とtrim後の空文字を受理する', async () => {
    const base = await Floor.create({ user: uid(), title: 'base' });
    const id = base._id;

    await expect(
      Floor.updateOne({ _id: id }, { $push: { translations: { user: tid(), title: 'ok', lang: 'en' } } })
    ).resolves.toBeTruthy();

    const reloaded = await Floor.findById(id);
    expect(reloaded.translations).toHaveLength(1);
    expect(reloaded.translations[0].title).toBe('ok');

    // updateOneはtrim後の空文字をminlength違反として扱わない。
    await expect(
      Floor.updateOne({ _id: id }, { $push: { translations: { user: tid(), title: '   ', lang: 'en' } } })
    ).resolves.toBeTruthy();

    const reloaded2 = await Floor.findById(id);
    expect(reloaded2.translations).toHaveLength(2);
    expect(reloaded2.translations[1].title).toBe('');
  });

  test('更新日時・削除日時・各フラグを更新できる', async () => {
    const f = await Floor.create({ user: uid(), title: 'base' });
    f.updated_at = new Date();
    f.deleted_at = new Date();
    f.floor_display_hidden = true;
    f.delete_flg = true;
    await f.save();

    const got = await Floor.findById(f._id);
    expect(got.updated_at).toBeInstanceOf(Date);
    expect(got.deleted_at).toBeInstanceOf(Date);
    expect(got.floor_display_hidden).toBe(true);
    expect(got.delete_flg).toBe(true);
  });

  test('ページを指定して一覧を取得できる', async () => {
    const user = uid();
    const payloads = Array.from({ length: 8 }, (_, i) => ({
      user,
      title: `f${i + 1}`,
    }));
    await Floor.insertMany(payloads);

    const page = await Floor.paginate({}, { page: 2, limit: 3, sort: { created_at: 1 } });
    expect(page).toHaveProperty('docs');
    expect(page.docs.length).toBe(3);
    expect(page).toHaveProperty('totalDocs', 8);
    expect(page).toHaveProperty('limit', 3);
    expect(page).toHaveProperty('page', 2);
    expect(page).toHaveProperty('totalPages', Math.ceil(8 / 3));
  });
});
