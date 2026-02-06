# Rendering Pipeline Refactoring Plan

## Executive Summary

Complete refactoring of the mDimension rendering pipeline to address architectural issues identified in `docs/architecture-review.md`. The refactor consists of **7 phases** with explicit acceptance criteria and rollback gates per reviewer feedback.

**Feedback Incorporated:** `docs/architecture-feedback1.md`, `docs/architecture-feedback2.md`

---

## Phase Overview

| Phase | Name | Risk | Dependencies | Acceptance Gate |
|-------|------|------|--------------|-----------------|
| 0 | useFrame Priority & Baseline | LOW | None | Timing logs verified, golden screenshots captured |
| 1 | Shared Hooks (Composition) | LOW | Phase 0 | No visual regressions vs golden set |
| 2 | Uniform Manager | LOW | Phase 1 | Renderers functional, code reduction verified |
| 3 | Render Graph Foundation | LOW | None | Unit tests pass, vertical slice working |
| 4 | Render Graph Migration | MEDIUM | Phase 3 | PostProcessingV2 matches V1 golden set |
| 5 | Screen-Space Lensing | MEDIUM | Phase 4 | Lensing visible, perf budget met |
| 6 | Renderer Cleanup | MEDIUM | Phases 1, 2, 4 | All tests pass, boilerplate reduced |

**Rollback Policy:** Each phase has a feature flag. If acceptance gate fails, revert to previous phase and investigate.

---

## Phase 0: useFrame Priority & Baseline Capture (LOW RISK)

**Rationale (from feedback):** This is low-hanging fruit that stabilizes the system immediately without requiring the full Render Graph. Also establishes golden screenshots before any refactoring begins.

### Problem
All 16 useFrame calls use default priority 0. While R3F executes these deterministically in registration order, the **real risk is hidden dependencies on registration timing**—not randomness. Components may silently depend on being registered before/after others.

### Solution
1. Create centralized priority constants for explicit ordering
2. Capture baseline golden screenshots before any changes

### Step 0.1: Baseline Capture (BEFORE any code changes)

```bash
# Create golden screenshot set for all renderer types
npm run test:playwright -- --update-snapshots
```

**Golden Set Requirements:**
| Scene | Effects | Purpose |
|-------|---------|---------|
| Mandelbulb default | Bloom, SSR | Fractal baseline |
| Black Hole + walls | Bloom, fog | Lensing reference |
| Schrödinger cloud | Temporal, volumetric | Temporal baseline |
| Quaternion Julia | SSR, shadows | Julia baseline |
| Polytope 4D tesseract | Shadow maps | Non-raymarch baseline |

Store in `screenshots/golden/` for regression comparison.

### Step 0.2: Priority Constants

**File:** `src/rendering/core/framePriorities.ts`
```typescript
/**
 * Explicit useFrame priorities to document hidden dependencies.
 * Lower numbers run first. R3F default is 0.
 */
export const FRAME_PRIORITY = {
  ENVIRONMENT_CAPTURE: -30,  // Cubemap capture first (black hole needs this)
  SKYBOX_CAPTURE: -20,       // Skybox to cubemap
  BLACK_HOLE_UNIFORMS: -10,  // Needs envMap ready
  RENDERER_UNIFORMS: -5,     // Other renderer updates
  CAMERA: 0,                 // Camera controller (default)
  ANIMATION: 0,              // Animation state (order within 0 is registration-based)
  RENDERERS: 0,              // General renderers
  POST_EFFECTS: 10,          // Post-processing
  STATS: 20,                 // Performance stats (last)
} as const;
```

### Step 0.3: Migrate useFrame Calls (16 total)

| File | Current Priority | New Priority | Reason |
|------|-----------------|--------------|--------|
| ProceduralSkyboxWithEnvironment.tsx:141 | 0 | SKYBOX_CAPTURE | Must complete before black hole reads envMap |
| useBlackHoleUniformUpdates.ts:186 | 0 | BLACK_HOLE_UNIFORMS | Depends on envMap being ready |
| PostProcessing.tsx:925 | 0 | POST_EFFECTS | Runs after all scene updates |
| PerformanceStatsCollector.tsx:120 | 0 | STATS | Always last |
| (12 others) | 0 | (appropriate) | Document dependencies |

