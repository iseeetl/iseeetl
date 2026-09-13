const mongoose = require('mongoose');
const Spam = require('../../../models/Spam');

describe('スパムワードモデルの保存制約', () => {
  const userId = new mongoose.Types.ObjectId();

  test('ユーザを必須とし、前後の空白を除いた1～50文字の単語を保存する', async () => {
    const doc = await Spam.create({ user: userId, word: '  hello  ' });
    expect(doc._id).toBeDefined();
    expect(doc.word).toBe('hello');
    expect(doc.created_at).toBeInstanceOf(Date);
  });

  test('ユーザが未指定なら保存を拒否する', async () => {
    await expect(Spam.create({ word: 'x' })).rejects.toThrow(mongoose.Error.ValidationError);
  });

  test('前後の空白を除いた単語が空なら保存を拒否する', async () => {
    await expect(Spam.create({ user: userId, word: '' })).rejects.toThrow(mongoose.Error.ValidationError);
    await expect(Spam.create({ user: userId, word: '   ' })).rejects.toThrow(mongoose.Error.ValidationError);
  });

  test('単語は50文字を許可し、51文字を拒否する', async () => {
    await expect(Spam.create({ user: userId, word: 'a'.repeat(50) })).resolves.toBeTruthy();
    await expect(Spam.create({ user: userId, word: 'a'.repeat(51) })).rejects.toThrow(mongoose.Error.ValidationError);
  });
});
