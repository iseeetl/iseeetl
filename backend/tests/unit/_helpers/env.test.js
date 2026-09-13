const { snapshotEnv, restoreEnv } = require('./env');

describe('単体テスト用の環境変数の復元', () => {
  test('既存値を復元し、追加した項目を削除する', () => {
    const environment = {
      EXISTING: 'before',
      KEEP: 'unchanged',
    };
    const snapshot = snapshotEnv(['EXISTING', 'MISSING'], environment);

    environment.EXISTING = 'after';
    environment.MISSING = 'temporary';
    restoreEnv(snapshot, environment);

    expect(environment).toEqual({
      EXISTING: 'before',
      KEEP: 'unchanged',
    });
  });

  test('存在する項目を値とともに保持する', () => {
    const environment = { PRESENT: '' };
    const snapshot = snapshotEnv(['PRESENT'], environment);

    delete environment.PRESENT;
    restoreEnv(snapshot, environment);

    expect(Object.prototype.hasOwnProperty.call(environment, 'PRESENT')).toBe(true);
    expect(environment.PRESENT).toBe('');
  });
});
