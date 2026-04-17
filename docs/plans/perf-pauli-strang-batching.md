# Pauli Strang-Step Batching + Shared-Memory FFT Port

**Status**: Proposed
**Effort estimate**: 3–5 hours
**Parent optimisation**: `DiracComputePass` Strang batching (landed 2026-04-17 — see commit changing `DiracComputePass*.ts` and `scripts/playwright/dirac-batch-ab.spec.ts`)
**Expected impact**: +10–15 % FPS on GPU-bound Pauli scenarios (no measured baseline yet — see §Measurement-Setup)

## Executive Summary

`PauliComputePass.executePauli` opens roughly 36 separate compute passes per Strang step on 3D:
1 vHalf + 2×(1 pack + 6 FFT stages + 1 unpack) + 1 kinetic + 2×(1 pack + 6 FFT stages + 1 unpack) + 1 vHalf + 1 absorber. Each pass boundary costs 5–20 µs on Metal; at 4 steps/frame that is ~0.7–3 ms/frame of pure driver overhead, on top of the GPU work.

The Dirac pass solved the same class of problem in two stages:
1. **Shared-memory FFT** (already done on Dirac/TDSE): replaces the per-axis, per-stage Stockham FFT (`log₂(N)` dispatches per axis) with a single dispatch per axis that runs all butterfly stages in workgroup shared memory.
2. **Strang-step batching** (done on Dirac this week): per-slot `fftAxisUniformBuffers[]` + `fftSharedMemBGs[]` remove the `copyBufferToBuffer` between axes, so every pack/FFT/unpack/kinetic dispatch lives inside one open compute pass.

Pauli has **neither** — it still uses the legacy per-stage Stockham path. Landing both on Pauli replicates the Dirac gain.

## Why Not Already Done

- Pauli is not in `perf-benchmark.spec.ts`, so no baseline number exists and the measured-before-optimising rule blocks implementation until that's fixed.
- Shared-memory FFT port is ~half of the work; without it the batching step alone cannot remove pass boundaries (the per-stage `copyBufferToBuffer` forces them).
- Main optimisation session prioritised Dirac (in the benchmark + already had shared-memory FFT) and BEC raymarcher research.

## Baseline Measurement Setup (do this FIRST)

1. Add a Pauli row to `scripts/playwright/perf-benchmark.spec.ts` (search for `scenarios = [...]` near line 50). Mirror the existing compute-mode rows:

   ```ts
   { mode: 'pauliSpinor', dim: 3, label: 'Pauli 3D' },
   ```

   Also ensure `objectType: 'pauliSpinor'` is set — check `gotoMode` in `scripts/playwright/helpers/app-helpers.ts` to see how Pauli is selected (it takes priority over `quantumMode`).

2. Add a Pauli A/B spec by cloning `scripts/playwright/dirac-batch-ab.spec.ts` → `pauli-batch-ab.spec.ts`. Replace:
   - `diracEquation` → `pauliSpinor` in `gotoMode`
   - `applyDiracPreset` → `applyPauliPreset` (if one exists — check `PauliStrategy.ts` presets)
   - `window.__DIRAC_DISABLE_BATCH` → `window.__PAULI_DISABLE_BATCH` (new runtime flag — plumb like Dirac)

3. Commit baseline numbers to the task state log before touching code. Minimum: 5-run median at default preset + at least one high-stepsPerFrame preset.

## Implementation Plan

### Part 1 — Port Pauli to Shared-Memory FFT

Mirrors the Dirac/TDSE approach. Touches:

| File | Change |
|------|--------|
| `src/rendering/webgpu/passes/PauliComputePassSetup.ts` | Add `fftSharedMemBGL` layout (uniform + storage), `fftSharedMemPipeline` using `tdseSharedMemFFTBlock + fftAxisUniformsBlock` from `schroedinger/compute/tdseSharedMemFFT.wgsl.ts`. |
| `src/rendering/webgpu/passes/PauliComputePassBuffers.ts` | Add `fftAxisUniformBuffer`, `fftAxisStagingBuffer` (plus staging-data builder analogous to `buildFFTAxisStagingData` in `DiracComputePassBuffers.ts`). Layout: `latticeDim * 2` slots × `FFT_UNIFORM_SIZE` bytes, `(axisDim, direction, totalElements, axisStride, log2N)` per slot. |
| `src/rendering/webgpu/passes/PauliComputePass.ts` | Add `dispatchFFTAxisSharedMem` helper (see `DiracComputePassDispatchers.dispatchFFTAxisSharedMem` for the 1:1 template). Wire into `executePauli` as the FFT path used inside the Strang loop. Keep the old Stockham path reachable for fallback. |
| `src/rendering/webgpu/passes/PauliComputePassBuffers.ts` (types) | Extend `PauliBufferResult`, `PauliDestroyableBuffers` with the new fields (and dispose them). |

Shared-memory FFT kernel constraint: axis sizes must be power of 2 in `[8, 128]` (see `SHARED_MEM_FFT_MAX_AXIS` in `DiracComputePassDispatchers.ts`). Pauli's default grid is 64³ → fine. Throw at pipeline build if user config exceeds 128, fall back to Stockham.

