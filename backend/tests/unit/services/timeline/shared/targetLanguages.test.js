const {
  normalizeLanguages,
  resolveMutationTargetLangs,
} = require('../../../../../services/timeline/shared/targetLanguages');

describe('翻訳先言語の決定', () => {
  test('通常APIの指定値は互換性のためそのまま返す', () => {
    const requested = ['en', 'en', 'invalid'];
    expect(resolveMutationTargetLangs({ requested })).toBe(requested);
  });

  test('v1はフロア設定とルーム接続言語を重複排除し、ソース言語を除く', () => {
    const io = { roomLanguageProvider: { getLanguages: jest.fn(() => ['ja', 'de', 'en']) } };
    expect(resolveMutationTargetLangs({
      floor: { target_langs: ['en', 'fr'] },
      roomId: 'room-1',
      io,
      sourceLang: 'ja',
    })).toEqual(['en', 'fr', 'de']);
  });

  test('presence取得に失敗してもフロア設定を代わりに使う', () => {
    const io = { roomLanguageProvider: { getLanguages: jest.fn(() => { throw new Error('unavailable'); }) } };
    expect(resolveMutationTargetLangs({
      floor: { target_langs: ['en'] },
      roomId: 'room-1',
      io,
      sourceLang: 'ja',
    })).toEqual(['en']);
  });

  test('未対応言語を除外する', () => {
    expect(normalizeLanguages(['ja', 'xx', 'ja', null])).toEqual(['ja']);
  });
});
