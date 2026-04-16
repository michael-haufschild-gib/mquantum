# Cosmological Background for Free Scalar Field — Plan

**Status**: Shipped (v1 merged 2026-04-10, canonical-δφ integrator revision 2026-04-11)
**Scope**: Extend `freeScalarField` with a time-dependent FLRW background, enabling quantum-perturbation evolution on de Sitter, ekpyrotic, and Kasner spacetimes using the canonical perturbation variables `(δφ, π_δφ)` with a time-dependent coefficient-based integrator.
**Motivation**: Beyer, Garfinkle, Isenberg, Oliynyk — *Big Bang Stability and Isotropisation for the Einstein–Scalar Field Equations in the Ekpyrotic Regime* (arXiv:2604.00297, 31 Mar 2026). The paper proves nonlinear stability of the ekpyrotic FLRW background under the Einstein–scalar system. This plan rides on top of that classical background with quantum perturbations of a minimally coupled free scalar, which is the standard textbook mechanism by which inflationary/ekpyrotic models produce primordial spectra.

> **Implementation note (2026-04-11).** The original draft of this plan (see "v1 draft math contract" at the bottom) used the Mukhanov-Sasaki rescaled variable `v = a^((n−2)/2)·δφ` and a uniform `M²_eff(η) = a²m² − z''/z`. During implementation, the `z''/z` term proved to be the source of catastrophic late-time instability in de Sitter (`|z''/z| ∝ 1/η² → ∞` as `η → 0`). The shipped integrator works directly in canonical `(δφ, π_δφ)` variables with three time-dependent coefficients `(aKinetic, aPotential, aFull)` and does not rescale the lattice state. See `docs/adr/010-fsf-cosmology-late-time-integrator.md` for the decision record.

---

## What this is (and is not)

**Is:**

- Quantum field theory in curved spacetime (Birrell–Davies, Mukhanov–Sasaki formalism) on a prescribed classical FLRW background.
- A physically accurate, minimal extension of the existing Klein–Gordon lattice solver. No new solver class, no new render pass, no new object type.
- Fully within mquantum's identity: the evolved object is a quantum scalar field; the background is a scalar sidecar, not a rendered object.

**Is not:**

- A simulation of the paper's theorem. The theorem concerns nonlinear stability of the *classical* background; we evolve *linear quantum perturbations* on top.
- A self-consistent Einstein–scalar coupled solver. There is no backreaction from the quantum perturbation onto the metric.
- A complete inflation/ekpyrosis phenomenology. The ekpyrotic spectrum is debated in the literature; we render the mathematics neutrally and disclaim in-UI.

---

## Math contract (shipped — canonical δφ integrator)

