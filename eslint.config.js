import js from '@eslint/js'
import reactX from '@eslint-react/eslint-plugin'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import jsdoc from 'eslint-plugin-jsdoc'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import testingLibrary from 'eslint-plugin-testing-library'
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

// DOM traversal methods and properties that bypass testing-library's
// user-centric query model, coupling tests to implementation details.
const DOM_TRAVERSAL_METHODS = new Set([
  'querySelector', 'querySelectorAll', 'closest',
  'getElementsByClassName', 'getElementsByTagName', 'getElementById',
])
const DOM_TRAVERSAL_PROPS = new Set([
  'parentElement', 'parentNode',
  'children', 'childNodes',
  'firstChild', 'lastChild', 'firstElementChild', 'lastElementChild',
  'nextSibling', 'previousSibling', 'nextElementSibling', 'previousElementSibling',
])

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
        if (!fp.endsWith('.ts') && !fp.endsWith('.tsx')) return {}
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
        // .ts files in rendering, stores, color/geometry/export libraries,
        // test factories, and canvas-based hooks define canonical defaults
        // or operate below Tailwind.
        if (fp.endsWith('.ts') && (
          fp.includes('src/rendering/') ||
          fp.includes('src/stores/') ||
          fp.includes('src/tests/factories/') ||
          fp.includes('src/lib/colors/') ||
          fp.includes('src/lib/geometry/') ||
          fp.includes('src/lib/export/') ||
          fp.includes('useDynamicFavicon')
        )) {
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

    // ---- no-dom-node-access ----
    'no-dom-node-access': {
      meta: {
        type: 'problem',
        docs: {
          description:
            'Disallow direct DOM traversal in test files — use testing-library queries instead',
        },
        messages: {
          noDomAccess:
            'Direct DOM traversal ({{ name }}) couples tests to implementation details. Use testing-library queries (getByRole, getByText, getByTestId) instead.',
        },
        schema: [],
      },
      create(context) {
        const fp = normalizePath(context.filename)
        // Only apply to unit/component tests (.test.), not Playwright e2e specs (.spec.)
        // E2e specs use querySelector inside page.evaluate() which is browser code, not test queries
        if (!fp.includes('.test.')) return {}
        // Allow in mock/helper files — they legitimately simulate DOM behavior
        if (fp.includes('__mocks__') || fp.includes('/helpers/')) return {}

        return {
          MemberExpression(node) {
            const prop = node.property
            if (!prop) return
            const name = prop.type === 'Identifier' ? prop.name : undefined
            if (!name) return

            if (DOM_TRAVERSAL_PROPS.has(name)) {
              context.report({ node: prop, messageId: 'noDomAccess', data: { name } })
            }
          },
          // Catches .querySelector(), .closest(), etc. as call expressions
          CallExpression(node) {
            if (node.callee.type !== 'MemberExpression') return
            const prop = node.callee.property
            const name = prop.type === 'Identifier' ? prop.name : undefined
            if (name && DOM_TRAVERSAL_METHODS.has(name)) {
              context.report({ node: prop, messageId: 'noDomAccess', data: { name } })
            }
          },
        }
      },
    },

    // ---- prefer-jest-dom-matchers ----
    // Replaces eslint-plugin-jest-dom (incompatible with ESLint 10).
    // Catches AI agents manually checking DOM properties instead of using
    // @testing-library/jest-dom matchers that produce better error messages.
    'prefer-jest-dom-matchers': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Prefer @testing-library/jest-dom matchers over manual DOM property assertions',
        },
        messages: {
          preferMatcher: '{{ message }}',
        },
        schema: [],
      },
      create(context) {
        const fp = normalizePath(context.filename)
        if (!fp.includes('.test.') && !fp.includes('.spec.')) return {}

        // Property access patterns inside expect() that should use jest-dom matchers
        const DOM_PROPERTY_MATCHERS = {
          textContent: 'Use expect(element).toHaveTextContent() instead of accessing .textContent directly.',
          innerHTML: 'Use expect(element).toContainHTML() or toHaveTextContent() instead of accessing .innerHTML.',
          className: 'Use expect(element).toHaveClass() instead of accessing .className directly.',
          value: 'Use expect(element).toHaveValue() instead of accessing .value directly.',
          disabled: 'Use expect(element).toBeDisabled() / toBeEnabled() instead of accessing .disabled directly.',
          checked: 'Use expect(element).toBeChecked() instead of accessing .checked directly.',
          selected: 'Use expect(element).toBeChecked() instead of accessing .selected directly.',
          required: 'Use expect(element).toBeRequired() instead of accessing .required directly.',
          readOnly: 'Use expect(element).toHaveAttribute("readonly") instead of accessing .readOnly directly.',
        }

        // classList.contains('x') → toHaveClass('x')
        const CLASSLIST_METHODS = new Set(['contains', 'toggle'])

        function report(node, message) {
          context.report({ node, messageId: 'preferMatcher', data: { message } })
        }

        return {
          CallExpression(node) {
            // Pattern: expect(el.property).toBe/toEqual/toContain(...)
            if (
              node.callee.type === 'Identifier' &&
              node.callee.name === 'expect' &&
              node.arguments.length >= 1
            ) {
              const arg = node.arguments[0]
              if (arg.type === 'MemberExpression' && arg.property.type === 'Identifier') {
                const propName = arg.property.name
                if (DOM_PROPERTY_MATCHERS[propName]) {
                  report(arg.property, DOM_PROPERTY_MATCHERS[propName])
                }
                // expect(el.classList.contains('x')).toBe(true) → toHaveClass
                if (propName === 'classList') {
                  report(arg.property, 'Use expect(element).toHaveClass() instead of accessing .classList directly.')
                }
              }
              // expect(el.classList.contains('x')) — nested call
              if (
                arg.type === 'CallExpression' &&
                arg.callee.type === 'MemberExpression' &&
                arg.callee.property.type === 'Identifier' &&
                CLASSLIST_METHODS.has(arg.callee.property.name) &&
                arg.callee.object.type === 'MemberExpression' &&
                arg.callee.object.property.type === 'Identifier' &&
                arg.callee.object.property.name === 'classList'
              ) {
                report(arg, 'Use expect(element).toHaveClass() instead of classList.contains().')
              }
              // expect(el.getAttribute('x')).toBe('y') → toHaveAttribute
              if (
                arg.type === 'CallExpression' &&
                arg.callee.type === 'MemberExpression' &&
                arg.callee.property.type === 'Identifier' &&
                arg.callee.property.name === 'getAttribute'
              ) {
                report(arg, 'Use expect(element).toHaveAttribute() instead of getAttribute().')
              }
              // expect(el.style.prop) → toHaveStyle
              if (
                arg.type === 'MemberExpression' &&
                arg.object.type === 'MemberExpression' &&
                arg.object.property.type === 'Identifier' &&
                arg.object.property.name === 'style'
              ) {
                report(arg, 'Use expect(element).toHaveStyle() instead of accessing .style directly.')
              }
              // expect(document.activeElement).toBe(el) → toHaveFocus
              if (
                arg.type === 'MemberExpression' &&
                arg.object.type === 'Identifier' &&
                arg.object.name === 'document' &&
                arg.property.type === 'Identifier' &&
                arg.property.name === 'activeElement'
              ) {
                report(arg, 'Use expect(element).toHaveFocus() instead of checking document.activeElement.')
              }
            }
          },
        }
      },
    },

    // ---- no-flaky-click-selectors ----
    // E2E tests: .click() targets must be obtained via getByTestId, not getByText/getByRole/etc.
    // Flaky selectors couple tests to display text or DOM structure that breaks on any UI change.
    'no-flaky-click-selectors': {
      meta: {
        type: 'problem',
        docs: { description: 'E2E click targets must use getByTestId, not text/role/label selectors' },
        messages: {
          noFlakyClick:
            '.click() target must be obtained via getByTestId(). Using {{ method }}() produces flaky selectors that break on text or DOM changes.',
        },
        schema: [],
      },
      create(context) {
        const fp = normalizePath(context.filename)
        if (!fp.includes('.spec.')) return {}

        // Methods that produce flaky locators when used as click targets
        const FLAKY_METHODS = new Set([
          'getByText', 'getByRole', 'getByLabel', 'getByPlaceholder',
          'getByAltText', 'getByTitle',
        ])

        return {
          CallExpression(node) {
            // Match: <expr>.click(...)
            if (
              node.callee.type !== 'MemberExpression' ||
              node.callee.property.type !== 'Identifier' ||
              node.callee.property.name !== 'click'
            ) return

            // Walk back through the chain to find the query method
            let obj = node.callee.object
            // Handle chained calls like page.getByText('x').first().click()
            while (obj.type === 'CallExpression' && obj.callee.type === 'MemberExpression') {
              const method = obj.callee.property
              if (method.type === 'Identifier' && FLAKY_METHODS.has(method.name)) {
                context.report({
                  node: method,
                  messageId: 'noFlakyClick',
                  data: { method: method.name },
                })
                return
              }
              obj = obj.callee.object
            }
            // Direct call: page.getByText('x').click()
            if (obj.type === 'CallExpression' && obj.callee.type === 'Identifier') {
              const name = obj.callee.name
              if (FLAKY_METHODS.has(name)) {
                context.report({
                  node: obj.callee,
                  messageId: 'noFlakyClick',
                  data: { method: name },
                })
              }
            }
          },
        }
      },
    },

    // ---- no-silent-gpu-skip ----
    // E2E tests must use requireWebGPU(page, test.info()) — never hasWebGPU() or test.skip with GPU conditions.
    // Silent skips let AI agents claim "all tests passed" when WebGPU was never tested.
    'no-silent-gpu-skip': {
      meta: {
        type: 'problem',
        docs: { description: 'E2E tests must hard-fail on missing WebGPU, not silently skip' },
        messages: {
          noGpuSkip:
            'Do not use test.skip() to skip when GPU is ABSENT. Use requireWebGPU(page, test.info()) which hard-fails unless ALLOW_GPU_SKIP=1 is set.',
        },
        schema: [],
      },
      create(context) {
        const fp = normalizePath(context.filename)
        if (!fp.includes('.spec.')) return {}

        return {
          CallExpression(node) {
            // Ban: test.skip(!hasGPU, ...) or test.skip(!await hasWebGPU(...), ...)
            // These silently skip GPU tests when WebGPU is unavailable.
            // Allow: test.skip(await hasWebGPU(...), ...) — legitimate reverse check
            // for testing the fallback path when GPU IS available.
            if (
              node.callee.type !== 'MemberExpression' ||
              node.callee.object.type !== 'Identifier' ||
              node.callee.object.name !== 'test' ||
              node.callee.property.type !== 'Identifier' ||
              node.callee.property.name !== 'skip' ||
              node.arguments.length === 0
            ) return

            const arg = node.arguments[0]
            const src = context.sourceCode.getText(arg)
            // Only flag negated GPU checks: !hasGPU, !hasWebGPU, !(await hasWebGPU(...))
            if (/^!.*(?:gpu|webgpu)/i.test(src)) {
              context.report({ node, messageId: 'noGpuSkip' })
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
    ignores: ['dist', 'coverage', 'node_modules', 'scripts/!(playwright)/**', 'playwright.config.ts', 'src/wasm/**/pkg/**'],
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
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
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
      '@eslint-react/no-clone-element': 'off',         // single use in DropdownMenu trigger injection — intentional pattern

      // Disable rules that generate noise for legitimate patterns in this codebase
      // set-state-in-effect: 10+ components sync external data (GPU state, subscriptions,
      // browser APIs) into React state via effects — all conditionally guarded.
      // With --max-warnings 0 in lint-staged, scoping to individual files would add
      // noise without preventing real bugs; the pattern is pervasive and correct here.
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/naming-convention/ref-name': 'off',  // cosmetic; large existing ref surface
      '@eslint-react/use-state': 'off',                   // setter naming convention is cosmetic

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
      // require-param/returns/example: not enforced via lint. JSDoc presence is
      // required (require-jsdoc: error); content quality is enforced via code review.
      // Enabling these at 'error' would flag hundreds of existing functions;
      // 'warn' is equivalent to 'error' under --max-warnings 0 in lint-staged.
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-example': 'off',

      // Logging: use structured logger from @/lib/logger instead of console.*
      // ErrorBoundary files are exempt — they must log in production.
      'no-console': 'error',

      // Complexity: error at 30 (hard limit for most code)
      complexity: ['error', 30],

      // Custom project rules
      'project-rules/no-direct-asset-imports': 'error',
      'project-rules/no-hardcoded-colors': 'error',
      'project-rules/no-emoji': 'error',
      'project-rules/no-raw-html-controls': 'error',
      'project-rules/no-shallow-matchers': 'error',
      'project-rules/no-dom-node-access': 'error',
    },
  },

  // Allow console.* in error boundaries (must log in production) and the logger itself
  {
    files: [
      'src/lib/logger.ts',
      'src/components/ui/ErrorBoundary.tsx',
      'src/components/canvas/CanvasErrorBoundary.tsx',
    ],
    rules: {
      'no-console': 'off',
    },
  },

  // max-lines for .tsx component files
  {
    files: ['**/*.tsx'],
    rules: {
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  // max-lines for .ts files (tests excluded — test length reflects coverage breadth)
  {
    files: ['src/**/*.ts'],
    ignores: ['src/tests/**'],
    rules: {
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },
  // ─── Test files: anti-slop rules for AI coding agents ─────────────────────
  {
    files: ['src/tests/**/*.{test,spec}.{ts,tsx}'],
    plugins: {
      'testing-library': testingLibrary,
    },
    rules: {
      // testing-library/flat/react recommended (all rules from the preset)
      ...testingLibrary.configs['flat/react'].rules,

      // Escalate: force screen.* queries, ban DOM traversal, ban container usage
      'testing-library/prefer-screen-queries': 'error',
      'testing-library/no-node-access': 'error',
      'testing-library/no-container': 'error',
      'testing-library/await-async-queries': 'error',
      'testing-library/prefer-find-by': 'error',
      'testing-library/prefer-presence-queries': 'error',
      'testing-library/no-render-in-lifecycle': 'error',
      'testing-library/no-debugging-utils': 'warn',
      'testing-library/prefer-explicit-assert': 'warn',

      // Custom jest-dom replacement (eslint-plugin-jest-dom is ESLint 10 incompatible)
      'project-rules/prefer-jest-dom-matchers': 'error',

      // Ban .skip abuse — AI agents love to skip failing tests instead of fixing them
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.object.name="it"][callee.property.name="skip"]',
          message: 'No it.skip — fix or remove the test.',
        },
        {
          selector: 'CallExpression[callee.object.name="test"][callee.property.name="skip"]',
          message: 'No test.skip — fix or remove the test.',
        },
        {
          selector: 'CallExpression[callee.object.name="describe"][callee.property.name="skip"]',
          message: 'No describe.skip — fix or remove the test suite.',
        },
      ],
    },
  },
  // Test files (all): relax React rules that conflict with test patterns
  {
    files: ['src/tests/**/*.{ts,tsx}'],
    rules: {
      '@eslint-react/component-hook-factories': 'off',
      '@eslint-react/no-unnecessary-use-callback': 'off',
      '@eslint-react/no-unnecessary-use-memo': 'off',
      '@eslint-react/purity': 'off',
      'no-console': 'off',
    },
  },
  // Non-component tests: local render() helpers are not @testing-library/react render
  {
    files: [
      'src/tests/rendering/**/*.test.{ts,tsx}',
      'src/tests/lib/**/*.test.{ts,tsx}',
      'src/tests/wasm/**/*.test.{ts,tsx}',
      'src/tests/integration/**/*.test.{ts,tsx}',
    ],
    rules: {
      'testing-library/render-result-naming-convention': 'off',
    },
  },
  // WebGPU renderer classes: not React components; purity rule does not apply
  {
    files: ['src/rendering/**/*.ts'],
    rules: {
      '@eslint-react/purity': 'off',
    },
  },
  // Pure library functions: explicit return types prevent unintended type widening
  // in physics, math, and utility code where type precision matters.
  {
    files: ['src/lib/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
      }],
    },
  },
  // Disable no-useless-assignment in GPU compute passes and shader files
  // where sequential offset incrementing (o++) is the standard uniform buffer packing pattern.
  // The final o++ in each section is intentionally unused — it maintains cursor consistency
  // and makes adding new fields safe.
  {
    files: [
      'src/rendering/webgpu/passes/*ComputePass*.ts',
      'src/rendering/webgpu/shaders/**/*.wgsl.ts',
      'src/tests/rendering/shaders/**/*.test.ts',
    ],
    rules: {
      'no-useless-assignment': 'off',
    },
  },
  // GPU pipeline code: uniform packing, compute pass orchestration, and render graph
  // execution have inherently high cyclomatic complexity from branching on quantum modes,
  // representation types, and feature flags. These functions are linear sequences of
  // conditional setup, not deeply nested logic. Limit raised to 40.
  {
    files: [
      'src/rendering/webgpu/passes/**/*.ts',
      'src/rendering/webgpu/renderers/**/*.ts',
      'src/rendering/webgpu/graph/WebGPURenderGraph.ts',
      'src/rendering/webgpu/useExportRuntime.ts',
      'src/rendering/webgpu/shaders/schroedinger/compose.ts',
      'src/rendering/webgpu/shaders/schroedinger/composeBlockBuilders.ts',
    ],
    rules: {
      complexity: ['error', 40],
    },
  },
  // Complex form components, hooks, and store orchestration: conditional rendering for
  // quantum mode configurations, keyboard shortcuts dispatch tables, video capture,
  // and scene load/save orchestration create inherent branching. Limit raised to 35.
  {
    files: [
      'src/components/sections/Advanced/SchroedingerQuantumEffectsSection.tsx',
      'src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx',
      'src/hooks/useKeyboardShortcuts.ts',
      'src/lib/export/video.ts',
      'src/stores/presetManagerStore.ts',
    ],
    rules: {
      complexity: ['error', 35],
    },
  },
  // Import boundary: render passes must not import state stores directly.
  // Store reads go through the render graph's ctx.stores pattern (set up in useSceneStoreWiring).
  // Allowed via negation patterns:
  //   - Diagnostic stores (*DiagnosticsStore) — write-direction: passes push metrics to UI
  //   - simulationStateStore — TDSE compute pass manages simulation lifecycle
  //   - performanceStore — TemporalDepthCapturePass reads temporal reprojection flag
  //   - Store defaults — static config, no runtime coupling
  //   - Type-only imports (allowTypeImports: true)
  {
    files: ['src/rendering/webgpu/passes/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '@/stores/*',
            '!@/stores/defaults',
            '!@/stores/defaults/*',
            '!@/stores/*DiagnosticsStore',
            '!@/stores/simulationStateStore',
            '!@/stores/performanceStore',
          ],
          allowTypeImports: true,
          message: 'Render passes access stores via ctx.stores. Only diagnostic stores (write-direction), simulationStateStore, performanceStore, and defaults/* are exempt.',
        }],
      }],
    },
  },
  // Static render lists (ticks, swatches, menu items, energy diagrams, key bindings)
  // use array index as key because items are never reordered, added, or removed.
  // Components outside these dirs (canvas, controls, presets) keep the rule active
  // to catch index-key bugs in dynamic lists.
  {
    files: [
      'src/components/ui/**/*.tsx',
      'src/components/layout/**/*.tsx',
      'src/components/sections/**/*.tsx',
      'src/components/overlays/**/*.tsx',
    ],
    rules: {
      '@eslint-react/no-array-index-key': 'off',
    },
  },
  // ─── E2E spec files: enforce stable selectors ────────────────────────────
  {
    files: ['scripts/playwright/**/*.{ts,spec.ts}'],
    plugins: {
      'project-rules': projectRulesPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      parser: tsparser,
      parserOptions: {
        project: null,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Disable type-aware rules that require tsconfig project
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // E2E specs run in Node.js (Playwright) but contain browser code inside page.evaluate()
      'jsdoc/require-jsdoc': 'off',
      'no-console': 'off',
      // Playwright fixture `use()` is not React's `use` hook — disable hooks rule
      '@eslint-react/rules-of-hooks': 'off',
      // E2E selector discipline
      'project-rules/no-flaky-click-selectors': 'error',
      // E2E GPU discipline — prevent silent GPU test skips
      'project-rules/no-silent-gpu-skip': 'error',
    },
  },
]
