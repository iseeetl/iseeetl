import fs from 'node:fs/promises';
import path from 'node:path';

const fallbackDirectory = new URL('../../LICENSES/third-party/', import.meta.url);
const fail = (message) => { throw new Error(`[build-licenses] ${message}`); };
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

const readLegalFiles = async (directory) => {
  const files = [];
  const walk = async (relativeDirectory, selected = false) => {
    const entries = await fs.readdir(path.join(directory, relativeDirectory), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      if (!selected && !/^(licen[cs]es?|copying|notices?|copyright)(?:[._-]|$)/i.test(entry.name)) continue;
      const relativePath = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(relativePath, true);
      } else if (entry.isFile()) {
        const text = await fs.readFile(path.join(directory, relativePath), 'utf8');
        if (!hasText(text)) fail(`ライセンス関連ファイルが空です: ${relativePath}`);
        files.push({ file: relativePath.replaceAll(path.sep, '/'), text });
      } else {
        fail(`ライセンス関連ファイルの形式を確認してください: ${relativePath}`);
      }
    }
  };
  await walk('');
  return files;
};

const formatFiles = (files) => files.map(({ file, text }) => `--- ${file} ---\n${text}`).join('\n\n');

export const collectBuildLicenses = async (bundle, { readFallback } = {}) => {
  const packageRoots = new Set();
  for (const chunk of Object.values(bundle)) {
    if (chunk.type !== 'chunk') continue;
    for (const id of chunk.moduleIds) {
      if (id.startsWith('\0')) continue;
      // ESM用のpackage.jsonではなく、実際にバンドルしたnpmパッケージのルートを使う。
      const match = id.replaceAll('\\', '/').match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)(?:\/|$)/);
      if (match) packageRoots.add(match[1]);
    }
  }
  if (!packageRoots.size) fail('バンドルした依存ライブラリを確認できません');

  const licenses = new Map();
  for (const root of [...packageRoots].sort()) {
    const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const { name, version, license: identifier } = metadata;
    if (![name, version, identifier].every(hasText)) {
      fail(`名前・バージョン・ライセンスを確認してください: ${name || path.basename(root)}`);
    }
    const key = `${name}@${version}`;
    const files = await readLegalFiles(root);
    const isNotice = ({ file }) => /^(notices?|copyright)(?:[._/-]|$)/i.test(file);
    const licenseFiles = files.filter((file) => !isNotice(file));
    const noticeFiles = files.filter(isNotice);
    const entry = { name, version, identifier, text: formatFiles(licenseFiles) };
    if (!licenseFiles.length) {
      const fallback = await readFallback?.(key);
      if (!fallback || fallback.identifier !== identifier || !hasText(fallback.text)) {
        fail(`ライセンス本文を確認してください: ${key}`);
      }
      entry.text = fallback.text;
    }
    if (noticeFiles.length) entry.notice = formatFiles(noticeFiles);
    if (licenses.has(key) && JSON.stringify(licenses.get(key)) !== JSON.stringify(entry)) {
      fail(`同じバージョンのライセンス情報が一致しません: ${key}`);
    }
    licenses.set(key, entry);
  }
  return [...licenses.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([, entry]) => entry);
};

const readFallback = async (key) => {
  const sources = JSON.parse(await fs.readFile(new URL('frontend.json', fallbackDirectory), 'utf8'));
  const entry = sources[key];
  if (!entry) return null;
  return { ...entry, text: await fs.readFile(new URL(entry.file, fallbackDirectory), 'utf8') };
};

export const buildLicensesPlugin = () => ({
  name: 'iseeetl-build-licenses',
  apply: 'build',
  generateBundle: {
    order: 'post',
    async handler(_options, bundle) {
      const asset = bundle['licenses.json'];
      if (asset?.type !== 'asset') fail('Viteのlicenses.jsonが生成されていません');
      const original = JSON.parse(String(asset.source));
      if (!Array.isArray(original) || !original.length) fail('Viteのライセンス一覧が空です');
      const licenses = await collectBuildLicenses(bundle, { readFallback });
      for (const entry of original) {
        if (!licenses.some(({ name }) => name === entry.name)) {
          fail(`Viteが列挙したライブラリを確認できません: ${entry.name}`);
        }
      }
      asset.source = `${JSON.stringify(licenses, null, 2)}\n`;
    },
  },
});
