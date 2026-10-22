import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default defineConfig(
  globalIgnores([
    'dist/',
    'coverage/',
    'test-results/',
    'playwright-report/',
    'blob-report/',
    'android/',
    'ios/',
    'data/',
    '.goals/',
    '.playwright-mcp/',
  ]),
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: {
      parserOptions: {
        extraFileExtensions: ['.svelte'],
      },
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    files: [
      'scripts/**/*.ts',
      'tests/**/*.ts',
      'e2e/**/*.ts',
      '*.config.ts',
      '*.config.js',
      '**/*.test.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
