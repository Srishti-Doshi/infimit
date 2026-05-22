/**
 * ESLint config — frontend (React 18, TypeScript strict, accessibility).
 *
 * Architectural decisions:
 *  - No `parserOptions.project`: type-aware lint rules add little value in a
 *    UI-heavy scaffold and require a separate tsconfig.eslint.json (which
 *    bit us on the backend). We can opt back in later if we need rules like
 *    `@typescript-eslint/no-floating-promises`.
 *  - jsx-a11y is enabled from day 1 — accessibility is a Subphase 1 deliverable
 *    per Frontend_Handler_Documentation.md §"Accessibility from Day 1".
 *  - `prettier` config must come last so it disables conflicting formatting rules.
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'jsx-a11y'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier',
  ],
  rules: {
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.config.js', '*.config.ts'],
};
