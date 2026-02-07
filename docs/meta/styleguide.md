# Front-End Engineering Style Guide

## WebGPU / WGSL Shader Standard

**All GPU shaders MUST be written in WGSL.** This project uses a custom WebGPU renderer built on raw `GPUDevice` / `GPUCommandEncoder` APIs. There is no WebGL, no Three.js, and no GLSL.

### Shader File Conventions

- `.wgsl.ts` files: TypeScript files exporting WGSL source as template literal strings
- Location: `src/rendering/webgpu/shaders/<category>/<name>.wgsl.ts`
- Use the `/* wgsl */` comment prefix for syntax highlighting in editors

```
src/rendering/webgpu/shaders/
├── shared/           # Reusable blocks (core, color, lighting, math, raymarch, depth, features)
│   ├── core/         # uniforms.wgsl.ts, constants.wgsl.ts
│   ├── color/        # hsl, oklab, cosine-palette, selector
│   ├── lighting/     # ggx, multi-light
│   ├── math/         # Complex math utilities
│   ├── raymarch/     # Sphere intersection, SDF sampling
│   ├── depth/        # Custom depth handling
│   ├── features/     # Temporal, cross-section, etc.
│   └── compose-helpers.ts  # assembleShaderBlocks(), bind group generators
├── schroedinger/     # Quantum wavefunction shaders + compose.ts
├── postprocessing/   # Bloom, tonemapping, FXAA, SMAA, etc.
├── skybox/           # Procedural skybox shaders
└── temporal/         # Temporal reprojection
```

### WGSL Block Pattern

Export shader code as named constants or generator functions:

```typescript
/**
 * WGSL Color Conversion Block
 *
 * Linear sRGB ↔ Oklab conversion utilities.
 *
 * @module rendering/webgpu/shaders/shared/color/oklab.wgsl
 */

// Static block — exported as a constant
export const oklabBlock = /* wgsl */ `
fn rgb2oklab(c: vec3f) -> vec3f {
  let l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  // ...
}
`

// Dynamic block — exported as a generator function
export function generateObjectBindGroup(
  group: number,
  structName: string,
  varName: string,
  binding: number
): string {
  return /* wgsl */ `@group(${group}) @binding(${binding}) var<uniform> ${varName}: ${structName};`
}
```

### Shader Composition with `assembleShaderBlocks()`

Shaders are composed from ordered blocks using `assembleShaderBlocks()` from `compose-helpers.ts`:

```typescript
import { assembleShaderBlocks, ShaderBlock } from '../shared/compose-helpers'
import { constantsBlock } from '../shared/core/constants.wgsl'
import { uniformsBlock } from '../shared/core/uniforms.wgsl'
import { complexMathBlock } from '../shared/math/complex.wgsl'

const blocks: ShaderBlock[] = [
  { name: 'Constants', content: constantsBlock },
  { name: 'Uniforms', content: uniformsBlock },
  { name: 'Complex Math', content: complexMathBlock },
  { name: 'GGX PBR', content: ggxBlock, condition: isosurface },  // conditional inclusion
  { name: 'Main', content: mainShaderBlock },
]

const { wgsl, modules } = assembleShaderBlocks(blocks)
```

**`ShaderBlock` interface:**
```typescript
interface ShaderBlock {
  name: string           // Debug label
  content: string        // WGSL source code
  condition?: boolean    // Set to false to skip this block
}
```

**Block dependency order** (must follow this sequence):
1. Vertex input structs
2. Defines / constants
3. Core (uniforms)
4. Bind group declarations
5. Math utilities (complex, hermite, etc.)
6. Color system (HSL, oklab, cosine palette)
7. Lighting (GGX PBR — isosurface only)
8. Volume rendering (absorption, emission, integration)
9. Geometry (sphere intersection, SDF)
10. Features (temporal, cross-section)
11. Fragment output structs (MRT)
12. Main shader

### Bind Group Layout (4 groups max)

WebGPU limits pipelines to 4 bind groups. The project follows this standard layout:

| Group | Purpose | Update Frequency | Bindings |
|-------|---------|-----------------|----------|
| 0 | Camera | Every frame | `@binding(0) camera: CameraUniforms` |
| 1 | Combined rendering | Per material change | `@binding(0) lighting`, `@binding(1) material`, `@binding(2) quality` |
| 2 | Object-specific | Per object | `@binding(0) [object uniforms]`, `@binding(1) basis: BasisVectors` |
| 3 | IBL / Environment | Optional | `@binding(0) iblUniforms`, `@binding(1) envMap`, `@binding(2) sampler` |

Use `generateConsolidatedBindGroups()` for Groups 0-1 and `generateObjectBindGroup()` for Group 2:

```typescript
{ name: 'Standard Bind Groups', content: generateConsolidatedBindGroups() },
{
  name: 'Object Uniforms',
  content:
    schroedingerUniformsBlock + '\n' +
    generateObjectBindGroup(2, 'SchroedingerUniforms', 'schroedinger', 0) + '\n' +
    generateObjectBindGroup(2, 'BasisVectors', 'basis', 1),
},
```

### WGSL Struct Alignment (Critical)

WGSL alignment rules differ from C. `vec3f` aligns to **16 bytes**, not 12. Always account for padding:

| Type | Size (bytes) | Alignment (bytes) |
|------|-------------|-------------------|
| `f32`, `i32`, `u32` | 4 | 4 |
| `vec2f` | 8 | 8 |
| `vec3f` | 12 | **16** |
| `vec4f` | 16 | 16 |
| `mat4x4f` | 64 | 16 |

```wgsl
struct CameraUniforms {
  // ...
  cameraPosition: vec3f,   // 16-byte aligned (12 bytes used + 4 padding)
  cameraNear: f32,         // Fills the 4-byte gap after vec3f
  cameraFar: f32,
  fov: f32,
  resolution: vec2f,
  aspectRatio: f32,
  time: f32,
  deltaTime: f32,
  frameNumber: u32,
  bayerOffset: vec2f,
  _padding: vec2f,         // Explicit padding — always document!
}
```

### MRT (Multiple Render Target) Pattern

```wgsl
struct FragmentOutput {
  @location(0) color: vec4f,    // Color buffer
  @location(1) normal: vec4f,   // Normal buffer (RGB = normal, A = metallic)
}

@fragment
fn main(input: VertexOutput) -> FragmentOutput {
  var output: FragmentOutput;
  output.color = vec4f(finalColor, finalAlpha);
  output.normal = vec4f(encodedNormal * 0.5 + 0.5, material.metallic);
  return output;
}
```

### Entry Point Naming

Use `main` for both vertex and fragment entry points (required by `createFullscreenPipeline()`):

```wgsl
@vertex
fn main(input: VertexInput) -> VertexOutput { ... }

@fragment
fn main(input: VertexOutput) -> @location(0) vec4f { ... }
```

### Texture Sampling Rules

`textureSample` must be called from **uniform control flow** only. Use `textureLoad` for depth textures and inside conditionals:

```wgsl
// ✅ CORRECT — all samples before any conditionals
let colorC = textureSample(tex, samp, input.uv);
let colorN = textureSample(tex, samp, input.uv + offset);
let skipProcessing = shouldSkip(colorC);
return vec4f(select(processedColor, colorC.rgb, skipProcessing), 1.0);

// ✅ CORRECT — textureLoad for depth (unfilterable-float)
let coord = vec2i(uv * vec2f(textureDimensions(depthTex)));
let depth = textureLoad(depthTex, coord, 0).r;

// ❌ WRONG — textureSample after early return (non-uniform control flow)
if (earlyExit) { return vec4f(0.0); }
let color = textureSample(tex, samp, uv);  // Error!
```

### Pipeline Format Must Match Render Target

```typescript
// ❌ WRONG — canvas format for HDR target
this.createFullscreenPipeline(device, shader, layouts, ctx.format)

// ✅ CORRECT — explicit format matching target texture
this.createFullscreenPipeline(device, shader, layouts, 'rgba16float')
```

