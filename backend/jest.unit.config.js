module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/unit/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/jest.unit.environment.js'],
  clearMocks: true,
  moduleNameMapper: {
    '^supertest$': '<rootDir>/tests/unit/_helpers/supertestStub.js',
  },
  transformIgnorePatterns: ['/node_modules/(?!nodemailer-mock).+\\.js$'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
};
