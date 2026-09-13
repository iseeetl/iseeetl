const {
  makeLabelByLangFromTag,
  pickTagNameByLang,
  prefixWithLabel,
} = require('../../../../services/analysis/labels');

const tag = {
  name: '基準名',
  translations: [
    { lang: 'en', name: 'English name' },
    { lang: 'fr', name: 'Nom français' },
  ],
};

describe('AI解析結果のラベル', () => {
  test('指定言語に完全一致する翻訳を優先する', () => {
    expect(pickTagNameByLang(tag, 'en')).toBe('English name');
  });

  test('地域を除いた言語の翻訳を元のタグ名より優先する', () => {
    expect(pickTagNameByLang(tag, 'fr-FR')).toBe('Nom français');
  });

  test('対応する翻訳がなければ実際のルームタグ名を使う', () => {
    expect(makeLabelByLangFromTag(tag)('de')).toBe('基準名');
    expect(prefixWithLabel('基準名', 'result')).toBe('#基準名 result');
  });

  test('翻訳名が空白なら未設定として元のタグ名を使う', () => {
    expect(pickTagNameByLang({ name: '基準名', translations: [{ lang: 'en', name: '   ' }] }, 'en'))
      .toBe('基準名');
  });

  test('旧形式の固定された解析名からラベルを推測しない', () => {
    expect(makeLabelByLangFromTag({ name: '独自タグ', translations: [] })('ja')).toBe('独自タグ');
  });
});
