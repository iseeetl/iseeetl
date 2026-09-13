import vue from 'eslint-plugin-vue';
import globals from 'globals';

const browserGlobals = {
  ...globals.browser,
  __ISEEETL_RELEASE_ID__: 'readonly',
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'tests_output/**', 'coverage/**'],
  },
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.{js,mjs,vue}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      'vue/multi-word-component-names': 'off',
      'vue/no-v-for-template-key-on-child': 'off',
    },
  },
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      globals: browserGlobals,
    },
  },
  {
    files: ['vite.config.js', 'nightwatch.config.js', 'scripts/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
  },
  {
    files: ['vitest.config.mjs', 'scripts/**/*.mjs', 'tests/build-integration/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['tests/e2e/specs/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.commonjs,
      },
    },
  },
  {
    files: ['tests/e2e/runtime/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: browserGlobals,
    },
  },
  {
    files: ['tests/unit/**/*.js'],
    languageOptions: {
      globals: {
        ...browserGlobals,
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
];
