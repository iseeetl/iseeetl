const fs = require('node:fs');
const path = require('node:path');

const writeRuntimeFixture = (name, content) => {
  if (!/^[a-z0-9-]+\.[a-z0-9]+$/.test(name)) throw new Error('E2Eのテストデータのファイル名が不正です。');
  const root = path.resolve(__dirname, '../../../../..');
  const runtime = path.join(root, '.e2e-runtime');
  if (fs.realpathSync(runtime) !== runtime) throw new Error('E2Eの実行用ディレクトリは、このチェックアウト内に配置してください。');
  const directory = path.join(runtime, 'fixtures');
  if (fs.existsSync(directory) && fs.realpathSync(directory) !== directory) throw new Error('E2Eのテストデータのディレクトリにシンボリックリンクは使用できません。');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, name);
  fs.writeFileSync(file, content, { flag: 'wx' });
  return file;
};

module.exports = { writeRuntimeFixture };