For a minimally coupled free real scalar `δφ(η,x)` on a spatially-flat FLRW metric `g = a²(η)·(−dη² + dx²)` with scale factor `a(η)` in conformal time, the canonical action is

    S = ∫dη d^(n−1)x · a^(n−2) · [½ (δφ')² − ½ (∇δφ)² − ½ m² a² δφ² − a² V(δφ)]

from which the conjugate momentum `π_δφ = a^(n−2) · δφ'` and the canonical Hamiltonian

    H_can = ∫ d^(n−1)x [½ a^(−(n−2)) π_δφ² + ½ a^(n−2) (∇δφ)² + ½ m² a^n δφ² + a^n V(δφ)]

yield the three coefficients

    aKinetic   = a^(−(n−2))     (drift coefficient)
    aPotential = a^(n−2)        (gradient / stress coefficient)
    aFull      = a^n            (volume-form coefficient for mass + V terms)

The leapfrog update reads

    δφ' = aKinetic · π_δφ                                           (drift)
    π_δφ' = aPotential · ∇²δφ − m²·aFull · δφ − aFull · V'(δφ)      (kick)

collapsing to the ordinary Klein-Gordon leapfrog when `a = 1` (Minkowski). **Only the three coefficients become time-dependent;** the lattice always stores canonical `(δφ, π_δφ)`.

For all v1 presets `a(η) = A·|η|^q` is a power law, so the coefficients are closed-form: `aKinetic = (A|η|^q)^(−(n−2))`, `aPotential = (A|η|^q)^(n−2)`, `aFull = (A|η|^q)^n`. See `src/lib/physics/cosmology/background.ts` for the unified evaluator and `docs/adr/010-fsf-cosmology-late-time-integrator.md` for the rationale behind dropping the Mukhanov-Sasaki rescaling.

### Preset table

| Preset | Regime | `q` (conformal-time exponent) | Notes |
|---|---|---|---|
| **Minkowski** | reference | 0 | Bit-identical to current behaviour |
| **de Sitter** | inflation, `V₀ > 0`, `s → 0` | −1 | Scale-invariant spectrum; primary sanity check |
| **Ekpyrotic** | paper regime, `V₀ = −1`, `s > s_c = √(8(n−1)/(n−2))`, fixed point `x₁ = s/s_c` | `q(s,n) = 2 / ((n−1)·x₁² − 1)` | Derived from paper eqs. (1.16), (1.25–1.26), (3.41) |
| **Kasner** | stiff fluid, `V₀ = 0`, `x = 1` | `1/(n−2)` | Isotropic Kasner limit |

Background ODE (paper 1.16): `x' = (n−1)·(s/s_c − x)·(1 − x²)` with fixed points `x₁ = s/s_c`, `x₂ = 1`, `x₃ = −1` and effective equation of state `w = 2x² − 1`. Integrated once on CPU for the analysis readout; the closed-form `q` bypasses the ODE for the shader hot path.

### Initial condition — Bunch–Davies adiabatic vacuum (canonical basis)

At `η = η₀` the canonical quadratic Hamiltonian is

    H_k(η₀) = ½ A(η₀) |π_{δφ,k}|² + ½ (B(η₀)·k_lat² + m²·B_full(η₀)) |δφ_k|²
    A = a^(−(n−2)),   B = a^(n−2),   B_full = a^n

Treating this as an instantaneous harmonic oscillator with effective mass `μ = B`, physical dispersion `ω_k² = k_lat² + m²·a²(η₀)`, and Bunch-Davies vacuum variances

    ⟨|δφ_k|²⟩ = 1 / (2 B ω_k),   ⟨|π_{δφ,k}|²⟩ = B ω_k / 2.

These are obtained by drawing a Minkowski-style sample with dispersion `ω_k² = k_lat² + m²·a²(η₀)` from the existing lattice sampler, then rescaling by `√B = a^((n−2)/2)`. The `M_FLOOR` zero-mode regularization flows through unchanged.

Safety: under canonical δφ the effective squared mass is `m²·a²` ≥ 0, so the vacuum is well-defined at any non-zero `η₀`. `safeEta0` now returns a constant UX floor (`DEFAULT_SAFE_ETA0 = 0.1`) that catches `η₀ = 0` and trivially-close values; the previous dimension-dependent `k_max²·η₀² ≥ 4·|z''/z|` derivation is obsolete (the `z''/z` term no longer appears in the integrator).

---

## v1 scope

### Constraints

- **Object type**: extends `freeScalarField` only — no change to `ObjectType` registry.
- **Mutually exclusive with self-interaction**: cosmology ON forces `selfInteractionEnabled = false` with a UI notice. Rationale: the free linear Mukhanov–Sasaki equivalence is exact only for the free scalar; the Mexican-hat potential on FLRW is a genuine research-grade problem (stochastic inflation / in-in formalism) and belongs in v2.
- **Spacetime dimension binding**: `n_spacetime = latticeDim + 1`, read-only in UI. Ekpyrotic valid for all `latticeDim ∈ [3, 6]`.
- **Field view relabeling**: when cosmology is enabled, the `phi`/`pi`/`energyDensity` view labels rename dynamically to `v` / `π_v` / `E_v` with a tooltip explaining the `v = a^((n−2)/2)·δφ` transformation.

### File-level change list

**Modify (small, surgical) — as shipped:**

| File | Change |
|---|---|
| `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePhi.wgsl.ts` | Multiply drift by `params.aKinetic` |
| `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarUpdatePi.wgsl.ts` | Multiply Laplacian by `params.aPotential`; mass/self-interaction terms by `params.aFull` |
| `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl.ts` | FreeScalarUniforms gains `aKinetic/aPotential/aFull` at offsets 504/508/512 (total struct 528 bytes) |
| `src/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms.ts` | `computeFsfCosmologyCoefs` per-substep resolver; partial-write slot for the three coefs; estimators rescale by `(aPotential, aFull)` for energy-density view |
| `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts` | Track `simEta`; resolve `(aKinetic, aPotential, aFull)` once per substep; re-upload the 12-byte cosmology slot per sub-step via `writeCosmologyCoefsSlot` |
| `src/lib/geometry/extended/freeScalar.ts` | Add `cosmology` sub-config + defaults (`DEFAULT_COSMOLOGY_CONFIG`) |
| `src/lib/physics/freeScalar/vacuumSpectrum.ts` | Accept `VacuumDispersion = 'kgFloor' \| number` dispatch so the adiabatic vacuum sampler can inject `m²·a²(η₀)` |
| `src/stores/slices/geometry/setters/freeScalarCosmologySetters.ts` | `setFreeScalarCosmology{Enabled,Preset,Steepness,Hubble,Eta0}` setters; `reconcileCosmologyInvariants` helper soft-disables on invalid preset combos |
| `src/lib/url/state-serializer.ts` | New params: `cos`, `cos_bg`, `cos_s`, `cos_h`, `cos_eta0` with validation/clamp |
| `src/components/sections/Geometry/SchroedingerControls/index.tsx` | Mount `CosmologyControls` inside FSF controls |
| `src/components/sections/Analysis/FSFAnalysisSection.tsx` | Readout panel: `w(η), ℋ(η), a(η), k_horizon` |

**New (isolated, pure logic):**

| File | Purpose |
|---|---|
| `src/lib/physics/cosmology/background.ts` | ODE (1.16) integrator + closed-form `a(η), ℋ(η), z''/z` for power-law presets |
| `src/lib/physics/cosmology/presets.ts` | Preset table + `q(s, n)` derivation + `s_c(n)` formula |
| `src/lib/physics/cosmology/adiabaticVacuum.ts` | Bunch–Davies sampler with configurable `ω_k(η₀)` |
| `src/components/sections/Geometry/SchroedingerControls/CosmologyControls.tsx` | Preset select, steepness slider, η₀ slider with auto-safety display, disclaimer tooltip |

**URL params** (per `.claude/rules/url-serializer.md`):

| Param | Type | Purpose |
|---|---|---|
| `cos` | 0/1 | Cosmology enabled |
| `cos_bg` | enum | `minkowski`, `deSitter`, `ekpyrotic`, `kasner` |
| `cos_s` | float | Steepness `s` (ekpyrotic only; must be > `s_c`) |
| `cos_h` | float | Hubble rate `H` (de Sitter only; required, `[0.01, 100]`) |
| `cos_eta0` | float | Initial conformal time (negative; auto-clamped above `DEFAULT_SAFE_ETA0`) |

Spacetime dim is derived from `latticeDim + 1` (validated on import); there is no separate `cos_n` param.

---

## Acceptance tests

| Test | What it pins |
|---|---|
| `src/tests/lib/physics/cosmology/background.test.ts` | Paper Table 1: fixed points `x₁, x₂, x₃` and `w` limits. Property test: trajectories from random `x₀ ∈ [−1, 1]` converge to the correct attractor per Fig. 1 |
| `src/tests/lib/physics/cosmology/presets.test.ts` | Closed-form `q`, `z''/z` for all 4 presets at `n ∈ {3, 4, 5}` against analytic derivation |
| `src/tests/lib/physics/cosmology/adiabaticVacuum.test.ts` | `|v_k|²·ω_k ≈ 1/2` within 1% across k-grid; tachyonic-mode rejection at unsafe `η₀` |
| `src/tests/lib/physics/cosmology/deSitterSpectrum.test.ts` | **Primary sanity check.** Evolve de Sitter on 16³; assert super-horizon modes (`k·|η| << 1`) satisfy `k³·|v_k/a|² ≈ H²/(2π)²` within 15% |
| `src/tests/stores/extendedObjectStore.freeScalar.test.ts` | Cosmology ⇔ self-interaction mutual exclusion; setter coverage |
| `src/tests/lib/url/state-serializer.test.ts` + `.property.test.ts` | Round-trip all new params; `cos_s ≤ s_c(n)` rejects; invalid enums rejected |
| `src/tests/rendering/webgpu/shaders/freeScalar.test.ts` | Shader recompiles with new uniform field |
| `src/tests/integration/cosmologyFsf.test.ts` | Minkowski preset is bit-identical to pre-change FSF (no regression) |
| `scripts/playwright/free-scalar-cosmology.spec.ts` | Render one frame per preset; non-zero pixels; k-space view shows horizon-exit signature for de Sitter; GPU error collection mandatory |

---

## v2 backlog

v2 is **not in scope** for the first implementation. Listed here so nothing is lost.

### v2.1 — Cosmology + self-interaction (Mexican-hat on FLRW)

Lift the v1 mutual-exclusion constraint. The linear Mukhanov–Sasaki equivalence fails when `V(φ) = λ·(φ² − v²)²` is active because the interaction vertex injects non-Gaussian mode coupling. Options to evaluate:

- **Classical-statistical approximation**: evolve `v(η,x)` as a classical field ensemble with Bunch–Davies initial conditions — exact for the free theory, tree-level accurate for the interacting case in the IR. Standard stochastic-inflation practice. Lowest-effort implementation: just remove the guardrail; the existing `dV/dφ` term in the shader already works.
- **Stochastic inflation noise**: add a Hubble-rate stochastic kick to sub-horizon → super-horizon mode crossings. Requires a per-frame random source term in the shader.
- **In-in formalism**: out of scope for a visualiser.

**Decision point**: document the approximation in-UI (tooltip on the self-interaction toggle), enable classical-statistical by default, flag limitations.

**Files touched**: lift the mutex in `CosmologyControls.tsx` and `extendedObjectStore.ts`; add a validity-regime readout to `FSFAnalysisSection.tsx`; new test pinning the de Sitter + Mexican-hat case against the known slow-roll inflaton prediction.

### v2.2 — Extend to other quantum modes

The Mukhanov–Sasaki bridge generalises to every compute mode where a time-dependent effective frequency/mass is meaningful. Each would get its own "cosmological background" toggle driven by the same `src/lib/physics/cosmology/` module built in v1.

| Mode | Generalisation | Physical meaning | Effort |
|---|---|---|---|
| **harmonicOscillator** | Time-dependent `ω_i(t)` per dimension, driven by `ω²_eff(η) = ω²₀ · a²(η) − z''/z` | Quantum squeezing of the HO vacuum under an expanding/contracting universe; direct Wigner-function visualisation of the squeezed ellipse — arguably the cleanest visual of the bridge | M (analytic mode — needs a time-dependent ω hook in `AnalyticModeStrategy`) |
| **tdseDynamics** | Time-dependent potential `V(x,t)` already supported; add FLRW-driven frequency scaling | Mimics adiabatic squeezing in 1-particle QM; pedagogical bridge | S |
| **diracEquation** | Dirac equation on FLRW — couple spin connection to `a(η)` | Particle creation from fermionic vacuum (well-known textbook result); visualises fermionic horizon crossing | L (needs spin-connection plumbing in Dirac shader) |
| **becDynamics** | Gross–Pitaevskii with time-dependent trap frequency; *not* a cosmology result strictly but the same mathematical structure | Analogue-gravity experiments; direct mapping to BEC expansion labs | M |
| **quantumWalk** | No clean bridge. Discrete-time walks on FLRW are speculative. | — | Skip |
| **pauliSpinor** | No clean bridge. Pauli spinor is non-relativistic. | — | Skip |

**Dependency**: v1 ships the `src/lib/physics/cosmology/` module, which v2.2 reuses verbatim. No duplication.

### v2.3 — Classical background dashboard

Standalone visualiser for the paper's 1D phase-portrait (eq. 1.16) and Figure 1: draggable `s/s_c`, flow arrows, fixed points, `w(x)` readout. Not tied to any quantum mode — lives under a new "Classical Background" tab in the analysis panel, clearly labelled as off-quantum-identity teaching content.

**Decision deferred**: whether to ship this at all. It's a nice pedagogical addition but dilutes the product identity. Revisit after v1 + v2.1 land.

### v2.4 — Spectrum-export tooling

Add a "Export power spectrum as CSV/JSON" action to the FSF analysis panel so users can post-process the primordial spectrum externally. Reuses the existing `src/lib/export/` machinery.

---

## Open questions (to resolve during implementation)

1. **Ekpyrotic exponent sign**: the paper works in Gaussian time `t̄` with the singularity at `t̄ = 0`; we work in conformal time `η` with the singularity at `η = 0`. Confirm the sign convention in the integrator so `q < 0` produces a contracting background for the ekpyrotic case.
2. **Bunch–Davies normalisation convention**: cross-check our `|v_k|² = 1/(2ω_k)` against the existing `sampleVacuumSpectrum` normalisation to avoid a factor-of-2 discrepancy that would skew the de Sitter spectrum test.
3. **η-advancement and playback**: `isPlaying=false` should freeze `η` (currently trivial since `stepAccumulator` is gated on `isPlaying`); verify the initial-frame η is `η₀` not `0`.
4. **Preset transitions**: switching cosmology preset should force `needsReset=true` to re-sample the adiabatic vacuum. Plumb through `extendedObjectStore` setters.

---

## References

- Beyer, Garfinkle, Isenberg, Oliynyk (2026). *Big Bang Stability and Isotropisation for the Einstein–Scalar Field Equations in the Ekpyrotic Regime*. arXiv:2604.00297.
- Mukhanov, Feldman, Brandenberger (1992). *Theory of Cosmological Perturbations*. Phys. Rep. 215.
- Birrell & Davies, *Quantum Fields in Curved Space* (Cambridge, 1982), Ch. 5–6.
- `CLAUDE.md` — mquantum identity constraints
- `.claude/rules/quantum-physics.md` — object-type and physics-accuracy rules
- `.claude/rules/url-serializer.md` — URL param conventions
- `docs/architecture.md` — file placement rules