### Part 2 — Per-Slot FFT Bind Groups + Strang Batching

Template: the `DiracComputePass` changes from 2026-04-17 — see git log around that date for the full diff. Key edits:

1. **Types** (`PauliComputePassBuffers.ts` / equivalent types file):

   ```ts
   interface PauliBufferResult {
     // ...existing...
     fftAxisUniformBuffers: GPUBuffer[]  // length = latticeDim * 2
   }
   interface PauliBindGroupResult {
     // ...existing...
     fftSharedMemBGs: GPUBindGroup[]  // one per slot
   }
   ```

2. **Buffer creation** — pre-populate one `FFT_UNIFORM_SIZE`-byte uniform buffer per slot from the `fftAxisStagingData` bytes. Template:

   ```ts
   const fftAxisUniformBuffers: GPUBuffer[] = new Array(axisSlotCount)
   const axisStagingBytes = new Uint8Array(fftAxisStagingData)
   for (let slot = 0; slot < axisSlotCount; slot++) {
     const buf = helpers.createUniformBuffer(device, FFT_UNIFORM_SIZE, `pauli-fft-axis-uniforms-${slot}`)
     const slotOffset = slot * FFT_UNIFORM_SIZE
     const slotData = axisStagingBytes.slice(slotOffset, slotOffset + FFT_UNIFORM_SIZE)
     device.queue.writeBuffer(buf, 0, slotData)
     fftAxisUniformBuffers[slot] = buf
   }
   ```

3. **Bind groups** — one `fftSharedMemBGs[slot]` per per-slot uniform buffer, all sharing `fftScratchA` as the complex buffer binding.

4. **Execute loop** — replace the existing `for (let step = 0; step < stepsThisFrame; step++) { ... }` body with a single `ctx.beginComputePass({ label: 'pauli-strang-${step}' })` that dispatches:
   - vHalf
   - `for (c = 0..1)`: pack(c) → 3 FFT axes via `setBindGroup(0, bgs[slot])` + `dispatchWorkgroups(totalSites / axisDim)` → unpackNoNorm(c)
   - kinetic
   - `for (c = 0..1)`: pack(c) → 3 FFT axes (inverse slot offset = `latticeDim`) → unpack(c)
   - vHalf
   - optional absorber
   - end pass

   Reference implementation: `DiracComputePass.executeDirac` (search for `batchedFFT` block). Copy the structure, change S=4 → S=2.

5. **Runtime toggle** — add `window.__PAULI_DISABLE_BATCH` check identical to the Dirac one.

6. **Dispose** — add `fftAxisUniformBuffers.forEach(b => b.destroy())` to the dispose path.

### Part 3 — Verification

- `npx vitest run` — existing 7630 tests must still pass. Pauli unit tests live in `src/tests/rendering/passes/` if any; check.
- Run the new `pauli-batch-ab.spec.ts` (5 samples per arm, interleaved). Expect schroedinger Δ-median between −8 % and −15 % at 4+ steps/frame, on par with Dirac zitterbewegung.
- Eyeball check: load the app, select Pauli mode, verify rendering looks unchanged. Bind-group misalignment in Part 1 can produce visually correct output that drifts over time — run the simulation for ~30 s and check for norm divergence via the perf monitor diagnostics.

## Known Pitfalls

- **Shader alignment** — the shared-memory FFT WGSL requires `smemA`, `smemB` as `array<vec2f, 128>`. If someone later adds a 256-point axis, the kernel silently overwrites. Keep the throw.
- **Pack BG offset layout** — Pauli's spinor is 2 components packed sequentially in a single buffer; the pack BG must use `{ buffer, offset: c * totalSites * 4, size: totalSites * 4 }` for each component. Already correct in current code — don't break.
- **`cachedPackBGs`/`cachedUnpackBGs` ordering** — forward FFT uses `cachedUnpackBGsNoNorm` (invN=1), inverse FFT uses `cachedUnpackBGs` (invN=1/N). Don't swap these.
- **`writePauliUniforms`** — if you refactor any uniform layout, regenerate the staging data. Pauli's uniform struct is 592 bytes; do not reorder fields.

## Out of Scope

- No shader maths changes. Only dispatch scheduling.
- No new color algorithms, no new presets, no new physics.
- Do not touch the stateSave / load path in this PR.

## Definition of Done

1. Baseline Pauli perf numbers recorded in `logs/task_state_<date>.md` BEFORE any code change.
2. Shared-memory FFT path verified correct by comparing a 20-step simulation against the legacy Stockham path (same seed, same preset). Position-space norms must match to 1e-5.
3. Batched path measured via `pauli-batch-ab.spec.ts`. `−5 %` schro median improvement is the minimum bar; below that, revert.
4. All 7630 unit tests pass, lint clean, tsc clean, bundle size within budget.
5. Runtime toggle `window.__PAULI_DISABLE_BATCH` works in both directions.
