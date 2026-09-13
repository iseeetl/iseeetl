const { ALLOWED_EMOJIS, containsOnlyAllowedEmojis } = require('../../../../../services/timeline/shared/guestRules');

describe('guestRulesの検証', () => {
  test('許可絵文字のみは true', () => {
    const content = `${ALLOWED_EMOJIS[0]}${ALLOWED_EMOJIS[1]}`;
    expect(containsOnlyAllowedEmojis(content)).toBe(true);
  });

  test('許可絵文字以外が混ざると false', () => {
    expect(containsOnlyAllowedEmojis('👍a')).toBe(false);
    expect(containsOnlyAllowedEmojis('🔥')).toBe(false);
  });

  test('空文字は true', () => {
    expect(containsOnlyAllowedEmojis('')).toBe(true);
  });

  test('文字列以外は false', () => {
    expect(containsOnlyAllowedEmojis(null)).toBe(false);
    expect(containsOnlyAllowedEmojis(undefined)).toBe(false);
    expect(containsOnlyAllowedEmojis(123)).toBe(false);
  });
});
