# Architecture Guide for LLM Coding Agents

**Purpose**: File placement, naming conventions, and code templates for this codebase.
**Read This When**: Creating new files, adding features, or understanding project structure.
**Stack**: React 19 + TypeScript 5 + Vite 7 + Zustand 5 + Custom WebGPU Renderer + WGSL Shaders + Rust/WASM

## Directory Map

| Directory | Purpose | File Pattern |
|-----------|---------|-------------|
| `src/components/ui/` | Reusable UI primitives | `PascalCase.tsx` |
| `src/components/layout/` | Layout frames, panels, drawers | `PascalCase.tsx` |
| `src/components/sections/` | Sidebar control sections | `SectionName/SectionName.tsx` |
| `src/components/canvas/` | Performance monitor, debug overlays | `PascalCase.tsx` |
| `src/components/controls/` | Domain controls (export, share) | `PascalCase.tsx` |
| `src/components/overlays/` | Modals and notifications | `PascalCase.tsx` |
| `src/components/presets/` | Scene/style preset managers | `PascalCase.tsx` |
| `src/constants/` | Shared constants (dimension limits, z-index) | `camelCase.ts` |
| `src/hooks/` | React hooks | `useCamelCase.ts` |
| `src/stores/` | Zustand stores | `camelCaseStore.ts` |
| `src/stores/slices/` | Store slices | `camelCaseSlice.ts` |
| `src/stores/slices/visual/` | Material, color, render, PBR slices | `camelCaseSlice.ts` |
| `src/stores/slices/geometry/` | Schroedinger slice | `camelCaseSlice.ts` |
| `src/stores/defaults/` | Default values per store | `*.ts` |
| `src/stores/utils/` | Preset serialization, merge helpers | `*.ts` |
| `src/lib/math/` | N-dimensional math utilities | `camelCase.ts` |
| `src/lib/geometry/` | Object type registry, presets | `camelCase.ts` |
| `src/lib/physics/` | Quantum physics computation | `camelCase.ts` |
| `src/lib/animation/` | Animation bias calculations | `camelCase.ts` |
| `src/lib/colors/` | Color utilities | `camelCase.ts` |
| `src/lib/export/` | Image/video export | `camelCase.ts` |
| `src/lib/url/` | URL state serialization | `camelCase.ts` |
| `src/lib/wasm/` | WASM bridge (animation math only) | `camelCase.ts` |
| `src/rendering/webgpu/core/` | WebGPUDevice, Camera, BasePass, UniformBuffer | `PascalCase.ts` |
| `src/rendering/webgpu/graph/` | Declarative render graph | `PascalCase.ts` |
| `src/rendering/webgpu/renderers/` | Schroedinger renderer, Skybox | `WebGPUPascalCase.ts` |
| `src/rendering/webgpu/passes/` | Post-processing passes | `PascalCasePass.ts` |
| `src/rendering/webgpu/shaders/` | WGSL shader modules | `camelCase.wgsl.ts` |
| `src/rendering/webgpu/utils/` | WebGPU-specific utilities | `camelCase.ts` |
| `src/types/` | TypeScript type declarations | `camelCase.ts` |
| `src/tests/` | Vitest tests (mirrors `src/` structure) | `*.test.ts(x)` |
| `scripts/playwright/` | E2E tests | `*.spec.ts` |

## Decision Tree: Where Does New Code Go?

```
Is it a React component?
  ├── Reusable primitive (button, slider, modal) → src/components/ui/
  ├── Layout structure → src/components/layout/
  ├── Sidebar section → src/components/sections/{Name}/{Name}.tsx
  ├── Canvas overlay → src/components/canvas/
  └── Modal/notification → src/components/overlays/

Is it a React hook?
  └── src/hooks/useCamelCase.ts

Is it state management?
  ├── New store → src/stores/camelCaseStore.ts
  ├── Slice for existing store → src/stores/slices/{domain}/camelCaseSlice.ts
  └── Default values → src/stores/defaults/

Is it pure logic (no React)?
  ├── Math → src/lib/math/
  ├── Physics → src/lib/physics/
  ├── Colors → src/lib/colors/
  └── Other utility → src/lib/{domain}/

Is it rendering?
  ├── New render pass → src/rendering/webgpu/passes/{Name}Pass.ts
  ├── New renderer → src/rendering/webgpu/renderers/WebGPU{Name}Renderer.ts
  ├── New shader → src/rendering/webgpu/shaders/{category}/{name}.wgsl.ts
  └── Core infrastructure → src/rendering/webgpu/core/

Is it a test?
  ├── Unit/integration → src/tests/{mirrors-src-path}/*.test.ts
  └── E2E → scripts/playwright/*.spec.ts
```

