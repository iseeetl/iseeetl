const { ALLOWED_LANGUAGES } = require('../../../constants/languages');

describe('対応言語の定義', () => {
  test('許可言語に日本語と英語が含まれる', () => {
    expect(ALLOWED_LANGUAGES).toContain('ja');
    expect(ALLOWED_LANGUAGES).toContain('en');
  });

  test('配列は凍結されている', () => {
    expect(Object.isFrozen(ALLOWED_LANGUAGES)).toBe(true);
    const originalLength = ALLOWED_LANGUAGES.length;
    try {
      ALLOWED_LANGUAGES.push('xx');
    } catch (_) {
      // 変更時の例外は許容し、配列が変化しないことを検証する。
    }
    expect(ALLOWED_LANGUAGES.length).toBe(originalLength);
  });
});
