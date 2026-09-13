#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import viteConfig from '../vite.config.js';
import {
  parseArguments,
  resolveBuildRequest,
} from './vue3-build-contract.mjs';

const frontendRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const requiredPublicFiles = [
  'manifest.json',
  'shortcut-manifest.json',
  'web-app-manifest.js',
  'OneSignalSDKWorker.js',
];
const forbiddenPublicDirectories = ['media', 'profile', 'upload'];
const fail = (message) => {
  throw new Error(`[vue3-build] ${message}`);
};

const verifyPublicBuildOutput = async (outputDirectory) => {
  for (const relativePath of requiredPublicFiles) {
    const stat = await fs.lstat(path.join(outputDirectory, relativePath)).catch(() => null);
    if (!stat || stat.isSymbolicLink() || !stat.isFile()) {
      fail(`必要な公開ファイルがありません: ${relativePath}`);
    }
  }
  for (const relativePath of forbiddenPublicDirectories) {
    if (await fs.lstat(path.join(outputDirectory, relativePath)).catch(() => null)) {
      fail(`成果物に実行時データのディレクトリが含まれています: ${relativePath}`);
    }
  }
};

export const buildFrontend = async ({
  mode,
  kind = 'local',
  releaseTag = null,
  releaseCommit = null,
  releaseId,
  outDir = path.join(frontendRoot, 'dist'),
  cacheDir,
  loadEnvironment,
}) => {
  if (!['development', 'staging', 'production'].includes(mode)) fail('対応していないビルドモードです');
  if (!releaseId || typeof releaseId !== 'string') fail('リリースIDを指定してください');

  const resolvedOutDir = path.resolve(outDir);
  if (resolvedOutDir === frontendRoot || resolvedOutDir === path.parse(resolvedOutDir).root) {
    fail('ビルド出力先にフロントエンドのルートまたはファイルシステムのルートは指定できません');
  }
  await fs.mkdir(path.dirname(resolvedOutDir), { recursive: true });

  const htmlEntry = path.join(frontendRoot, 'index.html');
  const input = await fs
    .access(htmlEntry)
    .then(() => htmlEntry)
    .catch(() => path.join(frontendRoot, 'src/main.js'));
  const config = await viteConfig({
    command: 'build',
    mode,
    outDir: resolvedOutDir,
    input,
    releaseId,
    cacheDir,
    ...(loadEnvironment ? { loadEnvironment } : {}),
  });

  await build({ ...config, configFile: false, mode });
  await verifyPublicBuildOutput(resolvedOutDir);
  const html = await fs.readFile(path.join(resolvedOutDir, 'index.html'), 'utf8');
  const manifestScriptIndex = html.indexOf('/web-app-manifest.js');
  const moduleEntryIndex = html.indexOf('type="module"');
  if (
    manifestScriptIndex === -1 ||
    moduleEntryIndex === -1 ||
    manifestScriptIndex > moduleEntryIndex
  ) {
    fail('マニフェスト用スクリプトをViteの起動スクリプトより前に配置してください');
  }
  const generatedJavaScript = (await fs.readdir(path.join(resolvedOutDir, 'assets')))
    .filter((fileName) => fileName.endsWith('.js'));
  let releaseIdMatches = 0;
  for (const fileName of generatedJavaScript) {
    const source = await fs.readFile(path.join(resolvedOutDir, 'assets', fileName), 'utf8');
    if (source.includes(releaseId)) releaseIdMatches += 1;
  }
  if (releaseIdMatches !== 1) {
    fail(`リリースIDを含む生成JavaScriptファイルは1つである必要があります。検出数: ${releaseIdMatches}`);
  }
  if (html.includes('<%=') || html.includes('VUE_APP_') || html.includes('VITE_')) {
    fail('成果物のHTMLに旧形式または未置換の環境変数のプレースホルダが残っています');
  }

  const manifest = {
    schemaVersion: 1,
    kind,
    mode,
    releaseTag,
    releaseCommit,
    releaseId,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(resolvedOutDir, 'vue3-build-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return { output: resolvedOutDir, ...manifest };
};

const main = async () => {
  const request = resolveBuildRequest(parseArguments(process.argv.slice(2)));
  const result = await buildFrontend(request);
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

export { parseArguments, resolveBuildRequest };

const executedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (executedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
