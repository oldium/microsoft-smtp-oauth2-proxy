/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

/** @type {import('jest').Config} */
const config = {
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: false,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: "v8",

  // An array of file extensions your modules use
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],

  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
  // moduleNameMapper: {},
  moduleNameMapper: {
    '^(punycode\\.js)$': '$1',
    '^(base32\\.js)$': '$1',
    '^(ipaddr\\.js)$': '$1',
    '^(.+)\\.js$': '$1',
    '^@ms-smtp/([^/]*)(.*)$': '<rootDir>/packages/$1/src$2'
  },

  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/packages/server/src/smtp/test.*.ts",
    "<rootDir>/packages/server/tests/smtp/lib/test.ts",
    "<rootDir>/build/",
    "<rootDir>/?.*/dist/"
  ],

  // A map from regular expressions to paths to transformers
  transform: {
    '^.+\\.(t|j)sx?$': [
        '@swc-node/jest',
      {
        target: 'esnext',
        module: 'es6',
        dynamicImport: true,
        esModuleInterop: true,
        strict: true,
      }
    ],
  },

  // Whether to use watchman for file crawling
  // watchman: true,
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
};

export default config;
