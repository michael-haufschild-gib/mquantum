# Curved-Space TDSE — v2 Plan

**Status**: Proposed
**Scope**: Polished, multi-metric, curvature-aware visualization for quantum dynamics on curved backgrounds
**Depends on**: v1 plan merged and stable (`curved-space-tdse-v1.md`)

## Executive Summary

v1 proves the math and ships a single preset. v2 turns the feature into a proper research-grade tool:

1. **Metric library** — Schwarzschild exterior (spatial slice), de Sitter expansion, anti-de Sitter "bowl", 2-sphere compactification, flat-torus, double-throat wormhole.
2. **Curvature-aware visualization** — Ricci-scalar volume tint, optional embedding-diagram side panel, proper-volume vs. coordinate-volume density toggle.
3. **Metric-aware split-step integrator** — faster than RK4 for static metrics, matches the performance of the existing TDSE pipeline.
4. **Time-dependent metrics** — de Sitter expansion as the first case, enabling visualization of cosmological redshift of a quantum wave packet.
5. **Rich preset library** — eight curated scenarios spanning wormholes, cosmology, compactification, and boundary effects.
6. **Test coverage parity** with the rest of the TDSE suite.

### What v2 unlocks conceptually

- **Bridge-picture companion to ER=EPR** — v1 already provides the geometric wormhole preset; v2 adds the entangled-pair version on a double-throat geometry.
- **Gravitational redshift as a phase effect on a wave packet** — shown directly in the phase-view field, not inferred.
- **Compactification demos** — wave packet on a 2-sphere or torus, showing real quantum effects (geodesic focusing, quantization of momentum on a torus).
- **Cosmological particle creation hints** — a time-dependent de Sitter metric produces the standard adiabatic-theorem breakdown; the wavefunction visibly does not stay in its instantaneous ground state.

---

## Part 1: Metric Library

All metrics defined as analytical evaluators in `src/lib/physics/tdse/metrics/`. Each adds a module:

| File | Metric | Key parameters | Use case |
|---|---|---|---|
| `metrics/flat.ts` (v1) | g_μν = δ_μν | — | Control |
| `metrics/morrisThorne.ts` (v1) | Symmetric throat, b(l) = √(b₀²+l²) | `throatRadius` | Wormhole |
| `metrics/schwarzschild.ts` | Spatial slice of Schwarzschild exterior in isotropic coords | `schwarzschildMass`, `minRadius` | Black hole exterior |
| `metrics/deSitter.ts` | FLRW-like expanding flat space, a(t) = exp(Ht) | `hubbleRate`, `timeDependent` | Cosmology |
| `metrics/antiDeSitter.ts` | AdS spatial slice (negative curvature "bowl") | `adsRadius` | AdS/CFT boundary toy |
| `metrics/sphere2D.ts` | 2-sphere compactification on axes 1–2 | `sphereRadius` | Angular quantization |
| `metrics/torus.ts` | Flat torus (periodic box, explicit treatment) | `torusPeriod[3]` | Compactification |
| `metrics/doubleThroat.ts` | Two Morris–Thorne throats joined end-to-end | `throatRadius`, `separation` | ER=EPR geometric dual |

Each module exports:
```typescript
sampleMetric(cfg, x, y, z, t?): MetricSample
describeMetric(cfg): MetricDescription   // human-readable label, formula
ricciScalar(cfg, x, y, z): number        // for overlay visualization
```

The unified evaluator in `metrics/index.ts` dispatches by `MetricKind` and caches precomputed fields.

### Static vs. time-dependent

`MetricKind` splits into static (`flat`, `morrisThorne`, `schwarzschild`, `antiDeSitter`, `sphere2D`, `torus`, `doubleThroat`) and time-dependent (`deSitter`, optional `oscillatingThroat`). Time-dependent metrics cause the metric buffers to be recomputed each frame. Integrator paths branch accordingly.

---

## Part 2: Integrator Improvements

### 2.1 Metric-aware split-step (static metrics only)

For static diagonal metrics expressible as a conformal factor times flat (`flat`, `torus`, and approximately `morrisThorne` in certain limits), split the kinetic operator into a flat part + a position-dependent correction:

    T ≈ T_flat + T_correction(x)

