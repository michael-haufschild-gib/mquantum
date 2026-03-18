import js from '@eslint/js'
import reactX from '@eslint-react/eslint-plugin'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import jsdoc from 'eslint-plugin-jsdoc'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
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

// Matchers that assert existence/type but not correctness — they catch zero real bugs.
// Maps matcher name → custom error message.
// Matchers that pass for almost any value — they catch zero real bugs.
// toBeUndefined is intentionally excluded: asserting a key was stripped from
// serialization output or that invalid input produces no result is legitimate.
const SHALLOW_MATCHERS = {
  toBeDefined: 'Asserts existence, not correctness. Assert the specific expected value.',
  toBeTruthy: 'Too loose — passes for any truthy value. Assert the specific expected value.',
  toBeFalsy: 'Too loose — passes for any falsy value. Use toBe(false), toBe(null), or assert a specific outcome.',
}

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
        if (!fp.endsWith('.tsx')) return {}
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

    // ---- no-shallow-matchers ----
    'no-shallow-matchers': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Disallow shallow test matchers that assert existence/type instead of correctness',
        },
        messages: {
          noShallowMatcher: '{{ message }}',
        },
        schema: [],
      },
      create(context) {
        const fp = normalizePath(context.filename)
        if (!fp.includes('.test.') && !fp.includes('.spec.')) return {}

        function report(node, message) {
          context.report({ node, messageId: 'noShallowMatcher', data: { message } })
        }

        return {
          CallExpression(node) {
            // 1. Block shallow patterns in expect() argument — these coerce/reduce
            //    the value before it reaches the matcher, guaranteeing the matcher
            //    can never assert anything meaningful.
            if (node.callee.type === 'Identifier' && node.callee.name === 'expect') {
              const arg = node.arguments[0]
              if (arg) {
                if (arg.type === 'UnaryExpression' && arg.operator === 'typeof') {
                  report(node, 'expect(typeof x) asserts a type string, not a value. Assert the specific expected value.')
                  return
                }
                if (
                  arg.type === 'CallExpression' &&
                  arg.callee.type === 'MemberExpression' &&
                  arg.callee.object.name === 'Array' &&
                  arg.callee.property.name === 'isArray'
                ) {
                  report(node, 'expect(Array.isArray(...)) asserts a boolean. Assert the specific array contents instead.')
                  return
                }
                if (arg.type === 'UnaryExpression' && arg.operator === '!') {
                  report(node, 'expect(!x) or expect(!!x) coerces to boolean — too loose. Assert the specific expected value.')
                  return
                }
                if (
                  arg.type === 'CallExpression' &&
                  arg.callee.type === 'Identifier' &&
                  arg.callee.name === 'Boolean'
                ) {
                  report(node, 'expect(Boolean(x)) coerces to boolean — too loose. Assert the specific expected value.')
                  return
                }
                if (
                  arg.type === 'BinaryExpression' &&
                  ['!==', '!=', '===', '==', 'in'].includes(arg.operator)
                ) {
                  report(node, 'expect(x === y) passes a boolean to expect instead of the actual value. Use expect(x).toBe(y) for meaningful diffs.')
                  return
                }
                if (
                  arg.type === 'MemberExpression' &&
                  (arg.property.name === 'tagName' || arg.property.name === 'nodeName')
                ) {
                  report(node, 'expect(el.tagName) asserts a DOM tag string. Assert rendered content or accessible roles instead.')
                  return
                }
              }
            }

            if (node.callee.type !== 'MemberExpression') return

            const methodName = node.callee.property.name
            if (!methodName) return

            // 2. Matchers that accept literally any value — the test passes
            //    regardless of what the code under test actually returns.
            const isNot =
              node.callee.object.type === 'MemberExpression' &&
              node.callee.object.property.name === 'not'

            let shallowMessage = null

            if (SHALLOW_MATCHERS[methodName]) {
              shallowMessage = SHALLOW_MATCHERS[methodName]
            } else if (methodName === 'toBeNull' && isNot) {
              shallowMessage = '.not.toBeNull() asserts existence, not a specific value. Assert the expected value.'
            } else if (methodName === 'toBe' && node.arguments.length === 1) {
              const arg = node.arguments[0]
              // toBe('string') etc. — only meaningful after typeof, which is already
              // blocked above. Standalone, it asserts a type label, not a value.
              if (
                arg.type === 'Literal' &&
                ['string', 'object', 'boolean', 'number', 'function', 'symbol'].includes(arg.value)
              ) {
                shallowMessage = `toBe('${arg.value}') asserts a type string, not a value. Assert the specific expected value.`
              }
            }

            if (!shallowMessage) return

            // Walk up the member-expression chain to find expect()
            let obj = node.callee.object
            while (obj.type === 'CallExpression' && obj.callee.type === 'MemberExpression') {
              obj = obj.callee.object
            }
            if (obj.type === 'MemberExpression' && obj.property.name === 'not') {
              obj = obj.object
            }

            if (
              obj.type === 'CallExpression' &&
              obj.callee.type === 'Identifier' &&
              obj.callee.name === 'expect'
            ) {
              context.report({
                node: node.callee.property,
                messageId: 'noShallowMatcher',
                data: { message: shallowMessage },
              })
            }
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
    ignores: ['dist', 'coverage', 'node_modules', 'scripts/**', 'playwright.config.ts', 'src/wasm/**/pkg/**'],
  },

  // @eslint-react strict-typescript: registers all @eslint-react/* plugins + sets strict rule
  // defaults. No files filter or languageOptions — our config below provides both.
  reactX.configs['strict-typescript'],

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        // WebGPU API types (provided by @webgpu/types)
        GPUBindGroupEntry: 'readonly',
        GPUBindGroupLayoutEntry: 'readonly',
        GPUBlendState: 'readonly',
        GPUBufferMapState: 'readonly',
        GPUColorTargetState: 'readonly',
        GPUCompareFunction: 'readonly',
        GPUComputePassDescriptor: 'readonly',
        GPUComputePassTimestampWrites: 'readonly',
        GPUFeatureName: 'readonly',
        GPULoadOp: 'readonly',
        GPUQueryType: 'readonly',
        GPURenderPassColorAttachment: 'readonly',
        GPURenderPassDepthStencilAttachment: 'readonly',
        GPURenderPassDescriptor: 'readonly',
        GPURenderPassTimestampWrites: 'readonly',
        GPURenderPipelineDescriptor: 'readonly',
        GPUSamplerDescriptor: 'readonly',
        GPUTextureDimension: 'readonly',
        GPUTextureFormat: 'readonly',
        GPUTextureUsageFlags: 'readonly',
        GPUTextureViewDimension: 'readonly',
        GPUVertexBufferLayout: 'readonly',
      },
      parser: tsparser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-refresh': reactRefresh,
      jsdoc: jsdoc,
      'project-rules': projectRulesPlugin,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Import sorting
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // @typescript-eslint
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

      // ---------------------------------------------------------------------------
      // @eslint-react overrides
      // ---------------------------------------------------------------------------

      // Core correctness: upgrade warns → errors (AI code must not have stale deps or leaks)
      '@eslint-react/exhaustive-deps': 'error',
      '@eslint-react/no-unnecessary-use-prefix': 'error',

      // Stability: objects/values created inline in render cause infinite re-render loops —
      // extremely common AI mistake
      '@eslint-react/no-unstable-context-value': 'error',
      '@eslint-react/no-unstable-default-props': 'error',

      // Strict additions: catch superfluous patterns AI tends to over-generate
      '@eslint-react/no-class-component': 'error',
      '@eslint-react/no-useless-fragment': 'error',

      // Web API leaks: GPU app has RAF loops, resize observers, interval-based animation —
      // missing cleanup is a silent perf bug
      '@eslint-react/web-api/no-leaked-event-listener': 'error',
      '@eslint-react/web-api/no-leaked-interval': 'error',
      '@eslint-react/web-api/no-leaked-resize-observer': 'error',
      '@eslint-react/web-api/no-leaked-timeout': 'error',

      // DOM safety from strict
      '@eslint-react/dom/no-missing-button-type': 'error',
      '@eslint-react/dom/no-unsafe-target-blank': 'error',

      // Warn-level: real quality signals but not outright bugs
      '@eslint-react/no-unnecessary-use-callback': 'warn',
      '@eslint-react/no-unnecessary-use-memo': 'warn',
      '@eslint-react/purity': 'warn',

      // Disable inapplicable rules: this is a Vite SPA, hooks-only, React 19
      '@eslint-react/rsc/function-definition': 'off', // not a React Server Components project
      '@eslint-react/no-use-context': 'off',          // using useContext directly is fine
      '@eslint-react/no-context-provider': 'off',     // React 19 <Ctx> syntax is opt-in
      '@eslint-react/no-forward-ref': 'off',          // forwardRef is legitimate in this codebase

      // Disable rules that generate noise for legitimate patterns in this codebase
      '@eslint-react/set-state-in-effect': 'off',         // syncing external data into state via effect is intentional
      '@eslint-react/naming-convention/ref-name': 'off',  // cosmetic; large existing ref surface
      '@eslint-react/use-state': 'off',                   // setter naming convention is cosmetic
      '@eslint-react/no-array-index-key': 'off',          // static render lists use index as the only stable key

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

      // Complexity: error at 40 (hard limit), warn at 25 (aspiration)
      complexity: ['error', 40],

      // Custom project rules
      'project-rules/no-direct-asset-imports': 'error',
      'project-rules/no-hardcoded-colors': 'error',
      'project-rules/no-emoji': 'error',
      'project-rules/no-raw-html-controls': 'error',
      'project-rules/no-shallow-matchers': 'error',
    },
  },

  // max-lines for .tsx component files
  {
    files: ['**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  // max-lines for .ts files (non-shader, non-compute-pass, non-renderer)
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/rendering/webgpu/passes/*ComputePass.ts',
      'src/rendering/webgpu/passes/*Pass.ts',
      'src/rendering/webgpu/renderers/**',
      'src/rendering/webgpu/shaders/**',
      'src/rendering/webgpu/graph/**',
      'src/rendering/webgpu/core/**',
      'src/lib/geometry/extended/types.ts',
      'src/rendering/shaders/palette/presets.ts',
      'src/rendering/webgpu/passes/gizmoGeometry.ts',
      // Scene/export orchestrators: top-level pipeline wiring, legitimately large
      'src/rendering/webgpu/WebGPUScene.ts',
      'src/rendering/webgpu/scenePassSetup.ts',
      'src/rendering/webgpu/useExportRuntime.ts',
      // Central quantum state slice: orchestrates 7 quantum modes, dimension handling, presets
      'src/stores/slices/geometry/schroedingerSlice.ts',
      // TDSE mode setters: grid/PML/boundary config with CFL-coupled validation
      'src/stores/slices/geometry/setters/tdseSetters.ts',
      'src/tests/**',
    ],
    rules: {
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },
  // GPU rendering: elevated complexity limit for WebGPU pipeline code.
  // Compute passes handle multi-mode dispatch (7 quantum modes × render paths).
  // Cap at 65 — reduced from 80 after WebGPUScene decomposition.
  {
    files: [
      'src/rendering/webgpu/passes/**',
      'src/rendering/webgpu/renderers/**',
      'src/rendering/webgpu/graph/**',
    ],
    rules: {
      complexity: ['warn', 65],
    },
  },
  // Shader composition: composeSchroedingerShader() has inherent branching from
  // 10+ feature flags × quantum modes. The function is a declarative block
  // assembly DSL — splitting it would not reduce cognitive complexity.
  {
    files: ['src/rendering/webgpu/shaders/**'],
    rules: {
      complexity: ['warn', 80],
    },
  },
  // Complex React components: animation drawers and color preview render
  // mode-dependent UI for 7+ quantum modes, producing high branching complexity.
  {
    files: [
      'src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx',
      'src/components/sections/Faces/ColorPreview.tsx',
    ],
    rules: {
      complexity: ['warn', 55],
    },
  },
  // Preset normalization: backward-compat validation of arbitrary JSON produces
  // unavoidable per-field branching. Each branch validates one stored field.
  {
    files: [
      'src/stores/utils/presetNormalization.ts',
      'src/stores/presetManagerStore.ts',
      'src/stores/exportStore.ts',
    ],
    rules: {
      complexity: ['warn', 50],
    },
  },
  // Test files: mocks and stubs are intentionally defined inside test functions/beforeEach blocks
  {
    files: ['src/tests/**/*.{ts,tsx}'],
    rules: {
      '@eslint-react/component-hook-factories': 'off',
      '@eslint-react/no-unnecessary-use-callback': 'off',
      '@eslint-react/no-unnecessary-use-memo': 'off',
      '@eslint-react/purity': 'off',
    },
  },
  // WebGPU renderer classes: not React components; purity rule does not apply
  {
    files: ['src/rendering/**/*.ts'],
    rules: {
      '@eslint-react/purity': 'off',
    },
  },
  // Disable no-useless-assignment in GPU compute passes and shader files
  // where sequential offset incrementing (o++) is the standard uniform buffer packing pattern.
  // The final o++ in each section is intentionally unused — it maintains cursor consistency
  // and makes adding new fields safe.
  {
    files: [
      'src/rendering/webgpu/passes/*ComputePass.ts',
      'src/rendering/webgpu/shaders/**/*.wgsl.ts',
      'src/stores/presetManagerStore.ts',
      'src/stores/utils/presetNormalization.ts',
      'src/components/ui/Popover.tsx',
      'src/components/ui/Tabs.tsx',
      'src/components/sections/Faces/ColorPreview.tsx',
      'src/tests/rendering/shaders/**/*.test.ts',
    ],
    rules: {
      'no-useless-assignment': 'off',
    },
  },
]
