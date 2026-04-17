# Architecture Decision Records

Key design decisions and their rationale. Each entry captures **why** a choice was made, not just what was chosen.

## ADR-001: Singleton WebGPUDevice

**Context**: A browser page has exactly one GPU adapter and one `GPUDevice`. Multiple device instances waste VRAM and complicate device-loss recovery.

**Decision**: `WebGPUDevice` uses a private constructor with `getInstance()`. `resetForTesting()` provides test isolation.

**Alternatives rejected**:
- React Context: couples GPU layer to React, but render passes (non-React classes) need device access.
- Factory/DI: callers would pass the device through every constructor for no benefit since the instance is inherently global.

**File**: `src/rendering/webgpu/core/WebGPUDevice.ts`

## ADR-002: Pre-allocated Frame Contexts

**Context**: The render loop runs at 60+ FPS. Allocating objects per frame creates GC pressure that causes frame time spikes.

**Decision**: `WebGPURenderGraph` and `useSceneFrameLoop` pre-allocate reusable context objects with nullable fields. Fields are populated before use in `execute()` and cast to non-null at the consumption site.

**Trade-off**: Nullable internal types require a documented cast at the usage site. Accepted because: (1) the lifecycle guarantee is enforced by the render graph, (2) the alternative (per-frame allocation) causes measurable GC stutters.

**Files**: `src/rendering/webgpu/graph/WebGPURenderGraph.ts`, `src/rendering/webgpu/useSceneFrameLoop.ts`

## ADR-003: WASM-Optional with JS Fallbacks

**Context**: The Rust/WASM module provides faster rotation and projection math, but WASM initialization is async and may fail.

**Decision**: Every WASM function has a JS fallback. The app initializes WASM asynchronously at startup and gracefully degrades to JS if it fails. The WASM binary is ~111KB.

**Why not WASM-required**: Users on older browsers or restricted environments should still get a functional app. The JS fallbacks are fast enough for interactive use; WASM provides measurable improvement only for high-dimensional (8D+) animations.

**File**: `src/lib/wasm/animation-wasm.ts`

## ADR-004: Safari Hard-Block

**Context**: Safari's WGSL shader compiler (WebKit r292839, Safari 18.x) hangs on the quantum wavefunction shaders due to deep nested loops and large constant arrays.

**Decision**: Safari is detected via UA string and rendering is blocked with an informational modal. Users cannot proceed to rendering.

**Why not degraded mode**: The issue is shader compilation, not runtime performance. Even the simplest mode (HO 1D) triggers the hang. Stripping the physics to avoid the compiler bug would produce a non-functional app.

**Revisit when**: WebKit ships an updated WGSL compiler (WebKit bug 263444).

**File**: `src/App.tsx` (isSafari detection and SafariChoice state)

## ADR-005: Coverage Exclusions for GPU-Only Code

**Context**: ~27 render pass files contain exclusively WebGPU API calls (`device.createComputePipeline`, `device.createBindGroup`, `dispatchWorkgroups`). These cannot execute in Vitest's happy-dom environment.

**Decision**: Exclude these files from Vitest coverage. They are verified by Playwright e2e tests that run with real GPU rendering. Each exclusion is documented with the rationale in `vitest.config.ts`.

**Audit criterion**: A file should be excluded ONLY if it has no testable business logic — every function must be a direct GPU API wrapper. Files with pure math or data transformation (even if they also use GPU APIs) should NOT be excluded.

**Last audit**: 2026-03-27. Removed 3 files from exclusion (gizmoGround, skyboxVertexData, useRotationUpdates) that contained pure logic.

**File**: `vitest.config.ts` coverage.exclude

## ADR-006: Preset Serialization TRANSIENT_FIELDS

**Context**: Zustand stores contain both persistent state (colors, dimensions) and transient runtime state (interaction flags, compilation state). Scene presets should save/load persistent state only.

**Decision**: `TRANSIENT_FIELDS` in `presetSerialization.ts` is a Set of field names stripped during serialization. Transient fields are never written to preset files and never restored from them.

**Why not separate stores**: The transient fields are closely coupled to their persistent siblings (e.g., `isInteracting` lives with `renderResolutionScale` because they're both performance concerns). Separate stores would increase import complexity for render passes that need both.

**File**: `src/stores/utils/presetSerialization.ts`

## ADR-007: Expression Parser (No eval)

**Context**: Users can define custom quantum potential functions V(x,y,z) as mathematical expressions.

**Decision**: A recursive-descent parser evaluates expressions safely without `eval()` or `new Function()`. Supports arithmetic, trig, and common math functions via a whitelist.

**Why not eval**: User-provided strings in eval is a textbook security vulnerability. The custom parser has zero attack surface — it only evaluates a fixed grammar of mathematical operations.

**File**: `src/lib/physics/expressionParser.ts`

## ADR-008: Manual Chunk Splitting

**Context**: Rollup's automatic code splitting creates circular chunk dependencies that cause TDZ ReferenceErrors in production builds.

**Decision**: `vite.config.ts` defines explicit chunk boundaries via `manualChunks`. The chunk DAG is documented:
```
core-utils (leaf) <- physics <- stores -> shaders
                         ^                  ^
                  shaders-schroedinger    rendering -> stores
```

**Enforcement**: `scripts/check-chunk-cycles.js` runs as part of `pnpm run build` and fails CI on circular chunk dependencies.

**File**: `vite.config.ts` (assignChunk function)
