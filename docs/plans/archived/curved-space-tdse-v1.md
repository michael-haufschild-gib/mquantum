# Curved-Space TDSE — v1 Plan

**Status**: Completed / Archived
**Scope**: Minimum viable quantum dynamics on curved backgrounds
**Depends on**: TDSE compute pipeline (existing)

## Executive Summary

Extend TDSE dynamics to propagate wavefunctions on **curved spatial geometries** by replacing the flat Laplacian in the kinetic operator with the **Laplace–Beltrami operator**. The v1 target is a single, physically honest preset: a Gaussian wave packet propagating through a **Morris–Thorne wormhole throat**.

This is not a new `ObjectType` — it remains a `schroedinger` object in `tdseDynamics` mode. The background metric is treated as a first-class configuration field alongside the existing potential.

### Why this is in scope

mquantum is a quantum-wavefunction simulator. v1 keeps that identity strictly: the thing being propagated is still a Schrödinger wavefunction ψ(x, t). Only the kinetic operator changes, following standard DeWitt (1957) / Birrell & Davies curved-space quantum mechanics. No classical geodesics, no geometric-only rendering, no new object type.

### What v1 delivers

1. A modified TDSE compute pipeline that evaluates the Laplace–Beltrami kinetic term instead of −∇²/(2m).
2. One analytical metric: **Morris–Thorne throat** in proper-distance coordinates (diagonal metric, no coordinate singularities in the relevant region).
3. One "flat" metric option as a control, to prove the v1 code reduces exactly to existing TDSE behavior when g_μν = η_μν.
4. One preset: *"Wavepacket Through a Wormhole Throat"* — Gaussian launched at the throat from one side, showing partial transmission / reflection / dispersion.
5. Volume-element-aware normalization, observables, and rendering.
6. Full unit + e2e test coverage of the math and of the rendering.

---

## Part 1: Physics and Math

### 1.1 Laplace–Beltrami kinetic operator

For metric g_μν with inverse g^μν and determinant |g|:

    Ĥ ψ = −(ℏ²/2m) · (1/√|g|) · ∂_μ [ √|g| · g^μν · ∂_ν ψ ] + V · ψ

In flat space (g_μν = δ_μν), |g| = 1, g^μν = δ^μν → recovers −∇²/(2m).

### 1.2 Morris–Thorne metric in proper-distance coordinates

For the spatial slice of a symmetric traversable wormhole, use the coordinate `l` = proper distance from the throat. The metric is:

    ds² = dl² + r(l)² · (dθ² + sin²θ · dφ²)
    r(l) = √(b₀² + l²)

where `b₀` is the throat radius. The metric is **diagonal** in (l, θ, φ). We map the simulation lattice as:
- axis 0 → `l` ∈ [−L, +L]
- axes 1–2 → local transverse coordinates with an effective radius r(l) coupling

For v1 simplicity, we'll implement the **equatorial (2D) slice** first (θ = π/2 fixed) mapped onto the existing 3D lattice with axes 1–2 representing (r(l)·φ, a soft transverse extent), then generalize if the spike succeeds. Alternative: use axis 0 as `l` and confine axes 1–2 via quartic walls, treating transverse curvature as an effective throat-radius factor in the kinetic coupling.

**Final v1 choice**: axis 0 = `l` (proper distance through throat). Transverse axes 1–2 stay Cartesian with soft confinement. The kinetic term becomes:

    T ψ = −(ℏ²/2m) · [ ∂²ψ/∂l² + (1/r(l))² · (∂²ψ/∂y² + ∂²ψ/∂z²) ]

This is the kinetic term restricted to the diagonal metric, keeping the simulation intuitive (wave packet moves along l through the throat). The `(1/r(l))²` factor is the curvature effect: transverse wavelengths stretch at the throat narrowing.

### 1.3 Integrator choice

Split-step FFT no longer diagonalizes the kinetic operator when g^μν depends on position. Two options:

**Option A (chosen for v1): Position-space finite-difference kinetic operator + RK4 time integration.**
- 2nd-order central differences for ∂², ∂_μ
- Explicit RK4 in time
- Stability: dt ≤ 0.5 · dx² · min(g_μν) / (ℏ/m)

**Option B (deferred to v2): Metric-aware split-step** using the Trotter product formula with position-space kinetic micro-steps — more efficient for static metrics but more complex.

v1 uses Option A for mathematical transparency and ease of verification.

### 1.4 Volume element

Normalization: ∫ |ψ|² · √|g| · dⁿx = 1
Expectation values: ⟨O⟩ = ∫ ψ* · O · ψ · √|g| · dⁿx

All diagnostics must integrate with the √|g| weight. The existing normalization assumes √|g| = 1 — this must be generalized.

---

## Part 2: Implementation

### 2.1 Type system

New module: `src/lib/physics/tdse/metrics/`

```typescript
// src/lib/physics/tdse/metrics/types.ts
export type MetricKind = 'flat' | 'morrisThorne'

export interface MetricConfig {
  kind: MetricKind
  /** Morris–Thorne throat radius b₀ (>0). */
  throatRadius?: number
}
```

Extend `TdseConfig` (in `src/lib/geometry/extended/tdse.ts`):

```typescript
metric: MetricConfig  // defaults to { kind: 'flat' }
```

### 2.2 Metric evaluator

`src/lib/physics/tdse/metrics/evaluator.ts`

Pure TS function:
```typescript
export interface MetricSample {
  gInverseDiag: [number, number, number]  // g^00, g^11, g^22 at (x,y,z)
  sqrtDet: number                          // √|g| at (x,y,z)
}
export function sampleMetric(cfg: MetricConfig, x: number, y: number, z: number): MetricSample
```

For `flat`: returns `[1,1,1], 1`.
For `morrisThorne` with axis 0 = l:
```
r = √(b₀² + l²)
g^00 = 1
g^11 = g^22 = 1/r²
√|g| = r²
```

### 2.3 GPU compute kernel

New WGSL: `src/rendering/webgpu/shaders/compute/tdseCurvedKinetic.wgsl.ts`

Implements the finite-difference Laplace–Beltrami operator given a precomputed metric field. Metric is precomputed on the host into three `Float32Array` buffers:
- `gInvBuffer` — g^μν diagonals per cell (3 × N cells)
- `sqrtDetBuffer` — √|g| per cell (N cells)

Kernel evaluates T ψ using central differences and the metric factors.

RK4 driver: `src/lib/physics/tdse/curvedIntegrator.ts` — four compute-pass invocations per step with intermediate buffers.

### 2.4 Store + UI

- New slice field in `geometryStore`: `tdseMetric: MetricConfig`
- Setter: `setTdseMetric`
- New UI section in TDSE controls: metric type dropdown + parameter inputs (throat radius for MT)
- Default: `{ kind: 'flat' }` → behaves identically to existing TDSE

### 2.5 URL params

Extend `src/lib/url/state-serializer.ts`:
- `tdse_metric` — enum (flat | morrisThorne)
- `tdse_b0` — float (throat radius)

### 2.6 Preset

One v1 preset added to `src/lib/physics/tdse/presets.ts`:

```typescript
{
  id: 'wormholeWavepacket',
  name: 'Wavepacket Through a Wormhole Throat',
  description: 'Gaussian wave packet propagating along the proper-distance axis of a Morris–Thorne throat. Shows real wave dynamics on curved geometry: partial transmission through the narrowing, curvature-induced dispersion, and reflection from the throat geometry itself (not from any potential). The quantum analogue of the ER=EPR boundary-dual Rabi preset — here the bridge is the geometry.',
  overrides: {
    latticeDim: 3,
    gridSize: [128, 64, 64],
    spacing: [0.1, 0.1, 0.1],
    dt: 0.002,  // RK4 stability
    stepsPerFrame: 4,
    initialCondition: 'gaussianPacket',
    packetCenter: [-3.0, 0, 0],
    packetWidth: 0.5,
    packetMomentum: [3.0, 0, 0],
    potentialType: 'free',   // pure geometric effect (no external potential)
    metric: { kind: 'morrisThorne', throatRadius: 0.5 },
    absorberEnabled: true,
    absorberWidth: 0.15,
    diagnosticsEnabled: true,
    fieldView: 'density',
    autoScale: true,
  },
  renderingOverrides: { densityGain: 3.0, densityContrast: 2.5 },
}
```

