# Plan: Physics-Rigorous Open Quantum Model for Hydrogen Orbitals (Single Integrated Delivery)

Date: 2026-02-21  
Status: Proposed  
Scope: `ObjectType = 'schroedinger'`, `quantumMode = 'hydrogenND'` (3D hydrogen core + ND extension), WebGPU/WGSL renderer, Zustand stores, diagnostics, tests

## 1. Goal

Deliver a final, physics-rigorous hydrogen open-system model where Open Q drives real state-population and coherence dynamics in hydrogen orbitals, with observable shape/behavior evolution, thermodynamically consistent rates, and numerically reliable GKLS evolution.

This is a single integrated target state, not a phased rollout.

## 2. Current Gap (What Must Be Replaced)

1. Hydrogen Open Q currently evolves a density matrix, but hydrogen basis evaluation in the compute shader is not basis-indexed by `k`.
2. The hydrogen single-basis path effectively reuses one orbital for all basis slots, so off-diagonal/transition dynamics cannot manifest as distinct spatial changes.
3. Current Lindblad channels are generic basis-index channels, not hydrogen-transition channels derived from atomic selection rules and physical rates.

## 3. Definition of Done (Final Product)

1. Hydrogen Open Q uses a true finite hydrogen basis `|i⟩` with per-basis quantum numbers and energies.
2. Lindblad jump operators are generated from hydrogen physics (selection rules + transition rates), not only generic index rules.
3. Thermal excitation and relaxation satisfy detailed balance at configured bath temperature.
4. Density-matrix dynamics visibly alter rendered hydrogen structure over time (not just color remapping).
5. Purity/entropy/coherence diagnostics are physically consistent with the active channel set.
6. Validation tests cover positivity, trace preservation, selection-rule correctness, steady states, and reference transition-rate checks.
7. Performance remains interactive under supported basis sizes.

## 4. Physics Specification (Target Model)

## 4.1 Finite Hydrogen Basis

1. Represent hydrogen open-system states as a finite basis set `B = { |i⟩ }`, where each `|i⟩` includes:
   - 3D hydrogen core quantum numbers `(n,l,m)`.
   - Extra-dimension quantum numbers for ND extension when `dimension > 3`.
2. Store explicit per-basis energies `E_i` from the existing hydrogenND energy model.
3. Remove dependence on HO-style preset term semantics for hydrogen Open Q evolution.

## 4.2 Hamiltonian and Master Equation

1. Use GKLS form:
   `dρ/dt = -i[H,ρ] + Σ_r (L_r ρ L_r† - 1/2 {L_r†L_r, ρ})`.
2. `H` is diagonal in chosen basis unless explicit coherent couplings are introduced.
3. Optional Lamb-shift term `H_LS` is included when environment model requests it.

## 4.3 Physically Rigorous Channel Families

1. Radiative spontaneous emission channels:
   - Allowed by E1 selection rules (`Δl = ±1`, `Δm = 0, ±1`, parity change).
   - Jump operator form `L_{i→j} = sqrt(γ_{i→j}) |j⟩⟨i|` for `E_i > E_j`.
2. Thermal absorption/stimulated emission:
   - Rates use bath occupation `n̄(ω,T)` with `ω = (E_i-E_j)/ħ`.
   - Enforce detailed balance ratio between upward/downward rates.
3. Elastic/pure dephasing channels:
   - Channel set that damps off-diagonal coherences while preserving populations.
   - Strength tied to physically interpretable decoherence constants (not arbitrary per-index toggles).
4. Optional model extensions (included in final product if enabled):
   - Collisional broadening/dephasing.
   - State-dependent linewidths.

## 4.4 Transition-Rate Construction

1. Compute dipole matrix elements `<j|r_q|i>` using hydrogen radial and angular factors.
2. Use angular algebra (spherical tensor / 3j-symbol structure) to enforce selection rules exactly.
3. Build Einstein-A-consistent downward rates and derive thermal upward rates from bath model.
4. Support reference-table calibration mode against NIST line data for validation and optional runtime normalization.

## 5. Numerical and Stability Specification

1. Density matrix remains Hermitian, positive semidefinite, trace-1 within tolerances.
2. Integrator upgrades from ad-hoc split step to generator-consistent evolution:
   - Build Liouvillian `𝓛` for current basis + channels.
   - Evolve with numerically stable propagator `exp(Δt 𝓛)` (or equivalent CP-preserving method).
3. Recompute propagator only when basis, rates, or temperature changes.
4. Keep monitor guards:
   - Hermiticity residual.
   - Trace drift.
   - Minimum eigenvalue.
   - Condition number / stiffness warnings.

## 6. Architecture Changes Required

## 6.1 Physics Core Modules

Add/extend under `src/lib/physics/openQuantum/`:

1. `hydrogenBasis.ts`:
   - Basis-state construction and indexing.