Apply T_flat via FFT (as today) and T_correction as a position-space multiply. This restores near-FFT performance for static metrics.

Where the decomposition is not exact (e.g. Schwarzschild), fall back to the v1 RK4 path. Integrator selection is automatic per metric kind.

### 2.2 Adaptive dt for time-dependent metrics

When a(t) varies, the CFL-like stability condition changes. Monitor max|a(t)| across the frame and adjust dt to preserve norm drift < 0.5%.

### 2.3 Symplectic-preserving time-dependent path

For explicit time dependence (de Sitter), use Magnus-expansion-based second-order integrator. Norm drift bound relaxed to 1%; documented in the preset description.

---

## Part 3: Visualization Extensions

### 3.1 Ricci-scalar overlay

New render pass: `src/rendering/webgpu/passes/CurvatureOverlayPass.ts`. Samples R(x) on the lattice, maps to a diverging colormap (blue = negative curvature, red = positive), blends at configurable opacity over the density volume. Controlled by a new toggle: `showCurvatureOverlay` (default false).

Useful for: visually separating "where the packet slows because of curvature" from "where it slows because of the potential."

### 3.2 Proper-volume vs. coordinate-volume toggle

New field: `densityView: 'coordinate' | 'proper'`.

- `coordinate`: render |ψ|² directly (v1 default). Visually intuitive for seeing the lattice; potentially misleading near throats.
- `proper`: render |ψ|² · √|g|. The physically correct probability density per proper-volume element.

Both options valid for different questions. UI provides a tooltip explaining the difference.

### 3.3 Embedding-diagram side panel

Optional: for 2D cross-sections of the metric (e.g. equatorial slice of Morris–Thorne), compute the 2D embedding surface z(r) such that the induced metric matches, render as a 2D plot or small 3D inset. Purely decorative; helps the user read the geometry. Controlled by `showEmbedding` toggle.

Acceptance: v2 ships the Morris–Thorne and Schwarzschild embedding diagrams only. Others can be added later.

### 3.4 Phase view on curved metrics

The existing `fieldView: 'phase'` continues to work on curved metrics. Add a preset specifically showcasing **gravitational redshift**: wave packet hovering near a Schwarzschild exterior slice shows phase rolling slower per proper time near the horizon, compared to asymptotic region. Requires no new shader code — it's a consequence of the correct kinetic operator.

---

## Part 4: Preset Library

Eight v2 presets added to `src/lib/physics/tdse/presets.ts`. Each accompanies a clear, honest description framing what is and isn't being modeled.

| ID | Name | Metric | Highlights |
|---|---|---|---|
| `wormholeWavepacket` (v1) | Wavepacket Through a Wormhole Throat | MT | Transmission/reflection on curved space |
| `wormholeEntangledPair` | Entangled Wavepacket Pair Across a Wormhole | doubleThroat | Two packets, separated, each localized on one side of a joined throat |
| `schwarzschildOrbit` | Quantum Orbit in Schwarzschild Exterior | schwarzschild | Circularly launched packet precesses due to curvature |
| `gravitationalRedshift` | Phase Rolling Near a Black Hole | schwarzschild | Phase-view, visible redshift of the carrier wave |
| `cosmologicalRedshift` | Wavepacket in an Expanding Universe | deSitter | Packet stretches with a(t), visible de Broglie wavelength growth |
| `sphereCompactification` | Wavepacket on a 2-Sphere | sphere2D | Wave wraps around, exhibits antipodal focusing |
| `torusEigenstates` | Quantized Momenta on a Flat Torus | torus | Standing-wave pattern at the quantized k values |
| `adsBoundaryBounce` | Wavepacket in an AdS Bowl | antiDeSitter | Packet bounces off the effective boundary at finite proper time |

Each preset MUST include:
- A description that says what is being visualized and what is NOT being modeled (e.g. "backreaction of the packet on the metric is ignored").
- Appropriate `renderingOverrides` such that the intended feature is visible without manual tweaking.
- Physics-motivated choice of `packetWidth`, `packetMomentum`, `dt`, `stepsPerFrame`.

---

## Part 5: Tests

### 5.1 Unit tests — metric library

**File**: `src/tests/lib/physics/tdse/metrics/*.test.ts` (one per metric module)

