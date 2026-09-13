import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLicensesPlugin, collectBuildLicenses } from '../../../scripts/build-licenses.mjs';

vi.mock('node:fs/promises', () => ({ default: { readFile: vi.fn(), readdir: vi.fn() } }));

const files = new Map();
const root = '/project/node_modules/@example/library';
const metadata = { name: '@example/library', version: '1.2.3', license: 'MIT' };
const licenseText = 'Copyright (c) Example\r\n\r\nテスト用のライセンス本文\r\n';
const setPackage = (directory = root, overrides = {}, legalFiles = { LICENSE: licenseText }) => {
  files.set(`${directory}/package.json`, JSON.stringify({ ...metadata, ...overrides }));
  for (const [name, text] of Object.entries(legalFiles)) files.set(`${directory}/${name}`, text);
};
const bundleFor = (...moduleIds) => ({
  'app.js': { type: 'chunk', moduleIds },
  'licenses.json': { type: 'asset', source: JSON.stringify([{ name: metadata.name, version: '0.0.0' }]) },
});

beforeEach(() => {
  files.clear();
  vi.resetAllMocks();
  fs.readFile.mockImplementation(async (file) => {
    if (!files.has(String(file))) throw new Error(`テスト用ファイルがありません: ${file}`);
    return files.get(String(file));
  });
  fs.readdir.mockImplementation(async (directory) => {
    const children = new Map();
    for (const file of files.keys()) {
      const relative = path.posix.relative(directory, file);
      if (relative.startsWith('..')) continue;
      const [name, ...rest] = relative.split('/');
      children.set(name, { name, isFile: () => !rest.length, isDirectory: () => !!rest.length });
    }
    return [...children.values()];
  });
});

describe('ビルドするライブラリのライセンス', () => {
  it('ESM用の簡略な設定を使わず、元のバージョンと著作権表示を収録する', async () => {
    setPackage();
    files.set(`${root}/build/esm/package.json`, JSON.stringify({ name: metadata.name, type: 'module' }));
    const bundle = bundleFor(`${root}/build/esm/index.js`, `${root}/build/esm/other.js`, '/project/src/main.js');
    await buildLicensesPlugin().generateBundle.handler({}, bundle);
    expect(JSON.parse(bundle['licenses.json'].source)).toEqual([
      { name: metadata.name, version: metadata.version, identifier: 'MIT', text: `--- LICENSE ---\n${licenseText}` },
    ]);
  });

  it('同じ名前の異なるバージョンを、実際に使った依存先ごとに収録する', async () => {
    const nested = `/project/node_modules/parent/node_modules/${metadata.name}`;
    setPackage();
    setPackage(nested, { version: '2.0.0' }, { 'LICENSE.txt': '別バージョンの原文' });
    const entries = await collectBuildLicenses(bundleFor(`${root}/index.js`, `${nested}/index.js`));
    expect(entries.map(({ version }) => version)).toEqual(['1.2.3', '2.0.0']);
    expect(entries[1].text).toContain('別バージョンの原文');
  });

  it('複数のライセンス本文とNOTICEを省略せず収録する', async () => {
    setPackage(root, {}, { LICENSE: licenseText, 'LICENSE-alternative': '選択可能な別のライセンス', 'NOTICE.txt': '追加の権利表示\r\n', 'NOTICES/component.txt': '依存先の表示', COPYRIGHT: '別ファイルの著作権表示' });
    const [entry] = await collectBuildLicenses(bundleFor(`${root}/index.js`));
    expect(entry.text).toContain(licenseText);
    expect(entry.text).toContain('選択可能な別のライセンス');
    expect(entry.notice).toContain('追加の権利表示\r\n');
    expect(entry.notice).toContain('依存先の表示');
    expect(entry.notice).toContain('別ファイルの著作権表示');
  });

  it('ライセンス専用ディレクトリ内の原文も収録する', async () => {
    setPackage(root, {}, { 'LICENSES/component.txt': licenseText });
    const [entry] = await collectBuildLicenses(bundleFor(`${root}/index.js`));
    expect(entry.text).toContain(licenseText);
  });

  it('本文がない場合は該当バージョンの補完資料を使う', async () => {
    setPackage(root, {}, {});
    const readFallback = vi.fn(async (key) => key === '@example/library@1.2.3'
      ? { identifier: 'MIT', text: licenseText, source: 'https://example.invalid/LICENSE' } : null);
    const [entry] = await collectBuildLicenses(bundleFor(`${root}/index.js`), { readFallback });
    expect(entry.text).toBe(licenseText);
    setPackage(root, { version: '2.0.0' }, {});
    await expect(collectBuildLicenses(bundleFor(`${root}/index.js`), { readFallback })).rejects.toThrow('ライセンス本文');
  });

  it.each(['name', 'version', 'license'])('%sが空ならビルドを失敗させる', async (field) => {
    setPackage(root, { [field]: '' });
    await expect(collectBuildLicenses(bundleFor(`${root}/index.js`))).rejects.toThrow('名前・バージョン・ライセンス');
  });

  it('NOTICEだけではライセンス本文の代わりにしない', async () => {
    setPackage(root, {}, { NOTICE: '追加の権利表示' });
    await expect(collectBuildLicenses(bundleFor(`${root}/index.js`))).rejects.toThrow('ライセンス本文');
  });

  it('補完資料とパッケージのライセンスが違えば失敗させる', async () => {
    setPackage(root, {}, {});
    const readFallback = async () => ({ identifier: 'Apache-2.0', text: licenseText });
    await expect(collectBuildLicenses(bundleFor(`${root}/index.js`), { readFallback })).rejects.toThrow('ライセンス本文');
  });

  it('同一バージョンの権利表示が依存先によって異なれば失敗させる', async () => {
    const nested = `/project/node_modules/parent/node_modules/${metadata.name}`;
    setPackage();
    setPackage(nested, {}, { LICENSE: '異なる原文' });
    await expect(collectBuildLicenses(bundleFor(`${root}/index.js`, `${nested}/index.js`))).rejects.toThrow('一致しません');
  });

  it('空のライセンスファイルを補完資料で隠さない', async () => {
    setPackage(root, {}, { LICENSE: '   ' });
    await expect(collectBuildLicenses(bundleFor(`${root}/index.js`))).rejects.toThrow('ファイルが空');
  });

  it('Viteが一覧を生成していなければ失敗させる', async () => {
    await expect(buildLicensesPlugin().generateBundle.handler({}, {})).rejects.toThrow('生成されていません');
  });

  it('Viteの一覧にだけ存在する依存を黙って除外しない', async () => {
    setPackage();
    const bundle = bundleFor(`${root}/index.js`);
    bundle['licenses.json'].source = JSON.stringify([{ name: 'unresolved-dependency' }]);
    await expect(buildLicensesPlugin().generateBundle.handler({}, bundle)).rejects.toThrow('列挙したライブラリ');
  });
});
