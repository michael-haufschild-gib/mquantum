# Plan: Replace Vacuum Noise with Exact Free-QFT Vacuum Spectrum

Date: 2026-02-19  
Status: Proposed  
Scope: freeScalarField `initialCondition = vacuumNoise`

## 1. Objective

Replace the current site-wise pseudo-random Gaussian initialization with a scientifically exact vacuum fluctuation sampler for the **free real scalar field on a finite periodic lattice** used by this codebase.

This means matching the lattice free-field Gaussian ensemble mode-by-mode, not continuum infinite-volume interacting QFT.

## 2. Current Behavior (to replace)

Current vacuum initialization is hash-based Gaussian noise in real space:

- `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl.ts`
- branch: `params.initCondition == 0u`
- writes:
  - `phi[idx] = gaussianNoise(...) * packetAmplitude * 0.01`
  - `pi[idx] = gaussianNoise(...) * packetAmplitude * 0.01`

The selection and wiring path:

- UI selector: `src/components/sections/Geometry/SchroedingerControls/FreeScalarFieldControls.tsx`
- store action (`needsReset`): `src/stores/slices/geometry/schroedingerSlice.ts`
- init condition mapping: `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`

## 3. Scientific Target Distribution

For each lattice mode `k`, initialize Gaussian random variables such that:

```text
<|phi_k|^2> = 1 / (2 * omega_k)
<|pi_k|^2>  = omega_k / 2
<phi_k pi_k> = 0
```

with lattice dispersion:

```text
omega_k^2 = m^2 + sum_i [ (2 / a_i) * sin(k_i * a_i / 2) ]^2
k_i = 2*pi*n_i / L_i
L_i = N_i * a_i
```

This must match the discretization used by the leapfrog evolution kernel:

- `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePi.wgsl.ts`

## 4. Fourier Convention (must be fixed first)

Choose and document one DFT normalization (recommended unitary):

```text
phi_x = (1/sqrt(N)) * sum_k exp(i k.x) phi_k
pi_x  = (1/sqrt(N)) * sum_k exp(i k.x) pi_k
```

All code and tests must use the same convention to avoid factor-of-N errors.

## 5. Exact Sampling Algorithm

1. Enumerate all lattice momentum indices `(n_x, n_y, n_z)` for active dimensions.
2. Compute `omega_k` from lattice spacing, grid shape, and mass.
3. Sample in k-space, not x-space:
   - complex Gaussian coefficients for non-self-conjugate pairs
   - real Gaussian coefficients for self-conjugate modes (`k = -k`, including Nyquist where applicable)
4. Enforce real-field Hermitian constraints:
   - `phi_-k = conj(phi_k)`
   - `pi_-k  = conj(pi_k)`
5. Inverse FFT `phi_k`, `pi_k` to real-space arrays `phi[x]`, `pi[x]`.
6. Upload those arrays into GPU storage buffers before time evolution.

## 6. Edge Cases and Physics Caveats

1. `m = 0` zero mode requires explicit policy (IR divergence):
   - either reject exact vacuum at `m = 0`,
   - or regularize with `m_floor`,
   - or remove/constraint the zero mode.
2. Lower-dimensional lattices (1D/2D) must still use consistent 3D storage indexing with inactive dims fixed.
3. This is exact for free Gaussian theory on the chosen finite lattice only.

## 7. Code Changes in This Repository

## 7.1 Data model and controls

Add fields to free-scalar config:

- `vacuumSeed: number`
- optional: `vacuumMode: 'exactSpectrum' | 'legacyNoise'` (migration/safety)

Files:

- `src/lib/geometry/extended/types.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/components/sections/Geometry/SchroedingerControls/FreeScalarFieldControls.tsx`

## 7.2 New vacuum initializer module

Create a dedicated utility module, for example:

- `src/lib/physics/freeScalar/vacuumSpectrum.ts`

Responsibilities:

- mode indexing and conjugate pairing
- lattice dispersion computation
- seeded Gaussian RNG
- k-space sampling with Hermitian constraints
- inverse transform call
- return `Float32Array` for `phi` and `pi`

## 7.3 FFT backend

No FFT implementation exists today in the project dependencies.

Add one of:

1. WASM FFT backend (preferred for performance and determinism)
2. JS/TS FFT backend (acceptable first milestone)

Integrate under:

- `src/wasm/mdimension_core/` (if WASM path)
- or `src/lib/math/` (if JS fallback)

## 7.4 Compute pass integration

Update reset/init path in:

- `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts`

Behavior:

1. For `vacuumNoise` + exact mode:
   - generate `phi` and `pi` on CPU/WASM
   - `device.queue.writeBuffer` into `phiBuffer` and `piBuffer`
   - skip WGSL random-noise branch
2. For `singleMode` and `gaussianPacket`:
   - keep existing WGSL init path

## 7.5 Leapfrog initialization semantics

Current code applies a `dt/2` kickstart immediately after init.

Decide and document one of:

1. keep kickstart but interpret initialized `pi` as time-centered value
2. defer kickstart until first simulation step to preserve exact displayed `t=0` snapshot

This choice affects validation tolerances and user interpretation.

## 8. Test and Validation Plan

## 8.1 Unit tests (new)

Add tests under `src/tests/lib/...` for:

1. dispersion formula correctness against known modes
2. Hermitian symmetry and self-conjugate mode handling
3. seed determinism (same seed same realization)
4. zero-mode policy behavior

## 8.2 Statistical physics tests (new)

Using ensemble sampling over many seeds:

1. measured `<|phi_k|^2>` vs `1/(2*omega_k)`
2. measured `<|pi_k|^2>` vs `omega_k/2`
3. measured `<phi_k pi_k>` near zero

Use tolerances that scale with sample count and mode count.

## 8.3 Integration tests (new)

In pass-level tests:

1. exact vacuum path uploads nontrivial buffers
2. non-vacuum initial conditions still use WGSL init path
3. reset logic remains correct when changing grid size and lattice dimension

## 8.4 Runtime scientific checks

Add optional diagnostics panel values:

1. energy drift over time (already aligned with Hamiltonian decomposition)
2. optional radial correlator trend for vacuum baseline
3. optional spectrum ratio `measured / expected`

## 9. Performance and Delivery Phasing

Phase 1 (correctness first):

1. Implement exact sampler + FFT backend (CPU/WASM)
2. Wire into initialization path
3. Add scientific tests

Phase 2 (performance):

1. move heavy sampling/FFT to worker or optimized WASM path
2. reduce allocation churn and cache mode metadata per grid shape

Phase 3 (UX/science tooling):

1. expose diagnostics/education text for cutoff and finite-volume effects
2. optional toggle between exact and legacy noise for comparison

## 10. Definition of Done

1. `vacuumNoise` no longer uses site-wise white noise.
2. Initialization statistically matches target free-vacuum spectrum on lattice.
3. Existing `singleMode` and `gaussianPacket` behavior remains unchanged.
4. Tests demonstrate both numerical correctness and deterministic reproducibility.
5. Documentation clearly states finite-lattice, free-theory scope.

## 11. Reference

- Tong, Quantum Field Theory lecture notes (free-field mode normalization):  
  https://www.damtp.cam.ac.uk/user/tong/qft.html
