import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist/**', '**/node_modules/**', 'data/**', 'coverage/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    // Spec §3.1: outbound traffic goes through the restricted HTTP client only.
    files: ['packages/**/src/**/*.ts', 'apps/server/src/**/*.ts'],
    ignores: ['apps/server/src/cli/open.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Use the restricted outbound HTTP client (spec §3.1, SEC-09).' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'node:http', importNames: ['request', 'get'], message: 'Use the restricted outbound HTTP client.' },
            { name: 'node:https', message: 'Use the restricted outbound HTTP client.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.flat['recommended-latest'].rules,
      // SEC-08: untrusted text (listings, model output) is always rendered as text.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render untrusted content as text (SEC-08).',
        },
      ],
    },
  },
]);
