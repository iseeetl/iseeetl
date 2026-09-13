import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defineConfig, mergeConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
const viteConfig = require('./vite.config.js');
const baseConfig = await viteConfig({ command: 'serve', mode: 'test' });
const testUtilsEntry = fileURLToPath(
  new URL('./node_modules/@vue/test-utils/dist/vue-test-utils.esm-bundler.mjs', import.meta.url)
);
baseConfig.define.__ISEEETL_RELEASE_ID__ = JSON.stringify('unit-test');

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        '@vue/test-utils': testUtilsEntry,
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['tests/unit/**/*.spec.js'],
      setupFiles: ['tests/unit/setup.js'],
      server: {
        deps: {
          inline: ['@vue/test-utils'],
        },
      },
      pool: 'threads',
      fileParallelism: true,
      maxWorkers: 4,
      clearMocks: true,
      restoreMocks: true,
      unstubGlobals: true,
      unstubEnvs: true,
    },
  })
);