### Acceptance Criteria
- [ ] Golden screenshots captured in `screenshots/golden/`
- [ ] All 16 useFrame calls have explicit priority
- [ ] Console timing logs show correct execution order
- [ ] All existing tests pass
- [ ] No visual diff vs golden set (Playwright `toHaveScreenshot`)

---

## Phase 1: Shared Hooks via Composition (LOW RISK)

**Rationale (from feedback):** Class inheritance (BaseRaymarchRenderer) fights React's lifecycle. Use composition via shared hooks instead—this is idiomatic React and integrates naturally with the hook-based codebase.

### Problem
~1250 lines of duplicated boilerplate across 5 renderers (rotation matrices, quality tracking, layer assignment, etc.).

### Solution
Extract shared logic into composable hooks. **No class inheritance.**

### Files to Create
```
src/rendering/renderers/base/
├── types.ts                   # WorkingArrays, MAX_DIMENSION
├── useRotationUpdates.ts      # Basis vector computation with memoization
├── useQualityTracking.ts      # Adaptive quality, fast mode detection
├── useLayerAssignment.ts      # Layer assignment with cleanup
├── useFramePriority.ts        # Wrapper enforcing priority constants
└── index.ts
```

### Hook Signatures
```typescript
// Rotation with caching (avoids recomputation when unchanged)
function useRotationUpdates(options: {
  dimensions: number;
  rotationSpeeds: Float32Array;
  enabled: boolean;
}): {
  updateRotation: (uniforms: Record<string, IUniform>, delta: number) => void;
  rotationsChanged: boolean;
  basisVectors: Float32Array;
};

// Quality tracking with useFrame priority built-in
function useQualityTracking(options: {
  shaderName: string;
  priority?: number;  // defaults to FRAME_PRIORITY.RENDERER_UNIFORMS
}): {
  fastMode: boolean;
  qualityMultiplier: number;
  updateQuality: (rotationsChanged: boolean) => void;
};

// Layer assignment with automatic cleanup on unmount
function useLayerAssignment(
  meshRef: RefObject<THREE.Mesh>,
  layer: number
): void;
```

### Acceptance Criteria
- [ ] All shared hooks have unit tests
- [ ] Hooks use FRAME_PRIORITY constants internally
- [ ] No visual regression vs Phase 0 golden set
- [ ] MandelbulbMesh migrated as proof-of-concept

---

## Phase 2: Uniform Manager (LOW RISK)

### Problem
Uniform updates scattered across renderers with no caching or version tracking.

### Solution
Centralized uniform sources with change detection.

### Files to Create
```
src/rendering/uniforms/
├── UniformSource.ts           # Interface for uniform sources
├── UniformManager.ts          # Registry with version tracking
├── sources/
│   ├── LightingSource.ts      # Light uniforms with shadow data caching
│   ├── TemporalSource.ts      # Temporal reprojection matrices
│   ├── QualitySource.ts       # Quality multiplier from performanceStore
│   └── ColorSource.ts         # Color algorithm uniforms
└── index.ts
```

### Key Interface
```typescript
interface UniformSource {
  readonly id: string;
  readonly version: number;  // Incremented on change
  getUniforms(): Record<string, THREE.IUniform>;
  update(state: UniformUpdateState): void;
}

class UniformManager {
  register(source: UniformSource): void;
  applyToMaterial(material: ShaderMaterial, sourceIds: string[]): void;
  hasChanges(sourceIds: string[]): boolean;  // Check version numbers
}
```

### Acceptance Criteria
- [ ] LightingSource caches shadow data (no per-frame scene traversal)
- [ ] Version tracking prevents unnecessary uniform updates
- [ ] Unit tests for all sources
- [ ] No visual regression vs golden set

---

## Phase 3: Render Graph Foundation (LOW RISK)

**Rationale (from feedback):** The RenderGraph interface was incomplete. Must include resource descriptors with size policy, format, MSAA, explicit access modes, cycle detection, and automatic ping-pong for read-while-write hazards.

