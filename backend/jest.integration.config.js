module.exports = {
  testEnvironment: 'node',
  maxWorkers: 1,
  testMatch: ['**/tests/integration/**/*.int.test.js'],
  globalSetup: '<rootDir>/tests/jest.mongo.globalSetup.js',
  globalTeardown: '<rootDir>/tests/jest.mongo.globalTeardown.js',
  setupFiles: ['<rootDir>/tests/jest.integration.environment.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.mongo.setup.js'],
  testTimeout: 30000,
  clearMocks: true,
  transformIgnorePatterns: ['/node_modules/(?!nodemailer-mock).+\\.js$'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
};
