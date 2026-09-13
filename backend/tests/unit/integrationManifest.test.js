const fs = require('fs');
const path = require('path');

const {
  BACKEND_ROOT,
  EXTERNAL_MOCKED_SPECS,
  listIntegrationSpecs,
  listNonstandardIntegrationTests,
  listDirectJestMockSpecs,
  validateIntegrationManifest,
  resolveIntegrationGroup,
} = require('../integration/manifest');

describe('結合テストの実行グループ', () => {
  test('各結合テストは補助グループのいずれか1つに所属する', () => {
    const groups = validateIntegrationManifest();

    expect(groups.all.length).toBeGreaterThan(0);
    expect(groups.externalMocked).toEqual([...EXTERNAL_MOCKED_SPECS].sort());
    expect(groups.externalMocked).toEqual(listDirectJestMockSpecs());
    expect(groups.remaining).toEqual(groups.all.filter((filePath) => !groups.externalMocked.includes(filePath)));
    expect(new Set([...groups.externalMocked, ...groups.remaining])).toEqual(new Set(groups.all));
  });

  test('結合テストの配置先に命名規則外のテストファイルがない', () => {
    expect(listNonstandardIntegrationTests()).toEqual([]);
    expect(listIntegrationSpecs()).toEqual(validateIntegrationManifest().all);
  });

  test.each(['external-mocked', 'remaining'])('%sグループのパスはBackendからの相対パスで実在するファイルを指す', (groupName) => {
    resolveIntegrationGroup(groupName).forEach((filePath) => {
      expect(filePath).toMatch(/^tests\/integration\/.+\.int\.test\.js$/);
      expect(fs.existsSync(path.join(BACKEND_ROOT, filePath))).toBe(true);
    });
  });

  test('未定義のグループを拒否する', () => {
    expect(() => resolveIntegrationGroup('unknown')).toThrow('未定義のIntegrationテストグループです');
  });
});