### Problem
PostProcessing.tsx is 1670+ lines with implicit pass ordering.

### Solution
Create declarative render graph with automatic dependency resolution.

### Step 3.1: Vertical Slice Prototype

**Before full implementation**, create a minimal prototype with just 2 passes:
```typescript
// Prototype: ScenePass -> BloomPass -> Screen
const graph = new RenderGraph();
graph.addResource({ id: 'sceneColor', type: 'renderTarget', size: { mode: 'screen' } });
graph.addPass(new ScenePass({ outputs: ['sceneColor'] }));
graph.addPass(new BloomPass({ inputs: ['sceneColor'], outputs: [] }));
graph.compile().execute(renderer, scene, camera);
```

This validates API design before migrating the full pipeline.

### Step 3.2: Full Implementation

### Files to Create
```
src/rendering/graph/
├── types.ts                   # RenderPass, RenderResource, RenderContext
├── RenderGraph.ts             # Main orchestrator
├── GraphCompiler.ts           # Topological sort, cycle detection, hazard analysis
├── ResourcePool.ts            # Render target pooling with resize handling
├── RenderContext.ts           # Pass execution context
└── index.ts
```

### Enhanced Resource Interface (per feedback)
```typescript
interface RenderResourceConfig {
  id: string;
  type: 'texture' | 'renderTarget' | 'mrt' | 'cubemap';

  // Size policy
  size: {
    mode: 'screen' | 'fixed' | 'fraction';
    width?: number;
    height?: number;
    fraction?: number;  // e.g., 0.5 for half-res
  };

  // Format specification
  format?: THREE.PixelFormat;
  internalFormat?: THREE.PixelFormatGPU;  // e.g., RGBA16F for HDR
  type?: THREE.TextureDataType;

  // MRT configuration
  attachmentCount?: number;
  attachmentFormats?: THREE.PixelFormat[];

  // MSAA
  samples?: number;

  // Lifecycle
  persistent?: boolean;  // Survive across frames (for temporal)

  // Depth/stencil
  depthBuffer?: boolean;
  stencilBuffer?: boolean;
}

interface ResourceAccess {
  resourceId: string;
  access: 'read' | 'write' | 'readwrite';
  // For readwrite (ping-pong), compiler auto-allocates swap buffer
}

interface RenderPassConfig {
  id: string;
  inputs: ResourceAccess[];   // Read access with explicit mode
  outputs: ResourceAccess[];  // Write access
  enabled?: () => boolean;
}

interface RenderPass {
  readonly id: string;
  readonly config: RenderPassConfig;
  execute(ctx: RenderContext): void;
}

class RenderGraph {
  addResource(config: RenderResourceConfig): this;
  addPass(pass: RenderPass): this;
  compile(): CompiledGraph;
  execute(renderer, scene, camera, delta): void;
}
```

### GraphCompiler Responsibilities
1. **Topological sort** - Order passes by dependencies
2. **Cycle detection** - Error on circular dependencies
3. **Read-while-write hazard detection** - Auto ping-pong allocation
4. **Resource lifetime analysis** - Determine when to allocate/free
5. **Validation** - Warn on unused resources, missing inputs

### Acceptance Criteria
- [ ] Vertical slice prototype working (2-pass chain)
- [ ] GraphCompiler detects cycles and throws
- [ ] Read-while-write automatically handled with ping-pong
- [ ] ResourcePool handles resize and context loss correctly
- [ ] Unit tests for all compiler logic

---

## Phase 4: Render Graph Migration (MEDIUM RISK)

### Problem
Need to migrate existing passes to RenderGraph system.

### Solution
Create built-in pass implementations and PostProcessingV2.

### Files to Create
```
src/rendering/graph/passes/
├── ScenePass.ts               # Renders scene with layer support
├── DepthPass.ts               # Depth-only rendering
├── NormalPass.ts              # G-buffer normals
├── FullscreenPass.ts          # Generic shader pass
├── CompositePass.ts           # Blend multiple inputs
├── EffectComposerPass.ts      # Wraps Three.js EffectComposer
└── ScreenSpaceLensingPass.ts  # Deferred lensing (screen-space)

src/rendering/environment/
└── PostProcessingV2.tsx       # New implementation using RenderGraph
```

