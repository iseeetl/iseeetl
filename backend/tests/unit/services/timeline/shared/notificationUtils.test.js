const { buildUrl, normalizeId } = require('../../../../../services/timeline/shared/notificationUtils');

describe('通知データの共通処理', () => {
  test('IDがnullまたはundefinedなら空文字を返す', () => {
    expect(normalizeId(null)).toBe('');
    expect(normalizeId(undefined)).toBe('');
  });

  test('IDを文字列へ変換する', () => {
    expect(normalizeId(123)).toBe('123');
    expect(normalizeId({ toString: () => 'x' })).toBe('x');
  });

  test('フロアとルームのURLを生成する', () => {
    expect(buildUrl('https://example.com', 'f1', 'r1')).toBe('https://example.com/floor/f1/room/r1');
    expect(buildUrl('https://example.com', null, 'r1')).toBe('https://example.com/floor//room/r1');
  });
});
