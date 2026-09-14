module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  env: {
    node: true,
    jest: true
  },
  rules: {
    // Override shared rules for this package - more lenient for main app
    'no-console': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'prefer-const': 'off',
    'no-case-declarations': 'off',
    'no-empty': 'off',
    'no-constant-condition': 'off',
    'no-unreachable': 'off',
    'no-useless-escape': 'off'
  },
  ignorePatterns: [
    'dist/**',
    'build/**',
    '*.js'
  ]
};
