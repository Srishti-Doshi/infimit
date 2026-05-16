import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@/config$': '<rootDir>/src/config',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/middleware$': '<rootDir>/src/middleware',
    '^@/middleware/(.*)$': '<rootDir>/src/middleware/$1',
    '^@/shared$': '<rootDir>/src/shared',
    '^@/shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@/modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@/jobs/(.*)$': '<rootDir>/src/jobs/$1',
  },
  clearMocks: true,
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
};

export default config;
