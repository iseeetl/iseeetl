const fs = require('node:fs');
const path = require('node:path');
const vueModule = require('@vitejs/plugin-vue');
const { loadEnv } = require('vite');
const { buildLicensesPlugin } = require('./scripts/build-licenses.mjs');

const vue = vueModule.default || vueModule;
const frontendRoot = __dirname;
const sourceRoot = path.join(frontendRoot, 'src');
const productApplicationEntryUrl = '/src/main.js';
const e2eApplicationEntryUrl = '/tests/e2e/runtime/main.js';
const e2eBuildOutput = path.resolve(frontendRoot, '../.e2e-runtime/frontend-dist');
const e2eRuntimeRoot = path.dirname(e2eBuildOutput);
const buildTarget = ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'];
const defaultServerPort = 3000;
const defaultBackendProxyTarget = 'http://127.0.0.1:5000';
const e2eServerPort = 3100;
const e2eFrontendOrigin = 'http://localhost:3100';
const e2eBackendProxyTarget = 'http://127.0.0.1:5100';
const publicEnvironmentKeys = [
  'VITE_APP_NAME',
  'VITE_APP_URL',
  'VITE_ONESIGNAL_APP_ID',
  'VITE_GOOGLE_OAUTH_CLIENT_ID',
];
const e2eDisabledPublicEnvironmentKeys = [
  'VITE_ONESIGNAL_APP_ID',
  'VITE_GOOGLE_OAUTH_CLIENT_ID',
];

const createE2EApplicationEntryPlugin = () => ({
  name: 'iseeetl-e2e-application-entry',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      if (!html.includes(productApplicationEntryUrl)) {
        throw new Error('E2Eビルドには通常のフロントエンド起動ファイルが必要です。');
      }
      return html.replace(productApplicationEntryUrl, e2eApplicationEntryUrl);
    },
  },
});

const requireRealDirectory = (targetPath, { lstat, realpath }) => {
  let stats;
  let resolvedPath;
  try {
    stats = lstat(targetPath);
    resolvedPath = realpath(targetPath);
  } catch (_error) {
    throw new Error('E2Eのビルド出力先には、リポジトリ内の実ディレクトリを指定してください。');
  }

  if (
    stats.isSymbolicLink() ||
    !stats.isDirectory() ||
    path.resolve(resolvedPath) !== targetPath
  ) {
    throw new Error('E2Eのビルド出力先には、リポジトリ内の実ディレクトリを指定してください。');
  }
};

const validateE2EBuildOutput = ({
  exists = fs.existsSync,
  mkdir = fs.mkdirSync,
  lstat = fs.lstatSync,
  realpath = fs.realpathSync,
} = {}) => {
  if (!exists(e2eRuntimeRoot)) mkdir(e2eRuntimeRoot, { recursive: true });
  requireRealDirectory(e2eRuntimeRoot, { lstat, realpath });

  if (exists(e2eBuildOutput)) {
    requireRealDirectory(e2eBuildOutput, { lstat, realpath });
  }

  return e2eBuildOutput;
};

const loadFrontendEnvironment = (mode, loadEnvironment = loadEnv) => {
  const loadedEnvironment = loadEnvironment(mode, frontendRoot, 'VITE_');

  if (mode === 'e2e') {
    const configuredProviderKeys = e2eDisabledPublicEnvironmentKeys.filter(
      (key) => loadedEnvironment[key]
    );
    if (configuredProviderKeys.length > 0) {
      throw new Error(
        `E2Eモードでは外部サービスの公開設定を空にしてください: ${configuredProviderKeys.join(', ')}`
      );
    }
  }

  return loadedEnvironment;
};

const parseServerPort = (value, mode) => {
  const configuredValue = value || (mode === 'e2e' ? '' : String(defaultServerPort));

  if (!/^\d+$/.test(configuredValue)) {
    throw new Error('VITE_SERVER_PORTには1～65535の整数を指定してください');
  }

  const port = Number(configuredValue);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('VITE_SERVER_PORTには1～65535の整数を指定してください');
  }
  if (mode === 'e2e' && port !== e2eServerPort) {
    throw new Error(`E2EモードではVITE_SERVER_PORTに${e2eServerPort}を指定してください`);
  }

  return port;
};

const parseBackendProxyTarget = (value, mode) => {
  const configuredValue = value || (mode === 'e2e' ? '' : defaultBackendProxyTarget);
  let target;

  try {
    target = new URL(configuredValue);
  } catch {
    throw new Error('VITE_BACKEND_PROXY_TARGETにはHTTP(S)のオリジンを指定してください');
  }

  const isHttpOrigin =
    (target.protocol === 'http:' || target.protocol === 'https:') &&
    !target.username &&
    !target.password &&
    target.pathname === '/' &&
    !target.search &&
    !target.hash;
  if (!isHttpOrigin) {
    throw new Error('VITE_BACKEND_PROXY_TARGETにはHTTP(S)のオリジンを指定してください');
  }
  if (mode === 'e2e' && target.origin !== e2eBackendProxyTarget) {
    throw new Error(`E2EモードではVITE_BACKEND_PROXY_TARGETに${e2eBackendProxyTarget}を指定してください`);
  }

  return target.origin;
};

