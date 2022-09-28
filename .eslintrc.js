/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'jest', 'simple-import-sort', 'import', 'unicorn', 'turbo'],
  env: {
    node: true,
    es6: true,
  },
  extends: ['eslint:recommended', 'plugin:jest/recommended', 'plugin:unicorn/recommended'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: ['./tsconfig.json', './packages/*/tsconfig.json'],
  },
  ignorePatterns: ['*.spec.ts', '*.integ.ts', '*.fixture.ts', '*.d.ts'],
  rules: {
    'turbo/no-undeclared-env-vars': 'error',
  },
  overrides: [
    {
      files: ['*.ts'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'plugin:prettier/recommended',
        'plugin:jest/recommended',
      ],
      rules: {
        'prefer-const': ['error', { destructuring: 'all' }],
        'prettier/prettier': 'warn',
        '@typescript-eslint/no-use-before-define': 'off', // enable for `const` `let` vars
        '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',
        '@typescript-eslint/no-non-null-assertion': 'off',
        // 'no-useless-escape': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        // '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-unsafe-return': 'warn',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        // '@typescript-eslint/no-misused-promises': 'off',
        // 'jest/expect-expect': 'off',
        // 'no-empty': 'off',
        // 'jest/valid-title': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
        // Low hanging fruits:
        '@typescript-eslint/no-unsafe-argument': 'warn', // explain
        // '@typescript-eslint/ban-types': 'off',
        '@typescript-eslint/require-await': 'off', //revisit this
        '@typescript-eslint/restrict-plus-operands': 'off',
        '@typescript-eslint/restrict-template-expressions': 'off',
        // 'jest/no-conditional-expect': 'off',
        // 'jest/no-export': 'off',
        '@typescript-eslint/no-empty-interface': 'off',
        '@typescript-eslint/consistent-type-imports': 'error',
        // https://github.com/lydell/eslint-plugin-simple-import-sort
        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',
        'import/first': 'error',
        'import/newline-after-import': 'error',
        'import/no-duplicates': 'error',
        'unicorn/filename-case': 'off',
        'unicorn/prevent-abbreviations': 'off',
        'unicorn/no-null': 'off',
        'unicorn/no-useless-switch-case': 'off',
      },
    },
  ],
  settings: {
    jest: {
      version: 29,
    },
  },
};
