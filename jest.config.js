module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ],
  moduleNameMapper: {
    '^../src/(.*)$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false
    }]
  },
  extensionsToTreatAsEsm: [],
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch)/)'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
