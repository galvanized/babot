/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Redirect all babotdata.json requires to the test fixture so modules load
  // without needing a real bot-token config file.
  moduleNameMapper: {
    'babotdata\\.json$': '<rootDir>/tests/__fixtures__/babotdata.json',
  },
};
