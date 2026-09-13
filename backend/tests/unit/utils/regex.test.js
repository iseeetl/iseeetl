const { escapeRegExp } = require('../../../utils/regex');

describe('正規表現の共通処理', () => {
  test('正規表現の特殊文字をエスケープする', () => {
    const input = 'a+b*c?^$.()|[]\\';
    const expected = 'a\\+b\\*c\\?\\^\\$\\.\\(\\)\\|\\[\\]\\\\';

    expect(escapeRegExp(input)).toBe(expected);
  });

  test('文字列以外の入力も処理する', () => {
    expect(escapeRegExp(123)).toBe('123');
  });
});