For each metric, at minimum:

1. **Known-point values** — metric components at 2+ known spatial points verified against the analytical formula to < 1e−10.
2. **Determinant sign** — √|g| > 0 everywhere in the permitted domain.
3. **Inverse consistency** — g^μν · g_νρ = δ^μ_ρ within numerical precision.
4. **Ricci scalar sanity**
   - Flat, torus → R = 0 everywhere.
   - Sphere2D → R = 2/R² (constant positive) everywhere on the sphere.
   - AdS → R < 0 everywhere.
   - Schwarzschild (vacuum) → R = 0, but Kretschmann scalar R_{μνρσ}R^{μνρσ} > 0 (add a separate test).
5. **Asymptotic flatness** (where applicable) — metric → δ_μν as |x| → ∞ for MT, Schwarzschild, doubleThroat.
6. **Time-dependence smoothness** — for deSitter, a(t+dt)/a(t) ≈ exp(H·dt) to < 1% for small dt.

### 5.2 Unit tests — integrator

**File**: `src/tests/lib/physics/tdse/curvedIntegrator-v2.test.ts`

7. **Split-step reduces to FFT path on flat metric** — numerically identical to existing split-step output (already tested in v1 for RK4; v2 adds the same test for the metric-aware split-step path).
8. **Split-step matches RK4 on morrisThorne** — same final ψ to < 1% over 500 steps. Proves the split-step decomposition is correct.
9. **Ehrenfest theorem** — ⟨p⟩ evolves according to d⟨p⟩/dt = −⟨∂V⟩ − curvature-force terms. Test on Schwarzschild: a slowly-moving packet should experience an attractive effective force matching the Newtonian limit within the packet's coherence length. Tolerance: 10% (semiclassical approximation).
10. **Cosmological redshift** — on deSitter, a narrow packet with initial momentum k₀ has ⟨k⟩(t) ≈ k₀ · exp(−H·t). Verify to 5% at t = 1/H.
11. **Sphere compactification quantization** — on sphere2D with radius R, a packet initialized in a pure-l eigenstate retains that eigenstate to < 1%. Verifies the spherical-harmonic structure survives time evolution.
12. **Hermiticity of H on every metric** — systematic test across all v2 metrics.
13. **Symplectic check for time-dependent metric** — energy drift bounded over long evolution on deSitter.

### 5.3 Unit tests — presets + store

14. **Every preset loads without error**, populates the store correctly, and the resulting config passes a validator (no NaN parameters, dt within stability bound for its metric).
15. **URL round-trip for all new metric params**
    - Complete round-trip for: schwarzschildMass, hubbleRate, adsRadius, sphereRadius, torusPeriod, doubleThroat params.
16. **Invalid metric params clamped** with console warning.

### 5.4 E2E tests — rendering

**File**: `scripts/playwright/tdse-curved-space-v2.spec.ts`

17. **Every preset renders a visible moving wave packet** (loop over presets; for each, capture pixel diff between frame 60 and frame 120, assert > threshold).
18. **Ricci-overlay toggle visibly changes the render** — snapshot at `showCurvatureOverlay: false`, then `true`; pixel diff > threshold on non-flat metrics.
19. **Proper-volume vs. coordinate-volume** — on `wormholeWavepacket`, toggle `densityView`; assert a measurable pixel diff near the throat region.
20. **Gravitational redshift phase preset** — in `fieldView: 'phase'`, assert measurable phase-wavelength difference between points near and far from the Schwarzschild horizon. Via GPU phase-field readback, not screenshot.
21. **Cosmological redshift preset** — packet center-of-mass does not translate (at rest in comoving coords) but measured width in coord-view grows over time by ~exp(H·t) to 10%.
22. **Sphere compactification preset** — integrated density along the periodic axis stays within a narrow band (no blow-up, no leakage).
23. **Embedding-diagram inset appears** — when `showEmbedding: true`, find the inset `data-testid="embedding-diagram"` and assert it has non-zero pixels.
24. **URL shareability** — encode a v2 preset → decode → produces the same final rendered frame to within a pixel-diff epsilon (reproducibility under URL round-trip).
25. **GPU error hygiene** — mandatory GPU error listener, per feedback_mandatory_gpu_error_collection.