| Render Target | Pipeline Format |
|---------------|-----------------|
| Canvas | `ctx.format` (`bgra8unorm`) |
| HDR textures (scene, bloom) | `'rgba16float'` |
| LDR textures (final-color) | `'rgba8unorm'` |
| AO buffer | `'r8unorm'` |

### Shader Writing Checklist

- [ ] All `textureSample` calls are in uniform control flow
- [ ] Depth/unfilterable textures use `textureLoad`, not `textureSample`
- [ ] Using at most 4 bind groups (0–3)
- [ ] Entry point names match pipeline configuration (`main`)
- [ ] All referenced struct types are defined in the shader
- [ ] Struct sizes account for `vec3f` 16-byte alignment
- [ ] All GPU objects have descriptive `label` properties
- [ ] Pipeline `colorFormat` matches the actual render target format

---

## Modern CSS Standard (2025 Baseline)

**All CSS MUST use modern features with full browser support (Baseline 2024/2025).** These patterns replace older workarounds that are no longer necessary. Using outdated patterns when modern alternatives exist is a code review rejection.

### Required vs Forbidden Patterns

| Outdated Pattern (Forbidden) | Modern Pattern (Required) |
|------------------------------|---------------------------|
| Media queries for fluid typography | `clamp(min, preferred, max)` |
| Media queries for component layouts | Container queries `@container` |
| JavaScript for parent-based styling | `:has()` pseudo-class |
| SCSS/Sass only for nesting | Native CSS nesting `& selector` |
| Padding hack for aspect ratio | `aspect-ratio: width / height` |
| `margin-left`/`margin-right` | `margin-inline` / `margin-inline-start` |
| `padding-top`/`padding-bottom` | `padding-block` / `padding-block-start` |
| `left`/`right`/`top`/`bottom` | `inset-inline` / `inset-block` |
| Hex/RGB for design system colors | `oklch()` for perceptual uniformity |
| Preprocessor color functions | `color-mix()` and relative colors |

### Fluid Typography & Spacing

Use `clamp()` to eliminate breakpoint-based media queries for sizing:

```css
/* ❌ Forbidden: Multiple media queries */
.heading {
  font-size: 1.5rem;
}
@media (min-width: 768px) {
  .heading { font-size: 2rem; }
}
@media (min-width: 1200px) {
  .heading { font-size: 2.5rem; }
}

/* ✅ Required: Single clamp() declaration */
.heading {
  font-size: clamp(1.5rem, 1rem + 2vw, 2.5rem);
}
```