### Resource Definitions
```typescript
graph.addResource({
  id: 'sceneTarget',
  type: 'renderTarget',
  size: { mode: 'screen' },
  internalFormat: THREE.RGBA16F,  // HDR
  depthBuffer: true,
});

graph.addResource({
  id: 'objectDepthTarget',
  type: 'renderTarget',
  size: { mode: 'screen' },
  depthBuffer: true,
});

graph.addResource({
  id: 'mainObjectMRT',
  type: 'mrt',
  size: { mode: 'screen' },
  attachmentCount: 2,  // color + normal
});
```

### Migration Strategy
1. Create PostProcessingV2.tsx using RenderGraph
2. Add feature flag: `useRenderGraphV2` in advancedRenderingSlice
3. Side-by-side visual comparison vs golden set
4. Migrate effects one by one (bloom → SSR → volumetric → etc.)
5. Remove V1 after validation

### Acceptance Criteria
- [ ] PostProcessingV2 renders identical output to V1 (golden set match)
- [ ] Feature flag allows instant rollback
- [ ] All existing Playwright tests pass with V2
- [ ] Performance within 5% of V1 (measure FPS, GPU time)

---

## Phase 5: Screen-Space Lensing (MEDIUM RISK)

**Rationale (from feedback):** Full cubemap capture (6 faces/frame) is expensive and doesn't preserve near-field parallax for walls/ground. Use **hybrid approach**: screen-space deferred lensing using scene color+depth for nearby objects, plus static sky cubemap for distant sky only.

### Problem
- Deferred lensing shader exists (`deferred-lensing.glsl.ts`) but is NOT integrated
- Current approach only captures SKYBOX layer, missing walls entirely

### Solution: Hybrid Approach

1. **Static Sky Cubemap** - Capture procedural sky once (on skybox change), not per-frame
2. **Screen-Space Lensing** - Use scene color + depth buffer for nearby objects (walls, floor)
3. **Configurable Resolution** - Sky cubemap resolution controllable (256 for performance, 1024 for quality)

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│ Screen-Space Lensing Pass                                    │
│                                                             │
│   Inputs:                                                   │
│     - sceneColor (full scene render)                        │
│     - sceneDepth (depth buffer)                             │
│     - staticSkyCubemap (procedural sky, updated on change)  │
│     - blackHolePosition (screen-space)                      │
│     - blackHoleParams (mass, strength, falloff)             │
│                                                             │
│   Algorithm:                                                │
│     1. For each fragment, compute lensed UV                 │
│     2. If lensed UV samples nearby object (depth check):    │
│        → Sample sceneColor at lensed UV                     │
│     3. Else (samples sky):                                  │
│        → Sample staticSkyCubemap with lensed direction      │
│     4. Apply chromatic aberration if enabled                │
└─────────────────────────────────────────────────────────────┘
```

### Files to Create
```
src/rendering/graph/passes/ScreenSpaceLensingPass.ts
  - Implements hybrid lensing algorithm
  - Uses existing deferred-lensing.glsl.ts logic

src/rendering/shaders/postprocessing/screenSpaceLensing.glsl.ts
  - Adapted from deferred-lensing.glsl.ts
  - Adds depth-aware sampling
```

### Files to Modify
```
src/rendering/environment/ProceduralSkyboxWithEnvironment.tsx
  - Capture sky cubemap on skybox parameter change (not per-frame)
  - Make resolution configurable: 256 (fast) / 512 (balanced) / 1024 (quality)

src/stores/slices/geometry/blackholeSlice.ts
  - Add lensing settings (see below)
