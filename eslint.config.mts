import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  eslintPluginPrettierRecommended,
  tseslint.configs.recommended,
  globalIgnores([
    'dist/**',
    'node_modules/**'
  ]),
  {
    rules: {
      quotes: ['warn', 'single'],
      semi: ['warn', 'never'],
    },
  },
  {
    extends: [
      'prettier'
    ]
  }
])
