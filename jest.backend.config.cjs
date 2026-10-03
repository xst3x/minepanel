module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: { '^\\.\\./src/(?!frontend/)(.*)$': '<rootDir>/dist/src/$1' },
  transform: { '^.+\\.ts$': '<rootDir>/tests/typescript-transformer.cjs' },
};