---

## Part 3: Tests

### 3.1 Unit tests — math correctness

**File**: `src/tests/lib/physics/tdse/metrics.test.ts`

1. **Flat metric reduces to identity**
   - `sampleMetric({kind:'flat'}, x, y, z)` returns `[1,1,1], 1` for any point.
2. **Morris–Thorne throat radius**
   - At l=0 (throat): `r = b₀`, `g^11 = g^22 = 1/b₀²`, `√|g| = b₀²`
   - At |l| ≫ b₀: `r → |l|`, geometry approaches flat (up to angular scaling)
3. **Monotonic r(l)**
   - `r(l)` strictly increasing in |l|
4. **No NaNs / infs** for b₀ > 0 across the full lattice.

**File**: `src/tests/lib/physics/tdse/curvedKinetic.test.ts`

5. **Flat-metric Laplace–Beltrami equals flat Laplacian**
   - For `kind: 'flat'`, the curved kinetic operator applied to a known analytic ψ (e.g. plane wave, Gaussian) must equal the result of the existing flat kinetic operator to < 1e−6 relative error.
   - This is the **most important test**: proves the v1 code doesn't break existing behavior.
6. **Laplacian of a plane wave on flat metric**
   - T · exp(ikx) = (ℏ²k²/2m) · exp(ikx), verified numerically within finite-difference truncation error.
7. **Laplacian of a known eigenfunction on MT metric**
   - For the s-wave ψ(l) (no transverse variation), T · ψ depends only on ∂²ψ/∂l². Test that transverse derivatives vanish in the curved operator for a transverse-constant ψ.
8. **Hermiticity**
   - ⟨φ | T | ψ⟩ = ⟨T φ | ψ⟩ within numerical precision, using √|g| volume weight. This is a property of Laplace–Beltrami — must hold on curved metric too.

**File**: `src/tests/lib/physics/tdse/curvedIntegrator.test.ts`

9. **Norm conservation on flat metric**
   - RK4 evolution of a Gaussian under flat metric + V=0 conserves ∫|ψ|² d³x to < 0.5% over 500 steps. Matches existing TDSE unit test tolerance.
10. **Norm conservation on MT metric**
    - Same as above, but with `metric: morrisThorne, b₀ = 0.5`, and integration weighted by √|g|. Tolerance < 1% (more drift is expected from finite-difference operator asymmetry; document if higher).
11. **Energy conservation on static metric**
    - ⟨Ĥ⟩ conserved to < 1% over the same window. Proves the integrator is symplectic-ish for the curved Hamiltonian.
12. **Reduction to existing TDSE when metric = flat**
    - Running the curved integrator with `kind: 'flat'` must produce the same ψ(t) as the existing TDSE split-step to within integrator-order truncation error (expect O(dt²) agreement). Critical for non-regression.

**File**: `src/tests/lib/physics/tdse/metrics-url.test.ts`

13. **URL round-trip**
    - `tdse_metric=morrisThorne&tdse_b0=0.5` → deserializes → serializes → produces identical URL.
14. **Invalid metric kind** → falls back to `flat`, no exception.
15. **b₀ clamping** — negative or zero → clamped to small positive value, logged.

### 3.2 E2E tests — rendering correctness

**File**: `scripts/playwright/tdse-curved-space.spec.ts`