2. `selectionRules.ts`:
   - Exact E1 eligibility checks.
3. `dipoleElements.ts`:
   - Radial/angular matrix element pipeline and caches.
4. `hydrogenRates.ts`:
   - Einstein A, stimulated, thermal rates, detailed-balance enforcement.
5. `hydrogenChannels.ts`:
   - Build `L_r` jump-operator set from transition graph.
6. `liouvillian.ts`:
   - Superoperator assembly for Hamiltonian + dissipator.
7. `propagator.ts`:
   - Stable matrix-exponential (or equivalent) evolution backend.
8. `validation.ts`:
   - Physics invariants and runtime sanity checks.

## 6.2 Store and Config Schema

Update `SchroedingerConfig` + slice actions/selectors:

1. Add hydrogen-open-system environment config:
   - Bath temperature.
   - Coupling-scale controls.
   - Dephasing model controls.
   - Optional calibration/source mode.
2. Add hydrogen basis source config:
   - Explicit basis list definition.
   - Basis-size bounds and guardrails.
3. Keep Open Q UI coherent by mode:
   - Harmonic model controls for HO.
   - Hydrogen physical controls for hydrogenND.

## 6.3 Renderer and Shader Wiring

1. Replace hydrogen `evaluateSingleBasis` implementation so `k` selects basis state parameters.
2. Supply per-basis hydrogen quantum numbers/energy data to compute shader in a basis-indexable layout.
3. Ensure density-grid compute path uses the new hydrogen basis data when `useDensityMatrix` is enabled.
4. Keep render-graph selective rebuild logic keyed on hydrogen-open-system compile/runtime signatures.

## 6.4 Diagnostics Pipeline

1. Extend diagnostics store with hydrogen-specific observables:
   - State populations `p_i`.
   - Transition flux summary.
   - Thermal target mismatch metric.
2. Add developer-only debug dumps for basis graph, enabled transitions, and top-rate channels.

## 7. Verification and Acceptance Matrix

## 7.1 Physics Correctness Tests

1. Selection-rule tests:
   - Allowed and forbidden transitions over broad `(n,l,m)` pairs.
2. Rate tests:
   - Detailed-balance identity checks at finite `T`.
   - Zero-temperature limit behavior.
3. Evolution tests:
   - Trace and Hermiticity invariance.
   - Positivity floor behavior.
4. Steady-state tests:
   - Thermalized populations approach expected stationary distribution for closed transition subsets.

## 7.2 Reference-Data Validation

1. Compare representative transition rates against trusted atomic references.
2. Validate Einstein-A relation handling and unit consistency.
3. Store reproducible comparison fixtures in tests.

## 7.3 Rendering/Behavior Tests

1. Integration tests confirm hydrogen density-grid output changes with channel settings.
2. Visual regression/Playwright checks confirm real shape/behavior evolution over time.
3. Ensure Open Q hydrogen controls affect dynamics, not only palette outputs.

## 7.4 Performance Gates

1. Basis-size stress tests at upper supported `K`.
2. Frame-time budget checks with Open Q hydrogen active.
3. Cache-hit expectations for dipole/rate/propagator recompute paths.

## 8. Execution Sequence (Single Continuous Implementation)

1. Introduce hydrogen basis-state model and remove hydrogen dependence on HO term semantics in Open Q internals.
2. Implement selection rules and dipole/rate pipeline, including temperature-dependent detailed-balance channels.
3. Implement Liouvillian + stable propagator update path and wire into renderer evolution loop.
4. Replace hydrogen single-basis shader path with true basis-indexed evaluation and data bindings.
5. Wire hydrogen-specific Open Q controls and diagnostics into consolidated Open Q UI.
6. Add full unit/integration/render validation suite and reference-rate checks.
7. Finalize performance tuning, determinism checks, documentation, and default presets.

## 9. Hard Acceptance Criteria

1. Hydrogen Open Q produces physically interpretable orbital population/coherence evolution.
2. Changing bath temperature predictably changes upward/downward transition balance.
3. With physically allowed transitions disabled, forbidden pathways do not appear.
4. Numerical invariants remain within declared tolerances for long runs.
5. All new tests pass, including reference-rate and visual behavior checks.
6. No hidden fallback to generic HO channel semantics in hydrogen mode.

## 10. References (Implementation and Validation)

1. NIST ASD Lines Data and transition probability conventions:
   - https://physics.nist.gov/PhysRefData/ASD/lines_form.html
2. Einstein coefficient relation used by NIST (Aki/Bki/Bik):
   - https://www.nist.gov/pml/atomic-spectroscopy-compendium-basic-ideas-notation-data-and-formulas/atomic-spectroscopy-6
3. Weak-coupling Davies generator and detailed-balance structure:
   - https://arxiv.org/pdf/1909.02880
4. Thermodynamic/detailed-balance discussion for quantum Markov dynamics:
   - https://arxiv.org/pdf/2401.08135