## Import Rules

- **Always** use `@/` path aliases: `import { Button } from '@/components/ui/Button'`
- **Prefer** direct file imports over barrel exports
- **Never** import stores directly in render passes — use `getStore(ctx, 'storeName')`

## Key Abstractions

| Abstraction | Location | Extend When |
|-------------|----------|-------------|
| `WebGPUBasePass` | `src/rendering/webgpu/core/WebGPUBasePass.ts` | Adding a new post-processing pass |
| Zustand store | `src/stores/*.ts` | Adding new global state domain |
| Zustand slice | `src/stores/slices/**/*.ts` | Adding sub-state to existing domain |
| `assembleShaderBlocks()` | `src/rendering/webgpu/shaders/shared/compose-helpers.ts` | Composing WGSL shaders |
| Render graph | `src/rendering/webgpu/graph/` | Adding pass dependencies |

## Template: New Render Pass

Inputs/outputs are declared via the `super()` call; the render graph reads
`config.inputs` / `config.outputs` to compute pass order. Implement
`createPipeline()` (called once during `initialize()`) and `execute()` (called
each frame).

```typescript
// src/rendering/webgpu/passes/{Name}Pass.ts
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'

/** Configuration for the {Name} pass. */
export interface {Name}PassOptions {
  colorInput?: string
  outputResource?: string
}

export class {Name}Pass extends WebGPUBasePass {
  constructor(options?: {Name}PassOptions) {
    const colorInput = options?.colorInput ?? 'scene-color'
    const outputResource = options?.outputResource ?? '{name}-output'

    super({
      id: '{name}',
      priority: 800, // Lower = earlier; see other passes for the band
      inputs: [{ resourceId: colorInput, access: 'read', binding: 0 }],
      outputs: [{ resourceId: outputResource, access: 'write', binding: 0 }],
    })
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    // Create pipeline, bind groups, uniform buffers
  }

  execute(ctx: WebGPURenderContext): void {
    // Read store state via ctx.frame.stores; encode the pass
  }
}
```

Wire the new pass through `src/rendering/webgpu/scenePassConstruction.ts`
(post-processing passes) or `src/rendering/webgpu/scenePassSetup.ts`
(Schroedinger passes), depending on the family. Registration is centralised
in those modules — `WebGPUScene.ts` only triggers the setup task.

## Template: New Zustand Store

```typescript
// src/stores/camelCaseStore.ts
import { create } from 'zustand'

interface CamelCaseState {
  value: number
  setValue: (v: number) => void
}

export const useCamelCaseStore = create<CamelCaseState>((set) => ({
  value: 0,
  setValue: (v) => set({ value: v }),
}))
```

## Template: New Section Component

```tsx
// src/components/sections/{Name}/{Name}.tsx
import { useShallow } from 'zustand/react/shallow'
import { Section } from '@/components/sections/Section'
import { Slider } from '@/components/ui/Slider'

export function {Name}Section() {
  const { value, setValue } = useSomeStore(
    useShallow((s) => ({ value: s.value, setValue: s.setValue }))
  )

  return (
    <Section title="{Name}">
      <Slider label="Value" value={value} onChange={setValue} min={0} max={1} />
    </Section>
  )
}
```

## Forbidden Locations

| Location | Rule |
|----------|------|
| Project root | No scripts, screenshots, or scratch files |
| `src/rendering/` (non-webgpu) | No WebGL, no Three.js, no GLSL |
| Raw HTML elements in components | Use `src/components/ui/*` primitives |

## On-Demand References

| Domain | Serena Memory |
|--------|---------------|
| Detailed folder map | `codebase_structure` |
| WebGPU pipeline patterns | `webgpu_coding_guide` |
| Bind group architecture | `webgpu_bind_group_architecture` |
| Camera data flow | `webgpu_camera_data_flow` |
