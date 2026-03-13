module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    jest: true,
    es6: true
  },
  rules: {
    // Override shared rules for this package - more lenient for main app
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    'no-inner-declarations': 'off',
    'no-useless-catch': 'off',
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