**clamp() Best Practices:**
- Use `rem` for min/max values (respects user font preferences)
- Use `vw` or container units for the preferred value
- Tool: [clampgenerator.com](https://clampgenerator.com) for calculating values

Also use `min()` and `max()` for constrained layouts:

```css
/* Responsive container without media queries */
.container {
  width: min(100% - 2rem, 1200px);
  padding: max(1rem, 2vw);
}
```

### Container Queries

Use container queries for component-level responsiveness instead of viewport-based media queries:

```css
/* ❌ Forbidden: Viewport-based component layout */
.card { display: block; }
@media (min-width: 600px) {
  .card { display: grid; grid-template-columns: 200px 1fr; }
}

/* ✅ Required: Container-based component layout */
.card-wrapper {
  container-type: inline-size;
}

.card {
  display: block;

  @container (min-width: 400px) {
    display: grid;
    grid-template-columns: 200px 1fr;
  }
}
```

**Container Query Guidelines:**
- Use `container-type: inline-size` for width-based queries (most common)
- Use `container-type: size` only when querying both dimensions
- Name containers with `container-name` for complex nested layouts
- Container query units: `cqw`, `cqh`, `cqi`, `cqb` available for sizing

### The :has() Selector

Use `:has()` for parent selection instead of JavaScript:

```css
/* ❌ Forbidden: JavaScript for parent styling */
// card.classList.add('has-image') in JS

/* ✅ Required: CSS :has() */
.card:has(img) {
  display: grid;
  grid-template-columns: 200px 1fr;
}

/* Form validation without JS */
.form-group:has(:invalid) {
  border-color: var(--color-error);
}

.form-group:has(:focus-visible) label {
  color: var(--color-primary);
}

/* Conditional layouts */
.sidebar:has(.widget:nth-child(4)) {
  grid-template-rows: repeat(2, 1fr);
}
```

### Native CSS Nesting

Use native CSS nesting instead of preprocessors:

```css
/* ✅ Native CSS nesting */
.card {
  padding: 1rem;

  & .title {
    font-size: 1.25rem;

    &:hover {
      color: var(--color-primary);
    }
  }

  & .content {
    margin-block-start: 0.5rem;
  }

  /* Media queries nest too */
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
```

**Note:** The `&` is required for element selectors in native nesting: `& p { }` not `p { }`

### Aspect Ratio

Use `aspect-ratio` instead of the padding hack:

```css
/* ❌ Forbidden: Padding hack */
.video-container {
  position: relative;
  height: 0;
  padding-top: 56.25%; /* 16:9 */
}
.video-container iframe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* ✅ Required: aspect-ratio property */
.video-container {
  aspect-ratio: 16 / 9;

  & iframe {
    width: 100%;
    height: 100%;
  }
}
```

### Logical Properties

Use logical properties for internationalization-ready layouts:

```css
/* ❌ Forbidden: Physical properties */
.element {
  margin-left: 1rem;
  margin-right: 1rem;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  border-left: 2px solid;
  text-align: left;
}

/* ✅ Required: Logical properties */
.element {
  margin-inline: 1rem;
  padding-block: 0.5rem;
  border-inline-start: 2px solid;
  text-align: start;
}
```

**Logical Property Mappings (LTR context):**
| Physical | Logical |
|----------|---------|
| `left` / `right` | `inline-start` / `inline-end` |
| `top` / `bottom` | `block-start` / `block-end` |
| `width` / `height` | `inline-size` / `block-size` |
| `margin-left` | `margin-inline-start` |
| `padding-top` | `padding-block-start` |

### Modern Color System

Use `oklch()` for perceptually uniform colors in design systems:

```css
/* ❌ Forbidden: HSL for color scales (perceptually inconsistent) */
:root {
  --blue-50: hsl(210, 100%, 95%);
  --blue-100: hsl(210, 100%, 90%);
  /* Colors appear inconsistently bright */
}

/* ✅ Required: OKLCH for design system colors */
:root {
  --blue-50: oklch(97% 0.02 250);
  --blue-100: oklch(93% 0.04 250);
  --blue-500: oklch(55% 0.18 250);
  --blue-900: oklch(25% 0.08 250);
  /* Lightness is perceptually uniform */
}
```

Use `color-mix()` for dynamic color manipulation:

```css
/* Dynamic hover states without preprocessors */
.button {
  background: var(--color-primary);

  &:hover {
    background: color-mix(in oklch, var(--color-primary) 85%, black);
  }

  &:disabled {
    background: color-mix(in oklch, var(--color-primary) 50%, transparent);
  }
}
```

Use relative color syntax for advanced manipulation:

```css
/* Adjust lightness of any color */
.overlay {
  background: oklch(from var(--bg-color) calc(l * 0.8) c h / 0.9);
}
```

### Popover API

Use the native Popover API instead of custom JavaScript solutions:

```html
<!-- ✅ Native popover -->
<button popovertarget="menu">Open Menu</button>
<div id="menu" popover>
  <nav><!-- menu content --></nav>
</div>
```

```css
[popover] {
  /* Browser handles positioning, backdrop, focus trap, Escape key */
  &::backdrop {
    background: oklch(0% 0 0 / 0.5);
  }
}
```

### When Older Patterns Are Acceptable

Some scenarios still require traditional approaches:

| Scenario | Use This |
|----------|----------|
| Major layout restructuring (e.g., sidebar to stacked) | `@media` queries |
| Print stylesheets | `@media print` |
| User preference queries | `@media (prefers-reduced-motion)` |
| Scroll-driven animations (partial support) | `@supports` guard |

```css
/* Layout restructuring still uses media queries */
.layout {
  display: grid;
  grid-template-columns: 1fr;

  @media (min-width: 1024px) {
    grid-template-columns: 250px 1fr;
  }
}

/* Feature detection for newer features */
@supports (animation-timeline: scroll()) {
  .scroll-indicator {
    animation: progress linear;
    animation-timeline: scroll();
  }
}
```

### Tailwind CSS Integration

When using Tailwind, prefer these modern utilities:

```html
<!-- Container queries -->
<div class="@container">
  <div class="block @md:grid @md:grid-cols-2">...</div>
</div>

<!-- Logical properties -->
<div class="ms-4 me-2 ps-4 pe-2">...</div>

<!-- Fluid sizing with arbitrary values -->
<h1 class="text-[clamp(1.5rem,1rem+2vw,2.5rem)]">...</h1>
```

---

## Core Engineering Principles

- **Intentional architecture:** Every module should have a single responsibility, clearly expressed through its folder structure and exports. Domain-specific logic lives in hooks or services, while UI components stay presentational.
- **Deterministic state management:** Prefer explicit state machines, typed events, and transitions over ad-hoc `useState` chains. Determinism makes simulations, logging, and testing reliable.
- **Performance as a first-class concern:** Build with frame-by-frame awareness. Memoize aggressively, subscribe to external stores for animation loops, and keep render trees flat and predictable.
- **Resilience and recovery:** Assume failures. Wrap major surfaces in error boundaries, provide user feedback (toast notifications, fallbacks), and coordinate reset flows so the app can recover without a page refresh.
- **Observability and guard rails:** Instrument telemetry at critical state transitions. Use refs and guards to prevent illegal transitions and log anomalies immediately.

## Architectural Conventions

### Folder Structure

- `components/` holds presentational and container components organized by domain. Prefer colocating assets, tests, and stories with the component.
- `hooks/` encapsulate reusable logic. Compose small hooks into feature-level orchestrators while keeping side effects localized.
- `services/` (or equivalent) own pure domain logic: business rules, data transforms, deterministic simulations. Keep them framework-agnostic to simplify testing.
- `config/` exposes typed context providers and helpers for runtime configuration, feature flags, and environment wiring.
- `theme/`, `constants/`, and `utils/` collect shared primitives. Avoid leaking implementation details across domains or importing from deep paths.

### Import Patterns

Prefer **direct file imports** over barrel exports (`index.ts` re-exports):

```tsx
// ✅ Good: Direct imports are explicit and navigable
import { AnimationSection } from './Animation/AnimationSection'
import { GeometrySection } from './Geometry/GeometrySection'

// ❌ Avoid: Barrel imports obscure the actual file location
import { AnimationSection } from './Animation'
import { GeometrySection } from './Geometry'
```

**When to use barrel exports:**

- **Module boundary exports only**: A single `index.ts` at the module root to expose the public API (e.g., `components/sidebar/index.ts` exports only `Sidebar`).
- **Shared libraries**: When creating a reusable package consumed by multiple projects.

**When to avoid barrel exports:**

- **Internal folder organization**: Subfolders within a module should not have `index.ts` files if their contents are only used by sibling files.
- **Components with single consumers**: If `AnimationControls` is only used by `AnimationSection` in the same folder, no barrel is needed.

**Benefits of direct imports:**

- **Explicitness**: Import path matches file path—no indirection to trace.
- **IDE navigation**: Cmd+click goes directly to the implementation file.
- **Tree-shaking**: Some bundlers handle direct imports more efficiently than barrels.
- **Reduced maintenance**: No need to update barrel files when adding/removing components.

### State & Effects

- Model complex flows with a state machine and typed events. Document transitions in `docs/` so newcomers can trace the lifecycle.
- Co-locate side effects with the components or hooks that own the state. Each `useEffect` should have a single reason to re-run and include clear exit conditions.
- Prefer `useCallback`, `useMemo`, and `useSyncExternalStore` to stabilize references across renders, especially when passing callbacks through context or animation loops.
- Use refs to coordinate multi-phase flows (e.g., locking the winning prize, tracking current animation frame) without forcing re-renders.

### Rendering & Styling

- Keep component trees shallow. Split large containers into focused subcomponents so that rendering concerns, layout, and domain logic remain isolated.
- Drive animations through a shared driver (Framer Motion or equivalent), providing a consistent API for timing and transitions.
- Centralize layout tokens (spacing, radii, gradients) in the theme system, even when applying inline styles. Inline styles are acceptable for dynamic values but mirror them in Tailwind or CSS variables for consistency.
- Apply memoization or `React.memo` to heavy child components, especially those rendering grids, lists, or SVG/Canvas primitives.
- **Follow Modern CSS Standard:** All CSS must adhere to the Modern CSS Standard section above—use `clamp()` for fluid sizing, container queries for component responsiveness, `:has()` for parent selection, and `oklch()` for colors.

#### Style Utilities (NEW)

To reduce inline style verbosity and improve consistency, use the new **utility functions**:

**Utility Functions** (`theme/themeUtils.tsx`):
```tsx
import {
  createOverlayBackground,
  createCardBackground,
  createGradientText,
  createFlexLayout,
  createAbsoluteOverlay,
  createTransform,
  createResponsiveFontSize
} from '../theme/themeUtils';

// Semi-transparent backgrounds
<div style={{ background: createOverlayBackground('#000000', 0.5) }}>
  Dark overlay
</div>

// Card backgrounds with theme integration
<div style={createCardBackground(theme.colors.surface.primary, 0.8)}>
  Semi-transparent card
</div>

// Gradient text (cross-platform safe)
<h1 style={createGradientText(theme.gradients.buttonPrimary)}>
  Gradient Title
</h1>

// Flexbox layouts with gap
<div style={createFlexLayout('center', 'space-between', '12px', 'column')}>
  Flex container
</div>

// Absolute overlays
<div style={createAbsoluteOverlay({ top: 0, left: 0 }, 10)}>
  Positioned overlay
</div>

// Transform combinations
<div style={createTransform({ translateX: '50%', scale: 1.2, rotate: 45 })}>
  Transformed element
</div>

// Responsive font sizes
<div style={{
  fontSize: createResponsiveFontSize(containerWidth, {
    min: 10, max: 16, minWidth: 300, maxWidth: 600
  })
}}>
  Responsive text
</div>
```

**Benefits:**
- Reduces inline style duplication across components
- Maintains consistency with theme tokens
- Cross-platform compatible (React Native ready)
- Better type safety and autocomplete
- Easier to refactor and maintain

## Coding Standards

- **TypeScript everywhere:** Use strict types, discriminated unions, and generics. Avoid `any`; prefer helper types to keep state machine context and events precise.
- **Documentation-first mindset:** Add top-level JSDoc blocks describing each hook/component’s responsibility, parameters, and side effects. Maintain companion docs (`docs/*.md` or an ADR folder) for complex systems or refactors.
- **Error handling:** Surface actionable messages to users via toasts or inline UI. Log internal errors with context (state, event) and guard against cascading failures.
- **Pure functions for domain logic:** Keep physics, randomization, and prize calculations pure and testable. Inject dependencies (seed overrides, adapters) via parameters.

## Testing Expectations

- **Unit tests:** Cover domain modules (state machines, trajectory generators) with deterministic seeds. Validate edge cases—invalid transitions, timeouts, reset races.
- **Component tests:** Use Testing Library to assert rendering behavior, accessibility, and state transitions from user interactions.
- **Integration & E2E:** Leverage Playwright (or similar) for animation-heavy flows, visual regressions, and device viewport coverage.
- **Dev tooling hooks:** When exposing internal APIs for tests or dev tools, mark them clearly (`_internal`) and ensure they’re gated from production usage.
- **CI discipline:** Tests should run quickly and deterministically. Use seeds, mocked timers, and controlled feature flags to eliminate flakiness.

## Documentation & Knowledge Sharing

- Maintain ADR-style records for major architectural decisions (state machine refactors, animation driver swaps, testing overhauls).
- Keep reset orchestration, animation pipelines, and domain algorithms documented with diagrams and troubleshooting tips.
- Provide onboarding guides highlighting the flow from root entry points through feature orchestrators to reusable primitives so newcomers can trace the happy path quickly.

## Developer Experience

- Ship dev tools (debug panels, performance toggles, deterministic seeds) that plug into the architecture without touching production code paths.
- Use feature flags and configuration providers to toggle experiences safely.
- Keep the bundle modular: lazy-load dev-only panels and effect-heavy components where appropriate.
- Favor predictable, typed adapters for platform features (viewport sizing, device detection) so tests can stub them easily.

## Code Review Checklist

- Does the change respect the folder boundaries and domain ownership?
- Are state transitions and side effects deterministic and well-documented?
- Have performance characteristics (render count, animation frames) been considered?
- Are error states handled with user feedback and logged for telemetry?
- Are tests covering both happy paths and failure scenarios, including reset flows?
- Is documentation updated (inline comments + docs) for new concepts or refactors?
- **Does CSS follow Modern CSS Standard?** Uses `clamp()` instead of media query breakpoints, container queries for component responsiveness, `:has()` instead of JS for parent styling, logical properties instead of physical, and `oklch()` for colors.

## Common Mistakes to Avoid

- **Unstructured state:** Relying on scattered `useState` calls or implicit side effects makes behavior unpredictable. Always model complex flows with explicit reducers, state machines, or finite state diagrams.
- **Inline styling sprawl:** Sprinkling layout-critical inline styles across components hides design tokens. Move shared styling to theme variables, utility classes, or styled primitives.
- **Over-engineering without payoff:** Excessive abstraction, nested providers, or premature indirection slows velocity. Start with the simplest architecture that meets requirements, then generalize once real duplication appears.
- **Custom platform detection hacks:** User-agent sniffing breaks easily. Prefer `matchMedia`, `ResizeObserver`, and progressive enhancement strategies with tested adapter layers.
- **Insufficient testing depth:** Smoke tests alone miss race conditions. Add deterministic unit tests for domain logic, integration tests for state transitions, and targeted E2E coverage for critical user journeys.
- **Opaque error handling:** Silent failures or generic alerts erode trust. Provide actionable user feedback and structured logs with context so on-call engineers can diagnose quickly.
- **Outdated CSS patterns:** Using media queries for fluid typography when `clamp()` exists, JavaScript for parent-based styling when `:has()` is available, or the padding hack when `aspect-ratio` is supported. See the Modern CSS Standard section for required patterns.
- **Physical CSS properties:** Using `margin-left`/`margin-right` instead of `margin-inline`, or `top`/`bottom` instead of `block-start`/`block-end`. Logical properties are mandatory for internationalization readiness.
- **Viewport-dependent components:** Using `@media` queries for component layout changes that should use container queries. Components must respond to their container, not the viewport.
- **Legacy color formats:** Using hex or HSL for design system color palettes. OKLCH provides perceptually uniform colors and is required for all new color definitions.

## Documentation Standards

### JSDoc Template for Components

All exported components and hooks should include comprehensive JSDoc documentation:

```tsx
/**
 * Brief one-line description of the component's purpose.
 *
 * Detailed description explaining:
 * - What the component does
 * - Key features or behaviors
 * - Important implementation details
 * - Performance characteristics (if relevant)
 *
 * @param props - Component props
 * @param props.propName - Description of each prop
 *
 * @returns Brief description of what the component renders
 *
 * @example
 * ```tsx
 * <MyComponent
 *   propName="value"
 *   onEvent={() => console.log('event')}
 * />
 * ```
 *
 * @example
 * Complex usage with multiple scenarios:
 * ```tsx
 * <MyComponent
 *   propName="advanced"
 *   config={{ option: true }}
 * >
 *   <ChildComponent />
 * </MyComponent>
 * ```
 *
 * @remarks
 * - Additional notes about edge cases
 * - Dependencies on external systems
 * - Performance considerations
 * - Migration notes (if replacing legacy component)
 *
 * @see {@link RelatedComponent} for similar functionality
 * @see {@link https://docs.example.com} for external documentation
 */
export function MyComponent({ propName, onEvent }: MyComponentProps) {
  // Implementation
}
```

### JSDoc Template for Hooks

```tsx
/**
 * Brief one-line description of the hook's purpose.
 *
 * Detailed explanation of:
 * - What problem the hook solves
 * - Side effects (API calls, subscriptions, timers)
 * - State management approach
 * - Performance characteristics
 *
 * @param config - Hook configuration object
 * @param config.option - Description of each config property
 *
 * @returns Hook return value description
 * @returns {Object} returnValue - Return value object
 * @returns {Type} returnValue.property - Each returned property
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { data, loading, error } = useMyHook({
 *     option: 'value'
 *   })
 *
 *   if (loading) return <Spinner />
 *   if (error) return <Error message={error} />
 *
 *   return <div>{data}</div>
 * }
 * ```
 *
 * @remarks
 * - Cleanup is handled automatically
 * - Uses internal caching for performance
 * - Requires XProvider in component tree
 *
 * @throws {Error} When used outside of provider context
 */
export function useMyHook(config: HookConfig) {
  // Implementation
}
```

### JSDoc Template for Utility Functions

```tsx
/**
 * Brief one-line description of the function's purpose.
 *
 * Detailed explanation of:
 * - Algorithm or approach used
 * - Edge cases handled
 * - Performance characteristics (O(n), etc.)
 *
 * @param input - Description of parameter
 * @param options - Optional configuration object
 * @returns Description of return value
 *
 * @example
 * ```tsx
 * const result = myUtility('input', { option: true })
 * console.log(result) // Expected output
 * ```
 *
 * @throws {TypeError} When input is invalid
 * @throws {RangeError} When value out of bounds
 */
export function myUtility(input: string, options?: Options): Result {
  // Implementation
}
```

### Documentation Coverage Goals

- **Exported Components**: 100% JSDoc coverage required
- **Exported Hooks**: 100% JSDoc coverage required
- **Public APIs**: 100% JSDoc coverage required
- **Utility Functions**: 80%+ JSDoc coverage recommended
- **Internal/Private**: JSDoc optional but encouraged for complex logic

### ESLint Enforcement

Configure ESLint to require JSDoc for exported declarations:

```json
{
  "rules": {
    "jsdoc/require-jsdoc": ["warn", {
      "publicOnly": true,
      "require": {
        "FunctionDeclaration": true,
        "ClassDeclaration": true,
        "ArrowFunctionExpression": false,
        "FunctionExpression": false
      }
    }],
    "jsdoc/require-param": "warn",
    "jsdoc/require-returns": "warn",
    "jsdoc/require-example": "off"
  }
}
```

### Documentation Best Practices

1. **Be Specific**: Avoid vague descriptions like "handles data" - explain what data and how
2. **Include Examples**: Show real-world usage, not trivial examples
3. **Document Side Effects**: API calls, subscriptions, timers, DOM manipulation
4. **Explain "Why"**: If implementation is non-obvious, explain the reasoning
5. **Keep Updated**: Update JSDoc when changing component behavior
6. **Link Related Docs**: Use `@see` tags to connect related components/docs

## Continuous Improvement

- Periodically prune legacy compatibility code (e.g., older signatures in hooks) once consumers migrate.
- Revisit custom infrastructure (reset orchestration, animation drivers) to ensure they still outperform off-the-shelf solutions.
- Encourage engineers to add small quality-of-life improvements (better typing, helper utilities) as part of feature work.
- **Document as you go**: Add JSDoc when creating new components, not as cleanup work