### 5.5 Physics-validation e2e

**File**: `scripts/playwright/physics-curved-space.spec.ts`

26. **Norm conservation across every v2 metric** — under `diagnosticsEnabled: true`, read `normDrift` from the diagnostics GPU buffer after 2s sim. Assert |normDrift| < 1% for static metrics, < 2% for time-dependent.
27. **Energy drift bounded** — ⟨Ĥ⟩ drift < 2% for static metrics over 5s sim time.
28. **Cosmological redshift quantitative** — measure ⟨k⟩(t) across 10 timesteps; fit exponential; assert fit H matches `hubbleRate` to 5%.
29. **Sphere eigenvalue** — initialize a Y_lm eigenstate (a preset configuration), verify its energy matches ℏ²l(l+1)/(2m·R²) to 5%.
30. **Anti-de-Sitter bounce time** — packet launched radially outward bounces back at a time scaling with the AdS radius as predicted by geodesic-like analysis (check scaling, not absolute time, since the packet is not a classical geodesic).

### 5.6 Acceptance criteria

v2 is done when:

- [ ] All 30 tests pass.
- [ ] All eight v2 presets load, render, and produce visibly distinct behavior from each other and from flat-metric controls.
- [ ] `npm run build`, `npm run lint`, `npx vitest run`, `npx playwright test` all pass.
- [ ] Performance: on a mid-tier GPU, every v2 preset runs at ≥ 30 FPS at the default lattice sizes.
- [ ] No metric's math, parameters, or visuals claim to show something the physics doesn't actually compute. Every description explicitly states what is and isn't modeled.
- [ ] Documentation: a new `docs/physics/curved-space-tdse.md` describing the Laplace–Beltrami operator, which metrics are implemented, which integrators are used for which, and what the limitations are.
- [ ] No regressions in the existing (flat-metric) TDSE test suite.

---

## Part 6: Out of Scope (future work)

- 4D spacetime metrics (genuine QFT in curved spacetime). v2 stays with quantum mechanics on curved 3-space.
- Backreaction (the wavepacket sourcing curvature). The metric is a fixed background.
- Dynamical black hole formation. Schwarzschild is static, eternal, and vacuum.
- Spinor fields on curved backgrounds (Dirac in curved space). Would belong in a parallel plan for `pauliSpinor` / `diracEquation` modes.
- Non-analytic metrics (numerical relativity output). All v2 metrics are analytical.
- Holographic dualities, AdS/CFT proper. The `antiDeSitter` metric is a toy, not a holographic dual.

---

## Part 7: Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Metric-aware split-step decomposition is not actually separable for most metrics | High | Fall back to v1 RK4; document per-metric integrator choice; only claim split-step for metrics where it's exact |
| Time-dependent metrics break long-run stability | Medium | Magnus integrator + adaptive dt; extensive norm-drift testing |
| Embedding diagrams are visually misleading | Medium | Add tooltip "this is an illustrative embedding, not the real 3D geometry" |
| Sphere/torus compactification requires non-trivial boundary-condition handling | Medium | Explicit in-code documentation; separate test file; conservative default settings |
| Scope creep toward full numerical GR | High | Hard line in the plan: v2 is QM on curved backgrounds only. GR is a separate project. |
| Performance regression on the flat default path | Low | Hard rule: flat metric always uses the existing FFT split-step; v2 integrators only activate on non-flat metrics. Enforce via a guard check + test. |

---

## Part 8: Physics Honesty Checklist

Every v2 preset and UI element must pass the following before merge:

1. Does the description say what is being computed? (Schrödinger equation on a fixed background metric, no backreaction.)
2. Does the description say what is NOT being computed? (Not classical geodesics; not Einstein field equations; not quantum gravity.)
3. If the preset invokes evocative physics names (wormhole, black hole, cosmology), does the description clearly bound the claim? (e.g. "shows wave dynamics in a Schwarzschild spatial slice" — not "shows what quantum particles do near real black holes").
4. Is every numerical parameter traceable to a physical quantity documented in the preset body?
5. Is every approximation stated? (e.g. "metric is static; backreaction is ignored; packet width must remain larger than lattice spacing for the finite-difference LB operator to be accurate.")

A preset that fails any of the above does not ship.
