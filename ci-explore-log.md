## Active Target

- Feature: TDSE dynamics core for `ObjectType = 'schroedinger'`
- Patrol start: 2026-02-20
- Scope files (12):
  - `src/rendering/webgpu/passes/TDSEComputePass.ts`
  - `src/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/compute/tdseComplexPack.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/compute/tdseInit.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/compute/tdsePotential.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/compute/tdseApplyKinetic.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/compute/tdseAbsorber.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/compute/tdseStockhamFFT.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/compute/tdseDiagnostics.wgsl.ts`
  - `src/lib/physics/tdse/diagnostics.ts`

## Task Queue Details

1. [in_progress] Understand purpose of TDSE dynamics feature for schroedinger object type
2. [pending] Analyze src/rendering/webgpu/passes/TDSEComputePass.ts
3. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl.ts
4. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseComplexPack.wgsl.ts
5. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseInit.wgsl.ts
6. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdsePotential.wgsl.ts
7. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl.ts
8. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseApplyKinetic.wgsl.ts
9. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseAbsorber.wgsl.ts
10. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseStockhamFFT.wgsl.ts
11. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl.ts
12. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/compute/tdseDiagnostics.wgsl.ts
13. [pending] Analyze src/lib/physics/tdse/diagnostics.ts
14. [pending] Trace TDSE config flow (UI controls -> Zustand tdse slice -> renderer uniforms)
15. [pending] Trace TDSE execution flow (init -> split-operator steps -> density grid -> volumetric render)
16. [pending] Trace TDSE diagnostics flow (GPU readback -> CPU diagnostics -> UI/logs)
17. [pending] Evaluate TDSE feature against intended behavior and add issue/fix tasks

## Issues Found

- None currently open.

## Issues Fixed

- None yet.

## Deferred for Developer

- None.

---

## Active Target

- Feature: Front-End style guide documentation integrity (`docs/meta/styleguide.md`)
- Patrol start: 2026-02-20 (target 2)
- Scope files (1):
  - `docs/meta/styleguide.md`

## Task Queue Details

1. [completed] Understand purpose of Front-End style guide document (docs/meta/styleguide.md)
   - Evidence:
     - `AGENTS.md` marks this file as mandatory and non-optional for coding agents.
     - `docs/architecture.md` explicitly says “Read this first: docs/meta/styleguide.md”.
   - Intended behavior:
     - Provide authoritative, project-specific engineering rules (WebGPU/WGSL, modern CSS, imports, docs standards) without unrelated task text.
2. [in_progress] Analyze docs/meta/styleguide.md
3. [pending] Trace where docs/meta/styleguide.md is referenced/consumed
4. [pending] Evaluate style guide document against intended behavior
5. [pending] Fix corrupted/unrelated injected content in docs/meta/styleguide.md

## Issues Found

- None yet (target 2).

## Issues Fixed

- None yet (target 2).

## Deferred for Developer

- None.

---

## Active Target

- Feature: Schroedinger volume color algorithms (`ObjectType = 'schroedinger'` only)
- Patrol start: 2026-02-20 (target 3)
- Mission statement: This project's purpose is to teach and validate N-dimensional Schroedinger wavefunction simulations with correct, interpretable color encoding across supported quantum modes.
- Scope files (9):
  - `src/rendering/webgpu/shaders/schroedinger/volume/absorption.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/volume/crossSection.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/volume/index.ts`
  - `src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/volume/isolines2D.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/volume/nodalLines2D.wgsl.ts`
  - `src/rendering/webgpu/shaders/schroedinger/volume/radialProbability.wgsl.ts`

## Task Queue Details

1. [in_progress] Understand purpose of Schroedinger color algorithms (src/rendering/webgpu/shaders/schroedinger/volume)
2. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/volume/absorption.wgsl.ts
3. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/volume/crossSection.wgsl.ts
4. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl.ts
5. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts
6. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/volume/index.ts
7. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts
8. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/volume/isolines2D.wgsl.ts
9. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/volume/nodalLines2D.wgsl.ts
10. [pending] Analyze src/rendering/webgpu/shaders/schroedinger/volume/radialProbability.wgsl.ts
11. [pending] Trace color algorithm selection flow (UI/store -> WebGPUScene -> renderer uniforms -> WGSL branch)
12. [pending] Trace mode-specific color data flow (harmonic/hydrogen/free-scalar/tdse, analysis texture and nodal paths)
13. [pending] Evaluate Schroedinger color algorithm module against intended behavior

## Issues Found

- None currently open (target 3).

## Issues Fixed

- None yet (target 3).

## Deferred for Developer

- None (target 3).
