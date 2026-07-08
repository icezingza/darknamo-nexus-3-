/** @type {import('ts-jest').JestConfigWithTsJest} */
// CommonJS config (package.json is "type":"module", so a .js config would be
// treated as ESM). ts-jest transpiles each test's TS graph to CJS using a
// dedicated tsconfig, avoiding the base config's bundler/noEmit settings.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }]
  }
};
