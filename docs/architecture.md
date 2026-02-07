# Architecture Guide for LLM Coding Agents

**Purpose**: Instructions for where to put code and what patterns to follow in this WebGPU quantum visualization project.

**Read this first**: `docs/meta/styleguide.md` (mandatory engineering rules).

## Project Focus

**mquantum** is a **WebGPU-only** visualization of **Schroedinger quantum wavefunctions** in **3 to 11 dimensions**. It renders volumetric quantum mechanics (hydrogen orbitals, harmonic oscillators) via raymarching in WGSL shaders, with a full post-processing pipeline (bloom, SSAO, SSR, bokeh, tonemapping, etc.).

- **Single object type**: `ObjectType = 'schroedinger'` (no polytopes, fractals, or black holes)
- **Single rendering backend**: WebGPU (no WebGL, no Three.js renderer)
- **Shader language**: WGSL (not GLSL) for all GPU shaders
- **Quantum modes**: hydrogen (3D), hydrogen N-D, harmonic oscillator 1D, harmonic oscillator N-D

## Tech Stack (Generate code for these tools only)

- **App**: React 19 + TypeScript + Vite 7
- **3D Canvas**: Custom WebGPU renderer (pure `GPUDevice` / `GPUCommandEncoder`)
- **State**: Zustand 5 (selectors + `useShallow` for perf)
- **Styling**: Tailwind CSS 4 tokens defined in `src/index.css` (`@theme` + `@utility`)
- **Testing**: Vitest (happy-dom) + Playwright (`@playwright/test`)
- **WASM**: Rust via `wasm-pack` for math operations (rotation, projection)

## Where to Put New Code

```
src/
├── components/
│   ├── ui/            # ONLY reusable UI primitives (Button, Slider, Modal, etc.)
│   ├── layout/        # Layout frames, panels, top bars, drawers
│   ├── sections/      # Sidebar/editor sections (feature groupings)
│   ├── canvas/        # Performance monitor, gizmos, debug overlays
│   ├── controls/      # Domain controls (export, share buttons)
│   ├── overlays/      # Modals and notifications
│   └── presets/       # Scene/style preset managers
├── hooks/             # React hooks wiring stores + rendering + UI
├── lib/
│   ├── geometry/      # Object type registry, Schroedinger config, presets
│   ├── math/          # N-D vector, matrix, rotation, projection (pure logic)
│   ├── cache/         # IndexedDB cache + Hermite polynomial constants
│   ├── wasm/          # WASM bridge utilities
│   ├── url/           # URL state serialization
│   ├── colors/        # Color utilities
│   ├── export/        # Image/video export
│   └── animation/     # Animation bias calculations
├── rendering/
│   └── webgpu/
│       ├── core/      # WebGPUDevice, Camera, BasePass, UniformBuffer, ResourcePool
│       ├── graph/     # Declarative render graph (pass ordering, resource allocation)
│       ├── renderers/ # WebGPUSchrodingerRenderer, Skybox, GroundPlane
│       ├── passes/    # Post-processing passes (Bloom, SSAO, SSR, Bokeh, etc.)
│       ├── shaders/   # All WGSL shaders
│       │   ├── shared/        # Shared WGSL modules (lighting, color, math, depth)
│       │   ├── schroedinger/  # Schroedinger SDF, quantum functions, volume integration
│       │   ├── postprocessing/# Bloom, tonemapping, FXAA, SMAA, SSR shaders
│       │   ├── skybox/        # 7 procedural skybox modes
│       │   ├── groundplane/   # Ground plane + grid shaders
│       │   └── temporal/      # Temporal reprojection/reconstruction
│       └── utils/     # WebGPU-specific utilities (lighting, color)
├── stores/            # Zustand stores + slices (global state)
│   ├── slices/
│   │   ├── visual/    # Material, color, render, PBR slices
│   │   └── geometry/  # Schroedinger slice
│   ├── defaults/      # Default values
│   └── utils/         # Preset serialization, merge helpers
├── types/             # TypeScript type declarations
├── wasm/              # Rust WASM source (mdimension_core)
└── theme/             # CSS helper utilities (themeUtils.tsx)
scripts/
├── playwright/        # Playwright E2E tests ONLY (must be `*.spec.ts`)
└── tools/             # One-off utilities / verification scripts
docs/                  # Documentation
```

### Decision tree: where does this code go?

- **Creating/adjusting UI controls**:
  - **Reusable primitive** (Button/Select/Slider/Modal) -> `src/components/ui/`
  - **Feature control group / panel section** -> `src/components/sections/<Feature>/`
  - **Layout container** (top bar, drawers, split panes) -> `src/components/layout/`
- **Creating/adjusting global state**:
  - **Zustand store** (new domain) -> `src/stores/<domain>Store.ts`
  - **Store slice** (extend existing store) -> `src/stores/slices/...`
  - **Default constants** -> `src/stores/defaults/...`
