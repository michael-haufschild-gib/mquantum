# Handoff: Finish the uniform→storage migration for compute shaders

**Status:** mid-refactor, broken state. The previous session bulk-edited shader files with `sed` and walked away with the coupled pipeline-setup edits unfinished, leaving shader declarations out of sync with the bind group layouts. The app will fail at `device.createComputePipeline()` until this is finished.

**NEVER use bulk scripted edits for source code in this repo.** Scripted `sed`/`awk` across multiple files destroys cross-file invariants (the previous session proved this exact pattern — WGSL shaders changed but the corresponding BGL entries and buffer usage flags in TypeScript setup files were not kept in sync). Edit file-by-file with the `Edit` tool. After each WGSL change, update the matching BGL entry AND the matching buffer-usage flag AND re-run `pnpm exec tsc --noEmit` before moving on.

## What's done (verified)

- `FreeScalarUniforms` is fully migrated end-to-end:
  - 5 WGSL files under `src/rendering/webgpu/shaders/schroedinger/compute/freeScalar*.wgsl.ts` use `var<storage, read> params: FreeScalarUniforms`.
  - `FreeScalarFieldComputePassSetup.ts` BGL entries for bindings-0 are `'read-only-storage'`.
  - `FreeScalarFieldComputePassBuffers.ts` creates the params buffer with `GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST`.
  - Verified: `pnpm test:shaders` for the `schroedinger-compute` subset reports +5 passing shaders and −5 known-deviations after this migration.

## What's half-done (broken state to repair)

All of these structs had their **shader-side** bindings changed via `sed` from `var<uniform>` to `var<storage, read>`. Their **pipeline-side** (BGL entries + buffer usage) is NOT updated yet. The two sides disagree — the bind group layout will fail validation at pipeline creation.

Structs affected (and the pipeline-setup files that need matching edits):

| Struct | Shader files already flipped to `storage, read` | Pipeline-setup file still on `'uniform'` + `GPUBufferUsage.UNIFORM` |
|---|---|---|
| `TDSEUniforms` | `tdseInit.wgsl.ts`, `tdseApplyPotentialHalf.wgsl.ts`, `tdseStochasticExpect.wgsl.ts`, `becHawkingInject.wgsl.ts`, `vortexDetect.wgsl.ts` (binding 3), `tdseApplyKinetic.wgsl.ts`, `tdseFusedKernels.wgsl.ts`, `tdseWormholeCouple.wgsl.ts`, `tdseWriteGrid.wgsl.ts`, `tdseCurvedKinetic.wgsl.ts` (4 bindings: binding-0 in three blocks + `curvedStageParams` + `curvedAccParams`), `tdsePotential.wgsl.ts`, `tdseStochasticLoc.wgsl.ts`, `tdseAbsorber.wgsl.ts` | `TDSEComputePassSetup.ts` (many BGLs — 15+ entries with `'uniform'` that need to flip to `'read-only-storage'`); `TDSEComputePassBuffers.ts` (the tdse-uniforms buffer is already flipped to STORAGE) |
| `DiracUniforms` | `diracInit.wgsl.ts`, `diracPotential.wgsl.ts`, `diracPotentialHalf.wgsl.ts`, `diracAbsorber.wgsl.ts`, `diracKinetic.wgsl.ts`, `diracWriteGrid.wgsl.ts` | `DiracComputePassSetup.ts` BGL entries; `DiracComputePassBuffers.ts` buffer usage |
| `PauliUniforms` | `pauliInit.wgsl.ts`, `pauliPotentialHalf.wgsl.ts`, `pauliAbsorber.wgsl.ts`, `pauliKinetic.wgsl.ts`, `pauliWriteGrid.wgsl.ts` | `PauliComputePassSetup.ts` BGL entries; `PauliComputePassBuffers.ts` buffer usage |
| `ObsReduceUniforms` / `ObsMomReduceUniforms` | `observablesPositionReduce.wgsl.ts`, `observablesMomentumReduce.wgsl.ts` | `TDSEObservablesGSPipelines.ts` BGL entries + buffer usage (check where `obsParams` bind group is built) |
| `EnergySpectrumUniforms` | `energySpectralDensity.wgsl.ts` | same file as above (energy-spectrum pipeline) |
| `TDSEUniforms` (secondary binding) | `vortexDetect.wgsl.ts` at `@binding(3)` | `TDSEVortexDetect.ts` BGL entry + buffer usage |

Additionally, the following structs referenced in the spike's triage but not yet touched — verify whether they have the same issue: `QWDiagUniforms`, `QWAbsorberUniforms`, `PauliDiagUniforms`, `VortexDetectUniforms`, `StochasticParams`, `ExpectFinalizeUniforms`. If their backing structs contain scalar arrays (`array<*, N>` with stride 4), they need the same migration.

