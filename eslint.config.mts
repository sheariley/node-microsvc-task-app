import jseslint from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: {
      js: jseslint,
      '@typescript-eslint': tseslint.plugin,
    },
    extends: ['js/recommended', '@typescript-eslint/recommended'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-unused-var': 'warn',
      quotes: ['warn', 'single'],
      semi: ['warn', 'never'],
    },
    ignores: ['ui/ms-task-app-web/**'],
  },
  globalIgnores([
    '**/dist/**',
    'node_modules/**',
    '**/node_modules/**',
    '**/.next/**',
    '**/out/**',
    '**/build/**',
    '**/next-env.d.ts',
  ]),
  prettier,
])
