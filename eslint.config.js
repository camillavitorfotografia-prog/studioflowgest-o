import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'node_modules',
    'src/vendor/**',
    'tmp/**',
    '.vercel/**',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // O projeto não usa React Compiler. Estas regras são recomendações do
      // compilador experimental e geravam erros sem indicar falha de runtime.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/refs': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // Código legado não utilizado permanece visível como dívida técnica,
      // mas não impede build/deploy. Erros reais de sintaxe e Hooks continuam
      // bloqueando o lint.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'no-useless-assignment': 'warn',
    },
  },
])
