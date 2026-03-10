# Style Guide — Immutable Rules

**Purpose**: Code style rules that apply unconditionally. Violations are review rejections.

## TypeScript

| Rule | Detail |
|------|--------|
| Strict mode | No implicit `any`, strict null checks |
| No `any` types | Use proper typing, generics, discriminated unions |
| Path aliases | Always use `@/` imports (`@/components`, `@/stores`, `@/lib`) |
| Direct imports | Prefer `import { X } from './Foo'` over barrel `import { X } from '.'` |

## CSS (Tailwind 4 + Modern CSS)

| Forbidden | Required |
|-----------|----------|
| Media queries for fluid sizing | `clamp(min, preferred, max)` |
| Media queries for component layout | Container queries `@container` |
| JS for parent-based styling | `:has()` pseudo-class |
| Physical properties (`margin-left`) | Logical properties (`margin-inline-start`) |
| Hex/RGB/HSL design colors | `oklch()` for perceptual uniformity |
| Raw HTML controls | `src/components/ui/*` primitives |
| Hardcoded colors | Tailwind tokens from `src/index.css` `@theme` |
| `tailwind.config.js` | CSS `@theme` directive in `src/index.css` |

**Exceptions** (media queries OK): `prefers-reduced-motion`, `@media print`, `@supports`.

Premium glass utilities: `glass-panel`, `glass-button-primary`, `glass-input`.

## Zustand Selectors

```tsx
// REQUIRED: Individual selector
const dimension = useGeometryStore((s) => s.dimension)

// REQUIRED: useShallow for multiple values
import { useShallow } from 'zustand/react/shallow'
const { dimension, objectType } = useGeometryStore(
  useShallow((s) => ({ dimension: s.dimension, objectType: s.objectType }))
)

// FORBIDDEN: Full store subscription
const { dimension } = useGeometryStore()
```

## WGSL Shaders

| Rule | Detail |
|------|--------|
| File format | `.wgsl.ts` exporting template literal with `/* wgsl */` prefix |
| Composition | `assembleShaderBlocks()` from `shared/compose-helpers.ts` |
| Entry points | Must be named `main` |
| Max bind groups | 4 (groups 0-3) |
| `textureSample` | Uniform control flow only |
| Depth textures | Use `textureLoad`, not `textureSample` |
| `vec3f` alignment | 16 bytes, not 12 — always pad |

## JSDoc

All exported components, hooks, and public APIs require JSDoc with `@param`, `@returns`, `@example`.

## On-Demand References

| Domain | Serena Memory |
|--------|---------------|
| CSS patterns with examples | `modern_css_standard` |
| JSDoc templates | `jsdoc_templates` |
| Code style details | `code_style_conventions` |
| WGSL pitfalls and examples | `webgpu_coding_guide` |
