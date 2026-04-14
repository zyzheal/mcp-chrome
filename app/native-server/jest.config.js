/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],

  // Only map problematic external packages
  moduleNameMapper: {
    // Handle chrome-devtools-frontend imports with mock (this package doesn't work in Jest)
    '^chrome-devtools-frontend/(.*)$': '<rootDir>/src/shims/devtools.ts',
  },

  // Transform configuration
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // Override tsconfig for Jest testing - use CommonJS for compatibility
          target: 'ES2018',
          module: 'CommonJS',
          moduleResolution: 'Node',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          declaration: false,
          sourceMap: true,
          isolatedModules: true,
          baseUrl: '.',
          paths: {
            'chrome-devtools-frontend/*': ['src/shims/devtools.ts'],
          },
        },
      },
    ],
  },

  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/scripts/**/*',
    '!src/shims/**/*',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',

  // Disable coverage thresholds for now - project needs more tests
  coverageThreshold: undefined,

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Timeout for tests
  testTimeout: 10000,
};
