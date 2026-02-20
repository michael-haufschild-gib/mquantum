import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import jsdoc from 'eslint-plugin-jsdoc'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

// ---------------------------------------------------------------------------
// Custom plugin: project-rules
// ---------------------------------------------------------------------------

const ASSET_EXT_RE = /\.(webp|png|jpe?g|svg|gif|avif)['"]?\s*$/i
const HEX_COLOR_RE = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-f])/i
const FUNC_COLOR_RE = /\b(?:rgba?|hsla?|oklch|color-mix)\s*\(/i
const EMOJI_RE =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{231A}\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2934}\u{2935}\u{2B05}-\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}\u{200D}\u{FE0F}]/u

const RAW_HTML_CONTROLS = new Set(['input', 'select', 'button', 'textarea'])

function normalizePath(filename) {
  return filename.replace(/\\/g, '/')
}

function isUnderUiDir(filename) {
  return normalizePath(filename).includes('src/components/ui/')
}

const projectRulesPlugin = {
  meta: { name: 'project-rules', version: '1.0.0' },
  rules: {
    // ---- no-direct-asset-imports ----
    'no-direct-asset-imports': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow direct image/asset imports outside UI primitives' },
        messages: {
          noDirectAsset:
            'Direct asset imports are only allowed in src/components/ui/. Import via a UI primitive instead.',
        },
        schema: [],
      },
      create(context) {
        return {
          ImportDeclaration(node) {
            if (ASSET_EXT_RE.test(node.source.value) && !isUnderUiDir(context.filename)) {
              context.report({ node: node.source, messageId: 'noDirectAsset' })
            }
          },
        }
      },
    },

    // ---- no-hardcoded-colors ----
    'no-hardcoded-colors': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Disallow hardcoded color values; use Tailwind tokens or CSS variables',
        },
        messages: {
          noHardcodedColor:
            'Use Tailwind theme tokens or CSS variables instead of hardcoded color values.',
        },
        schema: [],
      },
      create(context) {
        const fp = normalizePath(context.filename)
        // Only .tsx files
        if (!fp.endsWith('.tsx')) return {}
        // Exemptions
        if (
          fp.endsWith('.wgsl.ts') ||
          fp.includes('.test.') ||
          fp.includes('.spec.') ||
          fp.includes('themeUtils') ||
          fp.endsWith('index.css') ||
          fp.includes('eslint.config') ||
          fp.includes('vite.config') ||
          fp.includes('vitest.config') ||
          fp.includes('tailwind.config')
        ) {
          return {}
        }

        function check(value, node) {
          if (typeof value !== 'string') return
          if (HEX_COLOR_RE.test(value) || FUNC_COLOR_RE.test(value)) {
            context.report({ node, messageId: 'noHardcodedColor' })
          }
        }

        return {
          Literal(node) {
            check(node.value, node)
          },
          TemplateLiteral(node) {
            for (const quasi of node.quasis) {
              check(quasi.value.raw, node)
            }
          },
        }
      },
    },

    // ---- no-emoji ----
    'no-emoji': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Disallow emoji characters in source code' },
        messages: {
          noEmoji: 'Emoji characters are not allowed in source code.',
        },
        schema: [],
      },
      create(context) {
        function check(value, node) {
          if (typeof value !== 'string') return
          if (EMOJI_RE.test(value)) {
            context.report({ node, messageId: 'noEmoji' })
          }
        }
        return {
          Literal(node) {
            check(node.value, node)
          },
          TemplateLiteral(node) {
            for (const quasi of node.quasis) {
              check(quasi.value.raw, node)
            }
          },
          JSXText(node) {
            check(node.value, node)
          },
        }
      },
    },

    // ---- no-raw-html-controls ----
    'no-raw-html-controls': {
      meta: {
        type: 'problem',
        docs: { description: 'Disallow raw HTML form elements outside UI primitives' },
        messages: {
          noRawHtml: 'Use UI primitives from src/components/ui/ instead of raw HTML elements.',
        },
        schema: [],
      },
      create(context) {
        if (isUnderUiDir(context.filename)) return {}
        return {
          JSXOpeningElement(node) {
            const name = node.name.type === 'JSXIdentifier' ? node.name.name : null
            if (name && RAW_HTML_CONTROLS.has(name)) {
              context.report({ node, messageId: 'noRawHtml' })
            }
          },
        }
      },
    },
  },
}

// ---------------------------------------------------------------------------
// ESLint flat config
// ---------------------------------------------------------------------------

export default [
  {
    ignores: ['dist', 'node_modules', 'scripts/**', 'playwright.config.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parser: tsparser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      jsdoc: jsdoc,
      'project-rules': projectRulesPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // JSDoc
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
          contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'],
        },
      ],
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-example': 'off',
      // Custom project rules
      'project-rules/no-direct-asset-imports': 'error',
      'project-rules/no-hardcoded-colors': 'error',
      'project-rules/no-emoji': 'error',
      'project-rules/no-raw-html-controls': 'error',
    },
  },
  // max-lines for .tsx component files
  {
    files: ['**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
]