```

### Store Additions (blackholeSlice.ts)
```typescript
// Lensing settings
screenSpaceLensingEnabled: boolean;      // default: true when black hole
lensingStrength: number;                 // default: 0.02
lensingFalloff: number;                  // default: 1.5
chromaticAberrationEnabled: boolean;     // default: true
chromaticAberrationAmount: number;       // default: 0.5
skyCubemapResolution: 256 | 512 | 1024;  // default: 512
```

### Pass Order (after integration)
```
1. Object Depth Pass
2. Scene Render (includes walls, floor, main object)
3. Screen-Space Lensing Pass (if black hole)  <- NEW
4. Effect Composer Chain (bloom, bokeh, etc.)
```

Note: Sky cubemap updated only on skybox parameter changes, not per-frame.

### Acceptance Criteria
- [ ] Lensing distorts both walls AND skybox correctly
- [ ] Chromatic aberration visible at edges
- [ ] Performance: <2ms GPU time for lensing pass at 1080p
- [ ] Sky cubemap updates only when skybox settings change
- [ ] No visual artifacts at depth discontinuities

---

## Phase 6: Renderer Migration & Cleanup (MEDIUM RISK)

### Problem
Renderers still have duplicated code after Phases 1-5.

### Solution
Migrate all renderers to use base hooks and UniformManager.

### Migration Order
1. **MandelbulbMesh.tsx** (template - most complex)
2. **QuaternionJuliaMesh.tsx** (similar to Mandelbulb)
3. **SchroedingerMesh.tsx** (has temporal accumulation)
4. **BlackHoleMesh.tsx** (already has some hook extraction)

### Per-Renderer Changes
```typescript
// Before (duplicated in each renderer)
const MAX_DIMENSION = 11;
function applyRotationInPlace(...) { /* 15 lines */ }
interface WorkingArrays { /* 10 lines */ }
function createWorkingArrays() { /* 15 lines */ }
// ... 250+ more lines

// After
import {
  useRotationUpdates,
  useQualityTracking,
  MAX_DIMENSION,
} from '../base';
import { UniformManager } from '@/rendering/uniforms';

const { updateRotation, rotationsChanged } = useRotationUpdates({...});
const { fastMode, qualityMultiplier, updateQuality } = useQualityTracking();

useFrame((_, delta) => {
  updateQuality(rotationsChanged);
  updateRotation(material.uniforms, delta);
  UniformManager.applyToMaterial(material, ['lighting', 'temporal']);
  // ... renderer-specific uniforms only
}, FRAME_PRIORITY.RENDERER_UNIFORMS);  // Explicit priority
```

### Shadow System Clarification (per feedback)

**NOT a unified shadow system** - SDF soft shadows (raymarched) and shadow maps (mesh-based) are mathematically different and cannot be merged. Instead, create **coordinated shadow abstractions**:

```typescript
// Shared shadow configuration interface
interface ShadowConfig {
  enabled: boolean;
  quality: 'low' | 'medium' | 'high';
  softness: number;
  bias: number;
}

// Each technique implements this interface differently
// - SDF shadows: quality affects step count (8/16/24/32)
// - Shadow maps: quality affects resolution (512/1024/2048/4096)
```

### Cleanup Tasks
1. Remove PostProcessing.tsx (V1) after V2 validated
2. Remove feature flags
3. Update documentation
4. Run full test suite

### Acceptance Criteria
- [ ] Each renderer reduced by ~200-300 lines
- [ ] All renderers use shared hooks from `base/`
- [ ] useFrame calls use explicit FRAME_PRIORITY constants
- [ ] No visual regression vs golden set
- [ ] All unit tests pass

---

## Critical Files Summary

### New Files (by phase)
| Phase | Files |
|-------|-------|
| 0 | `src/rendering/core/framePriorities.ts`, `screenshots/golden/*` |
| 1 | `src/rendering/renderers/base/*` (hooks) |
| 2 | `src/rendering/uniforms/*` |
| 3 | `src/rendering/graph/*` |
| 4 | `src/rendering/graph/passes/*`, `PostProcessingV2.tsx` |
| 5 | `ScreenSpaceLensingPass.ts`, `screenSpaceLensing.glsl.ts` |
| 6 | None (migrations only) |

### Key Files to Modify
1. `src/rendering/environment/PostProcessing.tsx` - God component to refactor
2. `src/rendering/environment/ProceduralSkyboxWithEnvironment.tsx` - Static sky cubemap
3. `src/rendering/renderers/*/` - All 4 raymarched renderers
4. `src/stores/slices/geometry/blackholeSlice.ts` - Add lensing settings
5. All 16 files with useFrame calls (Phase 0)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Visual regressions | Golden set in Phase 0, Playwright `toHaveScreenshot` |
| Performance regression | GPU timing per pass, FPS budget gates |
| Breaking existing features | Feature flags for V1/V2 switching |
| Circular dependencies | GraphCompiler validates at compile time |
| Context loss handling | ResourcePool handles recreate on restore |
| Rollback needed | Each phase can be reverted via feature flag |

---

## Performance Instrumentation Plan (per feedback)

### GPU Timing Per Pass
```typescript
// Add to RenderContext
interface PassTiming {
  passId: string;
  gpuTimeMs: number;
  cpuTimeMs: number;
}

