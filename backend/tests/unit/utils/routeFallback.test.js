const { shouldReturnNotFoundOnFallback } = require('../../../utils/routeFallback');

describe('未定義ルートの応答判定', () => {
  test.each([
    ['/', true],
    ['/api', true],
    ['/api/', true],
    ['/api/chat', true],
    ['/api/v1/timeline', true],
    ['/api?x=1', true],
    ['/apis', false],
    ['/timeline', false],
    ['/login', false],
    ['', false],
  ])('%sの未定義ルートで404を返すかを%sと判定する', (path, expected) => {
    expect(shouldReturnNotFoundOnFallback(path)).toBe(expected);
  });
});