## How to verify per-file

After every single WGSL-side flip to `var<storage, read>`:

1. `Edit` the matching `createComputeBGL` entry in the setup file: change `'uniform'` to `'read-only-storage'` on the binding that holds the struct you just migrated. ONLY that one binding — the other entries (psi buffers, etc.) stay as they were.
2. `Edit` the matching `createBuffer` or `createUniformBuffer` call. Replace the `createUniformBuffer` helper call with an inline `device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label })` (preserve the label).
3. Run `pnpm exec tsc --noEmit -p tsconfig.json` and confirm zero errors.
4. Run `WGSL_VALIDATE=1 WGSL_SUBSET=schroedinger-compute pnpm exec vitest run src/tests/rendering/wgsl/wgslValidation.test.ts --reporter=verbose` and confirm the `known-deviations` count does NOT increase (and ideally drops). The validator counts unique composed WGSL after sha256 dedup, so a single migrated file can change zero, one, or several counted deviations depending on specialization overlap — do not chase a strict 1:1 drop per file.
5. Run `pnpm exec vitest run` (full unit suite) and confirm no regressions.
6. Only after (1–5) green, move to the next struct.

## How to verify end-to-end after all structs migrated

```sh
pnpm exec tsc --noEmit -p tsconfig.json   # green
pnpm exec vitest run                       # 8406 passing, 0 regressions
pnpm test:shaders                          # 0 failures, 0 known-deviations
pnpm test:shaders:tint                     # 500/500 pass through real Chrome
node scripts/check-wgsl-backticks.js       # 322 files clean
```

Then remove the entry from `src/tests/rendering/wgsl/knownDeviations.ts` (the scalar-array-in-uniform regex) — if it recurs, the test suite fails loudly.

Optionally run the Playwright smoke spec (`pnpm exec playwright test scripts/playwright/app-loads.spec.ts`) to confirm the renderer still boots. The full app uses these pipelines at startup, so a successful app load is the strongest correctness signal available short of manual testing.

## Useful grep starting points

```sh
# Find shader files that still use var<uniform> with structs that embed scalar arrays:
grep -rln 'var<uniform>' src/rendering/webgpu/shaders/schroedinger/compute | xargs grep -l 'array<[uif]32, 1[2-9]\|array<[uif]32, 2'

# Find `'uniform'` BGL entries in setup files (candidates to flip):
grep -n "'uniform'" src/rendering/webgpu/passes/TDSEComputePassSetup.ts
grep -n "'uniform'" src/rendering/webgpu/passes/DiracComputePassSetup.ts
grep -n "'uniform'" src/rendering/webgpu/passes/PauliComputePassSetup.ts
grep -n "'uniform'" src/rendering/webgpu/passes/TDSEObservablesGSPipelines.ts

# Find UNIFORM buffer usage flags (candidates to flip to STORAGE):
grep -rn 'GPUBufferUsage.UNIFORM' src/rendering/webgpu/passes/
```

## Rationale (why this migration at all)

WGSL spec §11 requires that arrays in uniform-address-space structs have element strides that are multiples of 16 bytes. The affected uniform structs (`TDSEUniforms`, `DiracUniforms`, `PauliUniforms`, `FreeScalarUniforms`, `ObsReduceUniforms`, `ObsMomReduceUniforms`, `EnergySpectrumUniforms`) embed `array<u32, 12>` / `array<f32, 12>` with 4-byte strides, which is spec-noncompliant. Chrome/Dawn/Tint silently accepts it; naga (used by wgpu-rs / Firefox) correctly rejects it. Switching the binding to `read-only-storage` is the minimal fix — storage buffers have no such stride restriction. Negligible performance impact: the uniform buffers are read-once per dispatch and small enough to stay in L1 cache.

## What NOT to do

- Do **not** run `sed -i 's/.../.../g' *.ts` or any equivalent bulk replace. The previous session did exactly this and left the app in the current broken state.
- Do **not** try to shortcut by editing only shaders or only setup files. Each migration is a tuple: {WGSL declaration, BGL entry, buffer usage}, all three must move together per struct.
- Do **not** remove the entry from `knownDeviations.ts` until all migrations are done and the test reports 0 failures and 0 known-deviations on the compute subset.

## Context files

- `docs/physics/wgsl-validation.md` — full validation system overview.
- `docs/physics/wgsl-pass-audit.md` — pass-level shader classification.
- `src/tests/rendering/wgsl/` — all enumerators + validator driver.
- `.claude/rules/shaders.md` — WGSL style rules (binding groups, struct alignment).