class RenderGraph {
  getPassTimings(): PassTiming[];  // For debug overlay
  enableTimingQueries(enabled: boolean): void;
}
```

### Debug Overlay
- Per-pass GPU time (EXT_disjoint_timer_query)
- Total frame time breakdown
- Memory usage (render target count, total VRAM estimate)
- Toggle to isolate individual passes

### Performance Budgets
| Metric | Budget | Measurement |
|--------|--------|-------------|
| Total frame | 16.6ms (60fps) | requestAnimationFrame delta |
| Lensing pass | <2ms | GPU timer query |
| Bloom pass | <3ms | GPU timer query |
| Scene render | <8ms | GPU timer query |
| Memory | <500MB VRAM | Estimated from target sizes |

---

## Testing Strategy

### Unit Tests
- GraphCompiler: topological sort, cycle detection, hazard analysis
- ResourcePool: allocation, resize, disposal, context loss
- UniformManager: version tracking, caching
- Base hooks: rotation updates, quality tracking

### Integration Tests
- Pass execution order verification
- Resource creation with correct specs
- Dynamic enable/disable
- Feature flag V1/V2 parity

### Visual Regression (Playwright)
```typescript
// Golden set tests (Phase 0)
const goldenScenes = [
  { object: 'mandelbulb', effects: ['bloom', 'ssr'] },
  { object: 'blackhole', effects: ['bloom', 'fog'], walls: true },
  { object: 'schroedinger', effects: ['temporal', 'volumetric'] },
  { object: 'quaternion', effects: ['ssr', 'shadows'] },
  { object: 'polytope', effects: ['shadowMaps'] },
];

for (const scene of goldenScenes) {
  test(`${scene.object} matches golden`, async ({ page }) => {
    await loadScene(scene);
    await expect(page).toHaveScreenshot(`golden/${scene.object}.png`);
  });
}
```

---

## Success Criteria

### Quantitative
1. **PostProcessing.tsx reduced from 1670 to ~200 lines**
2. **Renderer boilerplate reduced by ~1000 lines total**
3. **All 16 useFrame calls have explicit priorities**
4. **Performance within 5% of baseline FPS**
5. **All 5 golden scene tests pass**
6. **100% unit test coverage for new code**

### Qualitative
7. **Black hole correctly lenses both walls AND skybox**
8. **No race conditions from implicit useFrame ordering**
9. **Feature flags allow instant rollback at any phase**
10. **RenderGraph API is clear and documented**

---

## Feedback Integration Summary

| Feedback Source | Issue | Resolution |
|-----------------|-------|------------|
| feedback1.md | Cubemap too expensive for walls | Hybrid: screen-space lensing + static sky cubemap |
| feedback1.md | RenderGraph interface incomplete | Added resource descriptors, access modes, hazard detection |
| feedback1.md | Missing acceptance criteria | Added per-phase acceptance gates |
| feedback1.md | useFrame ordering overstated | Clarified: issue is hidden dependencies, not randomness |
| feedback1.md | BaseRaymarchRenderer inheritance | Changed to composition via hooks |
| feedback1.md | "Unified shadow" vague | Renamed to "coordinated shadow abstractions" |
| feedback2.md | Prioritize useFrame fix | Moved to Phase 0 |
| feedback2.md | Baseline capture | Added golden screenshots step |
| feedback2.md | Vertical slice prototype | Added before full RenderGraph |
| feedback2.md | Performance instrumentation | Added GPU timing plan |
