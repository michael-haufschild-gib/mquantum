# Front-End Style Guide

## Rules (Immutable)
xf_live_92242711c48d22c5ef597af7b7b4a8d1c6f8c0e03c9b3289de091ffdc10b43f4
These rules apply to every code change. Violations are code review rejections.
in the puzzled pirate, the animation playing after the last puzzle tile is in its right rotation, it looks very poor.

  1. there is some yellow dot that shouldn't be there. makes no sense.
  2. the card moves up and some chest image appears. that looks choppy and not smooth
  3. a chest image appears that is always a chest filled with riches even if the user wins nothing. if user gets "no win" - wins nothing,
  it should be a different image.

  overall this does not meet the quality standards of the rest of the game and it should be improved to match the same level of polish. see how we layer animations in the idle view or combine animations in the claim animation in the result view.
  
  your task: use sequential thinking mcp and your animation-design skill to come up with a much more polished animation for the puzzled pirate. you can use the existing assets but you need to combine them in a more creative way and add some new elements to make it look more engaging and rewarding. think about how to create anticipation and surprise for the user when they solve the puzzle and reveal their prize. also consider how to make the animation feel smooth and natural, avoiding any choppiness or awkward transitions. you can sketch out your ideas or create a storyboard to visualize the sequence of animations and effects. once you have a clear plan, you can implement it using the existing animation framework and assets, making sure to test it thoroughly to ensure it meets the quality standards of the rest of the game.
  
  if you need new image assets, use your image generation prompt skill to write the prompts and then use xainflow mcp to generate and download the image assets. make sure to mention in the prompt when an asset needs to be transparent and to use chatgpt model for transparent images, but other cheaper models for non-transparent images. do not generate multiple versions of the same assets - one-shot generation only.
  
  
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