- **Creating/adjusting WebGPU rendering**:
  - **New render pass** -> `src/rendering/webgpu/passes/<PassName>.ts`
  - **New WGSL shader** -> `src/rendering/webgpu/shaders/<category>/<name>.wgsl.ts`
  - **New renderer** -> `src/rendering/webgpu/renderers/<Name>Renderer.ts`
  - **Render graph wiring** -> `src/rendering/webgpu/WebGPUScene.tsx`
  - **Core GPU utilities** -> `src/rendering/webgpu/core/`
- **Pure math/geometry** (no React, no GPU) -> `src/lib/`
- **Quantum physics** (SDF functions, wavefunctions) -> `src/rendering/webgpu/shaders/schroedinger/`

## Naming & Import Rules

- **Always use path aliases** (`@/...`) instead of deep relative imports.
- **File naming**:
  - Components: `PascalCase.tsx`
  - Hooks: `useCamelCase.ts`
  - Stores: `camelCaseStore.ts`
  - Slices: `*Slice.ts`
  - WGSL shaders: `name.wgsl.ts` (TypeScript exporting template literal strings)
  - Tests: `*.test.ts` or `*.test.tsx`
  - Playwright: `*.spec.ts`

## WebGPU Rendering Architecture

### Render Graph

The rendering pipeline is a **declarative render graph** (`src/rendering/webgpu/graph/WebGPURenderGraph.ts`). Passes declare inputs, outputs, and an `enabled()` callback. The graph compiles execution order via topological sort.

```
SchrodingerRenderer (MRT: color, normal, depth)
  -> SkyboxRenderer / ScenePass (environment)
    -> GroundPlaneRenderer (optional)
      -> GTAOPass (ambient occlusion)
        -> SSRPass (screen-space reflections)
          -> EnvironmentCompositePass (combine object + environment)
            -> BloomPass -> BokehPass -> RefractionPass -> FrameBlendingPass
              -> TonemappingPass (HDR -> LDR)
                -> CinematicPass -> PaperTexturePass
                  -> FXAAPass / SMAAPass (anti-aliasing)
                    -> ToScreenPass (final output to canvas)
```

### Key abstractions

- **WebGPUDevice**: Singleton managing `GPUAdapter`, `GPUDevice`, canvas context
- **WebGPUBasePass**: Base class for all passes. Provides uniform buffer management, pipeline caching, store access
- **WebGPURenderGraph**: Manages pass ordering, resource allocation, ping-pong textures, lazy deallocation
- **WebGPUResourcePool**: GPU resource allocation (textures, buffers, samplers) with VRAM tracking
- **WebGPUCamera**: Pure TypeScript orbit camera with view/projection matrices
- **WebGPUUniformBuffer**: Declarative uniform layout builder + writer

### Store access in WebGPU passes

Passes access stores via typed getters set on the render graph:

```ts
// In WebGPUScene.tsx setup:
graph.setStoreGetter('appearance', () => useAppearanceStore.getState())

// In a pass:
const appearance = getStore(ctx, 'appearance')
const color = appearance.edgeColor
```

### Template: new WebGPU render pass

Create: `src/rendering/webgpu/passes/<Name>Pass.ts`

```ts
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { FrameContext } from '../core/types'
import { getStore } from '../core/storeTypes'

export class <Name>Pass extends WebGPUBasePass {
  private pipeline: GPURenderPipeline | null = null

  constructor(device: GPUDevice) {
    super(device)
  }

  // Called by render graph to declare resource needs
  static declare() {
    return {
      inputs: ['hdr-color'],
      outputs: ['<name>-output'],
      enabled: (ctx: FrameContext) => getStore(ctx, 'postProcessing').<name>Enabled,
    }
  }

  render(ctx: FrameContext, encoder: GPUCommandEncoder): void {
    // Get store values
    const pp = getStore(ctx, 'postProcessing')
    // Create render pass, bind resources, draw fullscreen quad
  }

  releaseInternalResources(): void {
    this.pipeline = null
  }
}
```

### Template: WGSL shader module

Create: `src/rendering/webgpu/shaders/<category>/<name>.wgsl.ts`

```ts
/**
 * <Description of what this shader does>
 */
export const <name>Block = /* wgsl */ `
  // Uniform bindings
  @group(0) @binding(0) var<uniform> camera: CameraUniforms;

  // Functions
  fn <functionName>(uv: vec2f) -> vec4f {
    // Implementation
    return vec4f(1.0);
  }
`
```

Shader composition uses `assembleShaderBlocks()` from `src/rendering/webgpu/shaders/shared/compose-helpers.ts`:

```ts
import { assembleShaderBlocks, type ShaderBlock } from '../shared/compose-helpers'

const blocks: ShaderBlock[] = [
  { name: 'Uniforms', content: uniformsBlock },
  { name: 'SDF', content: sdfBlock, condition: dimension === 4 },
  { name: 'Main', content: mainBlock },
]

const { wgsl, modules } = assembleShaderBlocks(blocks)
```

## Zustand Rules (Performance-critical)

- **Never** subscribe to an entire store object in a React component.
- **Always** use either:
  - Individual selectors (`useStore(s => s.value)`) OR
  - A shallow object selector via `useShallow`.

### CRITICAL `useShallow` rule (React 19 + Zustand 5)

`useShallow` is a hook. **Do not call it inside another hook call**.

```ts
// CORRECT:
import { useShallow } from 'zustand/react/shallow'
const uiSelector = useShallow((s: ReturnType<typeof useUIStore.getState>) => ({
  isOpen: s.isOpen,
  setOpen: s.setOpen,
}))
export function Component() {
  const { isOpen, setOpen } = useUIStore(uiSelector)
}

// WRONG: Do NOT nest useShallow inside the store hook call
const { isOpen } = useUIStore(useShallow((s) => ({ isOpen: s.isOpen })))
```

### Version tracking pattern

Stores use version counters for dirty-flag render optimization:

```ts
// In a store slice:
setWithVersion: (updater) => {
  set((state) => ({
    ...updater(state),
    schroedingerVersion: state.schroedingerVersion + 1,
  }))
}
```

WebGPU passes compare version numbers to skip redundant uniform uploads.

### Template: add a new store

Create: `src/stores/<domain>Store.ts`, export from `src/stores/index.ts`.

```ts
import { create } from 'zustand'

export interface <Domain>State {
  value: number
  setValue: (value: number) => void
  reset: () => void
}

const DEFAULT_VALUE = 0

export const use<Domain>Store = create<<Domain>State>((set) => ({
  value: DEFAULT_VALUE,
  setValue: (value) => set({ value }),
  reset: () => set({ value: DEFAULT_VALUE }),
}))
```

## Object Type Registry

The single object type `'schroedinger'` is defined in `src/lib/geometry/registry/registry.ts` via `OBJECT_TYPE_REGISTRY`. The registry provides metadata:

- `dimensionConstraints`: min 3, max 11
- `renderMethod`: `'raymarching'`
- `renderingCapabilities`: faces, emission, fresnel (no edges/points)
- `animationCapabilities`: rotation planes, parameter oscillation
- `uiComponentMapping`: which controls/timeline components to show

Query helpers: `isAvailableForDimension()`, `getRecommendedDimension()`, `canRenderFaces()`, `isRaymarchingType()`, `isRaymarchingFractal()`.

## UI Rules (Do NOT bypass the UI library)

- **Always** build UI out of `src/components/ui/*` primitives.
- **Never** introduce raw `<input>`, `<select>`, ad-hoc `<button>` styling.
- **Always** use the project's Tailwind tokens + utilities:
  - Theme tokens live in `src/index.css` (`@theme` variables).
  - Glass morphism utilities: `glass-panel`, `glass-button-primary`, `glass-input`.
- **If you need inline styles**, prefer `src/theme/themeUtils.tsx` helpers.

## How to Add a New Feature (Standard Procedure)

1. **Decide ownership**: store vs hook vs rendering vs UI.
2. **Add/extend store** in `src/stores/` (selectors + `useShallow`).
3. **Add hook** in `src/hooks/` if orchestration or derived state is needed.
4. **Add UI** using `src/components/ui` primitives.
5. **If it impacts rendering**, add/modify a WebGPU pass or shader module.
6. **Add tests** in `src/tests/` mirroring the folder structure.
7. **If it impacts visual output**, add Playwright coverage in `scripts/playwright/`.

## Common Mistakes

- **Don't**: Add new object types beyond `'schroedinger'`.
  **Do**: Add new quantum modes or dimension-specific SDFs within the Schroedinger system.

- **Don't**: Subscribe to a whole Zustand store object.
  **Do**: Use individual selectors or `useShallow` selectors.

- **Don't**: Call `useShallow` inside another hook call.
  **Do**: Create the selector via `useShallow(...)` first, then pass it to the store hook.

- **Don't**: Hardcode colors or invent new design tokens.
  **Do**: Use Tailwind theme variables from `src/index.css`.

- **Don't**: Put scripts or screenshots in the repo root.
  **Do**: Use `scripts/tools/`, `scripts/playwright/`, and `screenshots/`.

- **Don't**: Create GPU resources without going through `WebGPUResourcePool`.
  **Do**: Use the resource pool for textures, buffers, and samplers.

- **Don't**: Access stores directly in render passes.
  **Do**: Use `getStore(ctx, 'storeName')` via the frame context.
