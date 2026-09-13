import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect } from 'vitest';

const collectJavaScriptSources = (root) => {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return collectJavaScriptSources(path);
    return /\.(?:js|mjs|vue)$/.test(entry) ? [path] : [];
  });
};

describe('E2E公開設定の読込元', () => {
  it('フロントエンドとE2EのコードはVueインスタンスの内部構造を直接参照しない', () => {
    const projectRoot = process.cwd();
    const files = [
      ...collectJavaScriptSources(join(projectRoot, 'src')),
      ...collectJavaScriptSources(join(projectRoot, 'tests/e2e/specs')),
    ];
    const forbidden = [
      { label: 'Vue 2の内部ルート参照', pattern: /\.__vue__\b/ },
      { label: 'Vueの親コンポーネント内部参照', pattern: /__vueParentComponent/ },
      { label: 'Vueのアプリインスタンス内部参照', pattern: /__vue_app__/ },
      { label: 'Vueの子コンポーネント内部参照', pattern: /\$children\b/ },
      { label: 'Vueの仮想DOMサブツリー内部参照', pattern: /instance\.subTree\b/ },
      { label: 'Vueインスタンスの内部プロキシ参照', pattern: /instance\.proxy\b/ },
      { label: 'Vueインスタンスの内部props参照', pattern: /instance\.props\b/ },
    ];
    const violations = [];

    files.forEach((path) => {
      const content = readFileSync(path, 'utf8');
      forbidden.forEach(({ label, pattern }) => {
        if (pattern.test(content)) violations.push(`${relative(projectRoot, path)}: ${label}`);
      });
      if (path.includes(`${join('tests', 'e2e', 'specs')}`)) {
        if (/\$parent\b/.test(content)) violations.push(`${relative(projectRoot, path)}: Vueの親コンポーネント内部参照`);
        if (/\$options\b/.test(content)) violations.push(`${relative(projectRoot, path)}: Vueコンポーネントの内部オプション参照`);
      }
    });

    expect(violations).to.deep.equal([]);
    const removedBridgeName = ['e2eVueComponent', 'Bridge.js'].join('');
    expect(existsSync(join(projectRoot, 'src/testing', removedBridgeName))).to.equal(false);
  }, 30000);
});
