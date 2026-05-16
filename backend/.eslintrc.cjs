/**
 * ESLint config — backend (TypeScript, Node 20).
 *
 * Architectural rules enforced (per docs/12-folder-structure.md §12.2 footer):
 *  - `shared/` must not import from `modules/`
 *  - cross-module imports go through `modules/<name>/index.ts` only
 *
 * The `no-restricted-imports` rules below codify the public-surface rule.
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: ['./tsconfig.eslint.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@/modules/*/repository', '@/modules/*/service', '@/modules/*/controller', '@/modules/*/routes', '@/modules/*/validator'],
            message: 'Import from the module barrel (@/modules/<name>) instead of deep paths.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ['src/shared/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/modules/*', '@/middleware/*'],
                message: 'shared/ cannot import from modules/ or middleware/.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['tests/**/*.ts'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
  ],
  ignorePatterns: ['dist', 'coverage', 'node_modules'],
};
