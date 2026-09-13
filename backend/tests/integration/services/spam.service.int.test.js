const mongoose = require('mongoose');
const Spam = require('../../../models/Spam');
const spamService = require('../../../services/spam.service');

describe('スパムワードサービスの結合動作', () => {
  const userId = new mongoose.Types.ObjectId();

  describe('スパムワード一覧の取得', () => {
    beforeEach(async () => {
      await Spam.create([
        { user: userId, word: 'bad' },
        { user: userId, word: 'a+b' },
        { user: userId, word: 'neutral' },
      ]);
    });

    test('検索語の正規表現の特殊文字をエスケープする', async () => {
      const res = await spamService.getSpamList({ page: 1, search: 'a+b' });
      expect(res.docs.map((d) => d.word)).toEqual(expect.arrayContaining(['a+b']));
      const res2 = await spamService.getSpamList({ page: 1, search: 'ab' });
      expect(res2.docs.some((d) => d.word === 'a+b')).toBe(false);
    });

    test('search が空や null なら全件（ページング条件のみ）', async () => {
      const res1 = await spamService.getSpamList({ page: 1, search: '' });
      const res2 = await spamService.getSpamList({ page: 1, search: null });
      expect(res1.total).toBeGreaterThanOrEqual(3);
      expect(res2.total).toBeGreaterThanOrEqual(3);
    });
  });

  describe('スパムワードの作成・更新・削除', () => {
    test('入力検証を適用して作成・更新・削除ができる', async () => {
      const created = await spamService.createSpam({ word: ' ok ' }, userId);
      expect(created.word).toBe('ok');

      const upd = await spamService.updateSpam({ _id: created._id, word: 'good' });
      expect(upd).toBeTruthy();
      expect(upd.word).toBe('good');

      const del = await spamService.deleteSpam({ _id: created._id });
      expect(del._id.toString()).toBe(created._id.toString());

      const del2 = await spamService.deleteSpam({ _id: created._id });
      expect(del2).toBeNull();
    });
  });

  describe('スパムワードの置換', () => {
    test('長い単語から置き換え、大文字小文字・特殊文字・単語の重なりに対応する', async () => {
      await Spam.create([
        { user: userId, word: 'bad' },
        { user: userId, word: 'a+b' },
        { user: userId, word: 'badly' },
      ]);

      const input = 'BAD and a+b, badly bad.';
      const out = await spamService.replaceSpams(input);
      expect(out).toBe('*** and ***, *** ***.');
    });

    test('nullとundefinedには空文字を返す', async () => {
      await expect(spamService.replaceSpams(null)).resolves.toBe('');
      await expect(spamService.replaceSpams(undefined)).resolves.toBe('');
    });
  });
});
