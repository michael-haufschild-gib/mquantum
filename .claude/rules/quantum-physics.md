# Quantum Physics Scope

## Object Type Constraint

Three object types: `ObjectType = 'schroedinger' | 'pauliSpinor' | 'bellPair'`. The first two are single-particle quantum wavefunctions; `bellPair` is the two-qubit entangled spin state used by the Bell / CHSH experiment. All three render through the same WebGPU pipeline.

## Supported Quantum Modes

### Analytical Modes

| Mode                   | Key                  | Dimensions | Basis                                              | Key Parameters                                                   |
| ---------------------- | -------------------- | ---------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Harmonic Oscillator    | `harmonicOscillator` | 1D-11D     | Hermite polynomials                                | Superposition up to 8 terms, per-dimension frequencies (`omega`) |
| Hydrogen N-Dimensional | `hydrogenND`         | 3D-11D     | Laguerre + spherical harmonics + HO for extra dims | Quantum numbers `n`, `l`, `m`; n_eff = n + (D-3)/2               |
| Anti-de Sitter         | `antiDeSitter`       | 3D-7D      | Jacobi P_n^{(α,β)} + Y_ℓm on Poincaré ball         | `d`, `n`, `l`, `m`, `mL`; Δ_± = (d−1)/2 ± √((d−1)²/4 + m²L²); BF + Klebanov-Witten window; boundary overlay |
| AdS — BTZ variant      | `antiDeSitter` (d=3) | 3D         | Hartle-Hawking thermal correlator on BTZ AdS₃ BH   | `btzEnabled`, `btzHorizonRadius` r₊ ∈ [0.05, 2.0], `btzOmega` ω ∈ [0.1, 10], `btzAngularM` m_A ∈ [−5, 5]; T_H = r₊/(2πL²); S_BH = π r₊/(2 G_N); M = r₊²/(8 G_N L²); horizon rendered as opaque disc/cylinder at fixed world radius |
| AdS — HKLL variant     | `antiDeSitter`       | 3D-7D      | Hamilton-Kabat-Lifschytz-Lowe boundary smearing     | `hkllEnabled`, `hkllBoundarySource` ∈ {`eigenstate`, `localized`, `planeWave`}, `hkllSourceSigma` ∈ [0.05, 1.5] (localized), `hkllPlaneWaveM` ∈ [0, 8] (planeWave); bulk φ(t, ρ, Ω) computed by numerical convolution of boundary O(t, Ω') against K_Δ = (max(−σ, ε))^{Δ−d}·Θ(−σ > 0) with σ = −cos(Δt)·sec(ρ) + cos(Ω·Ω')·tan(ρ); evaluated on 32³ coarse grid, trilinearly upsampled to 96³; mutually exclusive with BTZ |

### Compute Modes (GPU lattice simulation, 3D+ only)

| Mode              | Key               | Description                                                       |
| ----------------- | ----------------- | ----------------------------------------------------------------- |
| Free Scalar Field | `freeScalarField` | k-space scalar field with vacuum fluctuations                     |
| TDSE Dynamics     | `tdseDynamics`    | Time-dependent Schroedinger equation with configurable potentials |
| BEC Dynamics      | `becDynamics`     | Bose-Einstein condensate via Gross-Pitaevskii equation            |
| Dirac Equation    | `diracEquation`   | Relativistic Dirac equation on a lattice                          |
| Quantum Walk      | `quantumWalk`     | Discrete-time quantum walk with coin operator                     |

### Foundational Quantum Tests

| Mode      | Key        | Object type | Hilbert space    | Key Parameters                                                                                                                                                                                                          |
| --------- | ---------- | ----------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bell Test | `bellTest` | `bellPair`  | ℂ² ⊗ ℂ² (4 amps) | Four CHSH measurement axes (`aliceAxis`, `aliceAxisPrime`, `bobAxis`, `bobAxisPrime`); Werner visibility `v ∈ [0,1]` (threshold 1/√2 ≈ 0.7071); detection efficiency `η ∈ [0,1]` (Eberhard threshold 2/(1+√2) ≈ 0.8284); analysisMode `fairSampling \| assignNonDetection`; per-particle precession fields `fieldA`, `fieldB`; sampler `qm \| lhv` with three canonical LHV strategies. Trial loop runs in `useBellExperimentStore.processTrialBatch` driven from the renderer strategy; CHSH `S` and 95 % Wald CI are computed online with a side-by-side LHV baseline so the audience sees the classical bound `\|S\| ≤ 2` and the Tsirelson bound `\|S\| = 2√2` in the same plot. (η, v) atlas sweep panel scans the loophole plane and renders a heatmap of the violation region. |

## Wheeler–DeWitt SRMT Diagnostic (display-only overlay)

| Feature | Key | Clocks | Metric | Phase status |
| ------- | --- | ------ | ------ | ------------ |
| SRMT (Superspace-Relational Modular Time) | `srmtEnabled`, `srmtClock`, `srmtCutNormalized`, `srmtRankCap`, `srmtHeatmapIntensity` | `{a, phi1, phi2}` — `a` is the DeWitt-timelike clock (SRMT conjecture's preferred choice); `phi1` and `phi2` are spacelike controls | Affine-match quality `q = Σ (K_n − (α·E_n + β))² / Σ K_n²` between the modular-Hamiltonian spectrum `K_n = −log(s_n² + ε)` and the Hamilton–Jacobi operator spectrum on the clock slice — lower `q` = better tracking | SRMT is a *framework candidate* for the "problem of time" in quantum cosmology, not a settled physics result. The diagnostic runs in a dedicated Web Worker (`src/lib/physics/srmt/srmtDiagnostic.worker.ts`) so the top-k Lanczos eigensolver for HJ spectrum extraction never blocks the main thread — the UI shows a "computing" indicator while the worker runs. Cross-clock comparison is sequential: all three clocks are queued and drained one at a time (the non-selected clocks are marked "pending" in the UI until their worker reply lands; a future Rust/WASM port will enable parallel all-clock compute). The diagnostic overlay is display-only — toggling SRMT or changing its clock never re-runs the Wheeler–DeWitt PDE solve. |

## Physics Accuracy Requirements

- Use mathematically correct implementations — no approximations that sacrifice physical accuracy
- Bounding radius: computed dynamically per quantum state via physics formulas (not hardcoded)
- Wavefunction normalization must be preserved in superpositions
- Verify quantum number constraints: `0 <= l < n`, `-l <= m <= l`
