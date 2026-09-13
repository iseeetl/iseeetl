const { createMediaBaseName, createMediaToken } = require('../../../../services/upload/mediaFileName');

describe('mediaFileNameの検証', () => {
  test('時刻が同じでも全メディア種別で共有できる異なる数字トークンを返す', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1712345678901);

    try {
      const tokens = new Set(Array.from({ length: 100 }, () => createMediaToken()));
      expect(tokens.size).toBe(100);
      for (const token of tokens) expect(token).toMatch(/^1712345678901\d+$/);
    } finally {
      now.mockRestore();
    }
  });

  test('既存の数字トークンとユーザIDの命名形式を維持する', () => {
    const userId = '507f1f77bcf86cd799439011';
    expect(createMediaBaseName(userId)).toMatch(new RegExp(`^\\d+_${userId}$`));
  });
});