16. **Preset loads and renders**
    - Navigate to `?t=schroedinger&d=3&qm=tdseDynamics&preset=wormholeWavepacket`
    - Wait for `[data-renderer-state="ready"]` + `data-frame-count > 0`
    - Read pixel density in the render canvas center — must be > 0 (something is rendering).
17. **Wave packet moves**
    - Capture canvas pixel snapshot at t = 1s sim time, again at t = 3s. Differential must exceed a pixel-diff threshold — proves motion is happening, not a static frame.
18. **Throat feature visible**
    - With `fieldView='density'`, the density distribution should exhibit a characteristic narrowing near the x = 0 region when the packet is at the throat. Captured via GPU readback of |ψ|² summed along y,z axes, compared against a snapshot fixture.
19. **Flat vs. curved visible difference**
    - Run the same packet init under `{kind:'flat'}` and `{kind:'morrisThorne', b₀:0.5}`. At t = 2s, the center-of-mass or transverse width must differ by > 5% between the two runs. Proves the metric actually influences the dynamics — not dead code.
20. **GPU diagnostic readback**
    - With `diagnosticsEnabled: true`, read `normDrift` from the diagnostics buffer after 2s sim. Assert |normDrift| < 0.01 (1%).
21. **No shader compile errors / GPU warnings**
    - Standard Playwright GPU error collection per `feedback_mandatory_gpu_error_collection` — spec must attach the console listener and fail on any `GPUValidationError` / `GPUInternalError`.
22. **URL state round-trip**
    - Load `...&tdse_metric=morrisThorne&tdse_b0=0.7` → read store state → verify `metric.kind === 'morrisThorne'` and `throatRadius === 0.7`.

### 3.3 Acceptance criteria

v1 was done when **all of the following** held (satisfied at merge):

- [x] All 22 tests above pass locally.
- [x] `npm run build` passes.
- [x] `npm run lint` passes.
- [x] `npx vitest run` passes full suite (no regressions).
- [x] Preset `wormholeWavepacket` loads from URL, renders a visible moving wave packet, and produces a visually different result from the flat-metric control.
- [x] The accompanying description in the preset correctly frames what is shown (curved-space quantum dynamics, not classical geodesics, not a cartoon bridge).
- [x] No new lint/TS warnings. No magic numbers without a source comment citing the physics.

---

## Part 4: Out of Scope (punted to v2)

- Multiple metrics (Schwarzschild, de Sitter, torus, sphere) — only Morris-Thorne in v1.
- Curvature overlay rendering (Ricci scalar tint, embedding diagram) — only default density rendering in v1.
- Metric-aware split-step integrator — only RK4 in v1.
- Proper-volume vs. coordinate-volume view toggle — only coordinate view in v1. Document the caveat in the UI help text.
- Time-dependent metrics — static only in v1.
- 4D spacetime metrics — v1 is quantum mechanics on curved 3D space, not QFT in curved spacetime.

---

## Part 5: Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| RK4 stability requires prohibitively small dt | Medium | Unit test 9 measures norm drift; if it's bad, switch dt adaptively or test Crank–Nicolson instead |
| Metric factor (1/r²) blows up for tiny b₀ | Low | Clamp b₀ ≥ 0.1 in setter |
| Transverse soft-wall confinement interacts with curvature | Medium | Document in preset; test 18 verifies the throat narrowing is visible despite the walls |
| Flat-metric path loses performance vs. existing split-step | Medium | Keep existing split-step as the default when `metric.kind === 'flat'`; only switch to RK4 when metric is non-flat. This is the cleanest zero-regression guarantee. |

### Zero-regression guarantee

**Implementation rule**: when `metric.kind === 'flat'`, the `tdseDynamics` pipeline must use the **existing** split-step FFT integrator unchanged. Only curved metrics invoke the new RK4 curved-kinetic path. This is the single most important architectural decision in v1 — violating it risks breaking every existing TDSE preset.