const buildServerConfiguration = (mode, loadedEnvironment) => {
  if (mode === 'e2e' && loadedEnvironment.VITE_APP_URL !== e2eFrontendOrigin) {
    throw new Error(`E2EモードではVITE_APP_URLに${e2eFrontendOrigin}を指定してください`);
  }
  const port = parseServerPort(loadedEnvironment.VITE_SERVER_PORT, mode);
  const backendProxyTarget = parseBackendProxyTarget(
    loadedEnvironment.VITE_BACKEND_PROXY_TARGET,
    mode
  );
  const localOrigin = new RegExp(
    `^https?:\\/\\/(?:localhost|127\\.0\\.0\\.1|\\[::1\\]):${port}$`
  );
  const createProxy = (additionalOptions = {}) => ({
    target: backendProxyTarget,
    ...additionalOptions,
  });

  return {
    port,
    localOrigin,
    proxy: {
      '^/api(?:/|$)': createProxy(),
      '^/media/': createProxy(),
      '^/profile/': createProxy(),
      '^/socket\\.io(?:/|$)': createProxy({
        ws: true,
        rewriteWsOrigin: false,
      }),
    },
  };
};

const buildPublicEnvironmentDefinitions = (loadedEnvironment) => {
  return Object.fromEntries(
    publicEnvironmentKeys.map((key) => [
      `import.meta.env.${key}`,
      JSON.stringify(loadedEnvironment[key] || ''),
    ])
  );
};

const createViteConfig = async ({
  mode = 'development',
  command = 'build',
  outDir,
  input,
  releaseId = 'development',
  cacheDir,
  loadEnvironment = loadEnv,
} = {}) => {
  if (mode === 'e2e' && command === 'build' && !outDir) {
    validateE2EBuildOutput();
  }

  const optimizedBuild = command === 'build' && mode !== 'development';
  const loadedEnvironment = loadFrontendEnvironment(mode, loadEnvironment);
  const serverConfiguration = buildServerConfiguration(mode, loadedEnvironment);
  const buildOptions = {
    target: buildTarget,
    cssTarget: buildTarget,
    minify: optimizedBuild ? 'oxc' : false,
    cssMinify: optimizedBuild ? 'lightningcss' : false,
    sourcemap: false,
    copyPublicDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    manifest: '.vite/manifest.json',
    license: { fileName: 'licenses.json' },
    emptyOutDir: true,
    rolldownOptions: {
      ...(input ? { input } : {}),
      ...(optimizedBuild
        ? {
            output: {
              comments: { legal: true },
              minify: {
                compress: { dropConsole: true },
                mangle: true,
                codegen: { legalComments: 'inline' },
              },
            },
          }
        : {}),
    },
  };
  if (outDir) buildOptions.outDir = outDir;
  else if (mode === 'e2e') buildOptions.outDir = e2eBuildOutput;

  return {
    root: frontendRoot,
    appType: 'spa',
    base: '/',
    publicDir: 'public',
    envDir: false,
    ...(cacheDir ? { cacheDir } : {}),
    plugins: [
      buildLicensesPlugin(),
      ...(mode === 'e2e' ? [createE2EApplicationEntryPlugin()] : []),
      vue({
        template: {
          transformAssetUrls: {
            includeAbsolute: false,
          },
        },
      }),
    ],
    resolve: {
      dedupe: ['vue'],
      alias: {
        '@': sourceRoot,
      },
    },
    define: {
      __ISEEETL_RELEASE_ID__: JSON.stringify(releaseId),
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
      ...buildPublicEnvironmentDefinitions(loadedEnvironment),
    },
    build: buildOptions,
    server: {
      host: '0.0.0.0',
      port: serverConfiguration.port,
      strictPort: true,
      watch: {
        usePolling: true,
        interval: 1000,
        ignored: [
          '**/public/media/**',
          '**/public/profile/**',
          '**/public/upload/**',
        ],
      },
      allowedHosts: ['localhost'],
      cors: { origin: serverConfiguration.localOrigin },
      hmr: { overlay: true },
      ws: { clientPort: serverConfiguration.port },
      proxy: serverConfiguration.proxy,
      fs: {
        strict: true,
        allow: [frontendRoot],
        deny: [
          '.env',
          '.env.*',
          '.npmrc',
          '.yarnrc.yml',
          '*.{crt,pem,key,p12,pfx,cer,der}',
          '**/.git/**',
          '**/secrets/**',
          '**/credentials/**',
          '**/keys/**',
        ],
      },
      forwardConsole: false,
    },
    preview: {
      host: '0.0.0.0',
      port: serverConfiguration.port,
      strictPort: true,
      allowedHosts: ['localhost'],
      cors: { origin: serverConfiguration.localOrigin },
      proxy: serverConfiguration.proxy,
    },
  };
};

const viteConfigFactory = (environment = {}) => createViteConfig(environment);
viteConfigFactory.e2eBuildOutput = e2eBuildOutput;
viteConfigFactory.e2eRuntimeRoot = e2eRuntimeRoot;
viteConfigFactory.e2eApplicationEntryUrl = e2eApplicationEntryUrl;
viteConfigFactory.productApplicationEntryUrl = productApplicationEntryUrl;
viteConfigFactory.validateE2EBuildOutput = validateE2EBuildOutput;

module.exports = viteConfigFactory;
