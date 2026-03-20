/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],

  rules: {
    // ── TAILWIND CSS 4 COMPATIBILITY ──────────────────────────
    // Tailwind 4 uses @theme, @utility, @apply — not known to Stylelint.
    'at-rule-no-unknown': [
      true,
      { ignoreAtRules: ['theme', 'utility', 'layer', 'apply', 'tailwind', 'plugin', 'config'] },
    ],
    'function-no-unknown': [true, { ignoreFunctions: ['oklch', 'color-mix', 'theme'] }],
    'import-notation': 'string',

    // ── AI SLOP: COLOR SYSTEM (oklch only) ────────────────────
    // AI agents default to hex (#fff) and rgb(). This project uses oklch()
    // exclusively for perceptual uniformity. Any non-oklch color is a
    // vibecoded shortcut that bypasses the design token system.
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'hwb'],

    // ── AI SLOP: !important ABUSE ─────────────────────────────
    // AI agents spray !important to override specificity issues they created.
    // Legitimate uses (utility overrides, drag states) require an inline
    // disable comment with a reason — making each usage a conscious decision.
    'declaration-no-important': true,

    // ── AI SLOP: VENDOR PREFIX SPAM ───────────────────────────
    // AI adds -webkit-/-moz- for properties that autoprefixer handles or
    // that have been unprefixed for years. Only properties with NO standard
    // equivalent are allowed.
    'value-no-vendor-prefix': true,
    'property-no-vendor-prefix': [
      true,
      {
        ignoreProperties: [
          'font-smoothing', // -webkit-font-smoothing (no standard equivalent)
          'osx-font-smoothing', // -moz-osx-font-smoothing (no standard equivalent)
          'overflow-style', // -ms-overflow-style (scrollbar-width is the standard)
        ],
      },
    ],

    // ── AI SLOP: PHYSICAL PROPERTIES ──────────────────────────
    // Styleguide mandates logical properties (margin-inline-start, not
    // margin-left). AI agents trained on older code default to physical.
    'property-disallowed-list': [
      // Box model physical directions → use inline/block equivalents
      'margin-left',
      'margin-right',
      'padding-left',
      'padding-right',
      'border-left',
      'border-right',
      'border-left-width',
      'border-right-width',
      'border-left-color',
      'border-right-color',
      'border-left-style',
      'border-right-style',
      // Physical border-radius → use logical (border-start-start-radius etc.)
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-left-radius',
      'border-bottom-right-radius',
      // Obsolete layout primitives → use flexbox/grid
      'float',
      'clear',
    ],

    // ── AI SLOP: MEDIA QUERY ABUSE ────────────────────────────
    // Styleguide: clamp() for fluid sizing, container queries for layout.
    // Breakpoint media queries are the #1 sign of AI-pasted responsive code.
    // Allowed: prefers-reduced-motion, prefers-color-scheme, print, @supports.
    'media-feature-name-disallowed-list': [
      'min-width',
      'max-width',
      'min-height',
      'max-height',
      'min-device-width',
      'max-device-width',
      'device-width',
      'device-height',
    ],

    // ── AI SLOP: SPECIFICITY CHAOS ────────────────────────────
    // AI generates over-qualified selectors to "fix" cascade issues,
    // creating specificity debt that requires !important to override later.
    'selector-max-id': 0,
    'selector-max-specificity': '0,4,4',
    'selector-max-compound-selectors': 4,
    'selector-max-universal': 1,
    'max-nesting-depth': [3, { ignoreAtRules: ['utility', 'layer', 'theme'] }],

    // ── AI SLOP: COPY-PASTE ARTIFACTS ─────────────────────────
    // Duplicate properties/selectors from iterative AI edits that paste
    // similar blocks without checking what already exists.
    'declaration-block-no-duplicate-properties': [
      true,
      { ignore: ['consecutive-duplicates-with-different-syntaxes'] },
    ],
    'no-duplicate-selectors': true,
    'block-no-empty': true,
    'comment-no-empty': true,
    'no-duplicate-at-import-rules': true,

    // ── AI SLOP: UNIT RESTRICTIONS ────────────────────────────
    // Print/physical units copied from Stack Overflow or AI training data.
    'unit-disallowed-list': ['cm', 'mm', 'in', 'pt', 'pc'],

    // ── VALUE QUALITY ─────────────────────────────────────────
    'shorthand-property-no-redundant-values': true,
    'declaration-block-no-shorthand-property-overrides': true,
    'font-family-no-duplicate-names': true,
    'font-family-name-quotes': 'always-where-recommended',
    'font-family-no-missing-generic-family-keyword': true,
    'number-max-precision': 4,
    'length-zero-no-unit': [true, { ignore: ['custom-properties'] }],

    // ── PSEUDO-ELEMENT COMPATIBILITY ──────────────────────────
    // WebKit scrollbar and input pseudo-elements have no standard equivalent.
    'selector-pseudo-element-no-unknown': [
      true,
      {
        ignorePseudoElements: [
          '-webkit-scrollbar',
          '-webkit-scrollbar-track',
          '-webkit-scrollbar-thumb',
          '-webkit-scrollbar-corner',
          '-webkit-inner-spin-button',
          '-webkit-outer-spin-button',
        ],
      },
    ],

    // ── TAILWIND @utility NESTING ─────────────────────────────
    // @utility blocks use & for nesting without a parent selector in scope.
    // Stylelint doesn't understand @utility semantics — disable this check.
    'nesting-selector-no-missing-scoping-root': null,

    // ── DESCENDING SPECIFICITY ────────────────────────────────
    // Disabled: produces false positives with CSS nesting inside @utility.
    'no-descending-specificity': null,

    // ── NAMING & FORMATTING ─────────────────────────────────
    // Project uses diverse custom property naming (--bg-*, --token-*, --theme-*).
    'custom-property-pattern': null,
    // Keyframe names follow existing camelCase convention (fadeIn, scaleIn).
    'keyframes-name-pattern': null,
    // Font family names preserve original casing (BlinkMacSystemFont, Roboto).
    'value-keyword-case': [
      'lower',
      {
        ignoreKeywords: ['BlinkMacSystemFont', 'Roboto', 'Menlo', 'Monaco'],
      },
    ],
    // Formatting handled by Prettier — disable empty-line enforcement
    // that conflicts with dense @theme/@layer token blocks.
    'custom-property-empty-line-before': null,
  },

  ignoreFiles: ['node_modules/**', 'dist/**'],
}
