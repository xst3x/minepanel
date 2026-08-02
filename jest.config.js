// Minimal Jest config: only the frontend minecraftLog parser and its test
// need TypeScript support, which the default babel-jest can't provide
// (no @babel/preset-typescript installed). Everything else keeps the
// default babel-jest transform, so existing tests are unaffected.
module.exports = {
  transform: {
    '^.*minecraftLog\\.test\\.ts$': '<rootDir>/jest-transform-ts.js',
    '^.*minecraftLog\\.ts$': '<rootDir>/jest-transform-ts.js',
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
};
