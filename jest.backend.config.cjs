module.exports = {
  testEnvironment: '<rootDir>/tests/backend-environment.cjs',
  setupFilesAfterEnv: ['<rootDir>/tests/setup-backend.cjs'],
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: { '^\\.\\./src/(?!frontend/)(.*)$': '<rootDir>/dist/src/$1' },
  transform: { '^.+\\.ts$': '<rootDir>/tests/typescript-transformer.cjs' },
};
