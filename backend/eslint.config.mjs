import globals from 'globals';

export default [
  {
    ignores: [
      '**/*.json',
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'build/**',
      '.cache/**',
      '.nyc_output/**',
      'public/media/**',
      'public/profile/**',
      'public/upload/**',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: globals.jest,
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];
