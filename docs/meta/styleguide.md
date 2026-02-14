# Front-End Style Guide

## Rules (Immutable)

These rules apply to every code change. Violations are code review rejections.

### Modern CSS (2025 Baseline)

| Forbidden Pattern | Required Replacement |
|---|---|
| Media queries for fluid sizing | `clamp(min, preferred, max)` |
| Media queries for component layout | Container queries `@container` |
| JS for parent-based styling | `:has()` pseudo-class |
| Padding hack for aspect ratio | `aspect-ratio: width / height` |
| Physical properties (`margin-left`, `top`) | Logical properties (`margin-inline-start`, `inset-block-start`) |
| Hex/RGB/HSL for design system colors | `oklch()` / `color-mix(in oklch, ...)` |

**Exceptions** (media queries allowed): major layout restructuring, `@media print`, `prefers-reduced-motion`, `@supports` guards.

For detailed examples, code patterns, and Tailwind integration: load Serena memory `modern_css_standard`.

### WebGPU / WGSL

All shader rules live in Serena memory `webgpu_coding_guide`. Key reminders:

- WGSL only (no GLSL). Files: `.wgsl.ts` with `/* wgsl */` prefix.
- Max 4 bind groups (0-3). Entry points named `main`.
- `textureSample` in uniform control flow only. Use `textureLoad` for depth.
- `vec3f` aligns to 16 bytes, not 12.
- Pipeline `colorFormat` must match render target format.

### Imports

Prefer **direct file imports** over barrel exports:

```tsx
// Good: Direct — explicit and navigable
import { AnimationSection } from './Animation/AnimationSection'

// Avoid: Barrel — obscures actual file location
import { AnimationSection } from './Animation'
```

Barrel exports only at module boundary roots (`components/sidebar/index.ts` exporting `Sidebar`) and shared libraries.

### JSDoc

100% JSDoc coverage required for all exported components, hooks, and public APIs. Include `@param`, `@returns`, and `@example`.

For templates: load Serena memory `jsdoc_templates`.

### Style Utilities

Use `theme/themeUtils.tsx` to reduce inline style verbosity:

```tsx
import {
  createOverlayBackground,
  createCardBackground,
  createGradientText,
  createFlexLayout,
  createAbsoluteOverlay,
  createTransform,
  createResponsiveFontSize
} from '../theme/themeUtils'
```

Prefer these helpers over raw inline style objects for backgrounds, gradients, flex layouts, overlays, and transforms.

## On-Demand References

Load these Serena memories when working in the relevant domain:

| Domain | Serena Memory |
|---|---|
| WebGPU shaders, pipelines, bind groups | `webgpu_coding_guide` |
| CSS patterns, `clamp()`, `:has()`, `oklch()` examples | `modern_css_standard` |
| JSDoc templates for components/hooks/utils | `jsdoc_templates` |
| File naming, Zustand, TypeScript conventions | `code_style_conventions` |
