module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/backend/api/server.js', // Exclude server.js
    '!src/scripts/test.js'         // Exclude test.js
  ],
  verbose: true
};