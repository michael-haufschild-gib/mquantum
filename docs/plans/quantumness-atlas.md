# Quantumness Atlas — PRD

**Status**: Proposed
**Scope**: Unified experimental framework combining monitoring, coordinate entanglement, and phase-space diagnostics
**Depends on**: Stochastic Decoherence Engine (PRD 1), Coordinate Entanglement Atlas (PRD 2)

## Executive Summary

Simultaneously measure three independent diagnostics of quantumness — coordinate entanglement, phase-space nonclassicality (Wigner negativity), and spatial delocalization — for a single particle in N coupled dimensions under continuous monitoring. Sweep across coupling strength λ, dimension N, and monitoring rate γ to produce a three-axis atlas that maps how different aspects of quantumness respond to the same physical parameters.

The central question: **does monitoring destroy all aspects of quantumness at the same rate, or is there a dimension-dependent ordering?**

### Scientific Positioning

**What is known:**

- Coordinate-partition entanglement (tracing out spatial coordinates of a single-particle wavefunction) is a standard construction. Its dynamics under chaotic potentials in high dimensions is the subject of PRD 2 (new as a systematic N-sweep, not new as a concept).
- Wigner negativity is an established measure of phase-space nonclassicality for continuous-variable quantum states. Its decay under decoherence is well-studied for specific models (Gaussian channels, optical states).
- Spatial delocalization (IPR, localization length) under monitoring is addressed in PRD 1. The monitored-dynamics literature has studied localization in circuit and lattice models.
- Individual decoherence studies typically track ONE nonclassicality measure. The relationship between different measures under the same dynamics is less studied.

**What is not known:**

1. Whether coordinate entanglement, Wigner negativity, and spatial delocalization erode at the same rate under continuous spatial monitoring of a single particle in N dimensions
2. Whether there is an ordering — does one measure of quantumness die before another?
3. Whether the ordering depends on dimension N, coupling λ, or monitoring rate γ
4. The topology of the "quantumness landscape" in the (λ, N, γ) parameter space when measured by multiple independent diagnostics

**The defensible claim:**

> "We simultaneously track three nonclassicality diagnostics — coordinate entanglement, phase-space negativity, and spatial delocalization — for a continuously monitored single-particle system across dimensions 2–7, and characterize how their erosion rates relate to each other as a function of coupling, dimension, and monitoring strength."

This is a new experiment in the sense that nobody has the tool to run it. The individual diagnostics are known. The question of their relative behavior under the same dynamics in a tunable N-dimensional system has not been systematically addressed.

---

## Part 1: The Three Diagnostics

### 1.1 Diagnostic A: Coordinate Entanglement (from PRD 2)

**Observable**: S̄(t) = average von Neumann entropy across single-coordinate bipartitions

**What it measures**: How non-separable the wavefunction is across spatial dimensions. S̄ = 0 means the state is a product across all dimensions. S̄ > 0 means the dimensions are quantum-correlated.

**Computation**: Reduced density matrix ρ_d via tensor contraction + eigendecomposition. O(totalSites × M) per dimension. Already designed in PRD 2.

**Range**: S̄ ∈ [0, log(M)] where M is the grid size per dimension.

### 1.2 Diagnostic B: Wigner Negativity (new)

**Observable**: N_W(t) = total Wigner negativity, defined as the integral of the negative part of the Wigner function

```
N_W = ∫∫ max(-W(x,p), 0) dx dp
```

For a non-negative Wigner function (classical state): N_W = 0.
For states with quantum interference: N_W > 0.

**What it measures**: Phase-space nonclassicality. Wigner negativity is a necessary condition for quantum computational advantage in continuous-variable systems and a direct measure of "how quantum" the state is in phase space.

**Why it complements coordinate entanglement**: A state can be coordinate-entangled (non-separable across dimensions) but have a non-negative Wigner function (e.g., correlated Gaussian states). Conversely, a state can have Wigner negativity but be separable across dimensions (e.g., a single-mode squeezed state in a separable potential). These are genuinely independent measures.

**Computation for TDSE modes**: The existing Wigner cache only works for analytic modes (HO, hydrogen). For TDSE compute modes, compute the marginal Wigner function per dimension from the readback ψ data:

```
W_d(x_d, p_d) = (1/πℏ) Σ_y ψ_d*(x_d + y) · ψ_d(x_d - y) · e^{2ip_d·y/ℏ}
```

where ψ_d(x_d) is the marginal wavefunction obtained by integrating |ψ|² over all other dimensions... No — that gives the marginal DENSITY, not the marginal wavefunction. The marginal Wigner function of the full state IS the Wigner function of the reduced density matrix ρ_d.

**Correct computation**: From the reduced density matrix ρ_d (already computed for coordinate entanglement):

```
W_d(x_d, p_d) = (1/πℏ) Σ_y ρ_d(x_d + y, x_d - y) · e^{2ip_d·y/ℏ}
```

This is an FFT of the anti-diagonals of ρ_d. Since ρ_d is M × M, this is M FFTs of length M: O(M² log M).

**Single-coordinate Wigner negativity**:

```
N_{W,d} = Σ_{x_d, p_d} max(-W_d(x_d, p_d), 0) · Δx · Δp
```

This gives the negativity of the marginal Wigner function for dimension d. For a Gaussian reduced state, N_{W,d} = 0. For a non-Gaussian reduced state, N_{W,d} > 0.

**Important subtlety**: The marginal Wigner function W_d is always a valid Wigner function (it's the Wigner function of ρ_d). However, the TOTAL Wigner function W(x₁,p₁,...,x_N,p_N) can be negative even when all marginals W_d are non-negative. The marginal negativity N_{W,d} is a lower bound on the total nonclassicality. Computing the full 2N-dimensional Wigner function is infeasible for N > 2, so we work with marginals and pairwise joints.

**Pairwise joint Wigner negativity** (optional, for dimension pairs with M ≤ 16):

```
W_{d₁,d₂}(x_{d₁}, p_{d₁}, x_{d₂}, p_{d₂})
```

Computed from the 2-coordinate reduced density matrix ρ_{d₁,d₂} (size M²×M²). The 4D Wigner function is computed on an M × M × M × M grid via 2D FFT of the anti-diagonal structure. Negativity of this joint Wigner captures quantum correlations between the two dimensions that the marginals miss.

**Average Wigner negativity**:

```
N̄_W(t) = (1/N) Σ_d N_{W,d}(t)
```

**Range**: N̄_W ∈ [0, ∞) in principle, but bounded by the grid resolution. Normalize by dividing by the negativity of a reference state (e.g., the initial condition at t=0).

### 1.3 Diagnostic C: Spatial Delocalization (from PRD 1)

**Observable**: IPR_norm(t) = normalized inverse participation ratio

```
IPR = (Σ|ψ_i|²)² / Σ|ψ_i|⁴
IPR_norm = IPR / totalSites ∈ (0, 1]
```

**What it measures**: How spread out the wavefunction is in position space. IPR_norm ≈ 1 for a uniform (maximally delocalized) state. IPR_norm ≈ 1/totalSites for a delta function (maximally localized).

**Computation**: Already available in the existing TDSE diagnostics (sumPsi4 field in the diagnostic result buffer). Zero additional compute cost.

**Why it complements the other two**: IPR measures spatial structure in position space only. It is insensitive to phase (two states with the same |ψ|² but different phases have the same IPR but different Wigner functions). It is also insensitive to dimensional correlations (a product state and a correlated state with the same marginals have the same IPR).

### 1.4 Independence of the Three Diagnostics

| State type | S̄ (coord. entanglement) | N̄_W (Wigner negativity) | IPR_norm (delocalization) |
|-----------|--------------------------|--------------------------|--------------------------|
| Separable Gaussian wavepacket | 0 | 0 | Medium |
| Separable non-Gaussian (e.g., cat state per dim) | 0 | High | Medium |
| Entangled Gaussian (correlated across dims) | High | 0 | Medium |
| Entangled non-Gaussian under chaos | High | High | Medium–High |
| Fully localized (post-monitoring) | Low | Low | Low |
| Fully delocalized uniform | 0 (uniform is separable) | 0 (uniform is Gaussian-like) | 1 |

The table shows that the three diagnostics can take independent values — they are NOT redundant. This is what makes the atlas interesting: monitoring could push the system along different paths in the (S̄, N̄_W, IPR) space depending on the physics.

---

## Part 2: The Experiment

### 2.1 Parameter Space

| Axis | Symbol | Range | Points | Notes |
|------|--------|-------|--------|-------|
| Coupling strength | λ | 0.01 – 50 (log-spaced) | 12 | Controls integrability → chaos transition |
| Dimension | N | {2, 3, 4, 5, 7} | 5 | Limited by grid size (M must be power of 2, totalSites ≈ 1M) |
| Monitoring rate | γ | 0, 0.1, 0.3, 1, 3, 10 | 6 | From unmonitored to strongly monitored |

**Total points**: 12 × 5 × 6 = 360

### 2.2 Per-Point Protocol

For each (λ, N, γ):

1. Configure TDSE: coupled anharmonic potential with coupling λ, N dimensions, grid size M (from dimension table)
2. Configure monitoring: stochastic localization at rate γ (from PRD 1 infrastructure)
3. Initialize: separable Gaussian wavepacket (product state, so S̄ = 0 at t=0)
4. Evolve T_evolve = 1500 TDSE steps
5. During last T_measure = 500 steps, at each diagnostic frame (every 5 steps = 100 samples):
   a. Read back ψ (existing readback)
   b. Compute coordinate entanglement S̄ (PRD 2 computation)
   c. Compute Wigner negativity N̄_W from ρ_d (new computation, uses same ρ_d)
   d. Read IPR from existing diagnostics (zero cost)
6. Record time-averaged ⟨S̄⟩, ⟨N̄_W⟩, ⟨IPR_norm⟩ and their variances

### 2.3 Grid Sizes Per Dimension

| N | M (per dim, power of 2) | Total sites | M for Wigner grid (x,p) | Notes |
|---|------------------------|-------------|--------------------------|-------|
| 2 | 512 | 262K | 512×512 | High resolution |
| 3 | 64 | 262K | 64×64 | Default |
| 4 | 32 | 1.05M | 32×32 | Joint Wigner for pairs: 32²×32² feasible |
| 5 | 16 | 1.05M | 16×16 | Joint Wigner for pairs: 16²×16² trivial |
| 7 | 8 | 2.1M | 8×8 | Coarse but functional; pairwise joint Wigner: 64×64 trivial |

### 2.4 Hypotheses

| # | Hypothesis | Risk | Significance if confirmed |
|---|-----------|------|--------------------------|
| H1 | Under monitoring (γ > 0), all three diagnostics decrease over time | Low | Sanity check: monitoring erodes quantumness |
| H2 | The three diagnostics erode at different rates | Medium | Quantumness is multi-dimensional, not a single number |
| H3 | There is a consistent ordering: one diagnostic reaches zero first | Medium | There exists a hierarchy of quantum robustness |
| H4 | The ordering depends on dimension N | High | The structure of quantumness is dimension-dependent — the deepest possible finding |
| H5 | At fixed γ, higher N causes faster erosion of all three diagnostics | Medium | More dimensions = more channels for decoherence |
| H6 | There exist parameter regions where S̄ is high but N̄_W ≈ 0 (entangled but classical in phase space) | Medium | Coordinate entanglement and phase-space nonclassicality are genuinely independent resources |

H4 is the headline result if it holds: the nature of quantumness changes with the number of spatial dimensions. This has never been measured because nobody has had the tool.

H6 is the most surprising possible finding: it would mean that a state can be highly entangled across dimensions while looking completely classical in every phase-space slice. This is known to be possible in principle (correlated Gaussian states achieve it), but whether the DYNAMICS naturally produce such states under monitoring in high dimensions is unknown.

---

## Part 3: Wigner Negativity Computation (New Infrastructure)

### 3.1 From ρ_d to Wigner Function

The reduced density matrix ρ_d(i, j) is already computed for coordinate entanglement (PRD 2). The marginal Wigner function is:

```
W_d(x_m, p_n) = (1/πℏ) Σ_{k=0}^{M-1} ρ_d(m+k, m-k) · e^{2iπnk/M}
```

where indices are modular (periodic boundary) and the (x,p) grid has M × M points.

This is a discrete Fourier transform along the anti-diagonal direction of ρ_d, evaluated at each position x_m. Implemented as:

```typescript
function wignerFromRDM(
  rhoRe: Float64Array, rhoIm: Float64Array, M: number
): { wigner: Float64Array, negativity: number } {
  const W = new Float64Array(M * M)  // W[x * M + p]
  let negSum = 0
  const dx = spacing  // from TDSE config
  const dp = 2 * Math.PI / (M * dx)  // conjugate spacing

  for (let xIdx = 0; xIdx < M; xIdx++) {
    // Extract anti-diagonal of ρ centered at (xIdx, xIdx)
    // ρ(xIdx + k, xIdx - k) for k = -M/2 ... M/2-1
    const slice = new Float64Array(M * 2)  // complex
    for (let k = 0; k < M; k++) {
      const i = (xIdx + k) % M
      const j = (xIdx - k + M) % M
      slice[2 * k] = rhoRe[i * M + j]
      slice[2 * k + 1] = rhoIm[i * M + j]
    }

    // FFT of the slice → W(xIdx, p) for all p
    fft(slice, M)

    for (let pIdx = 0; pIdx < M; pIdx++) {
      const val = slice[2 * pIdx] / (Math.PI)  // normalization
      W[xIdx * M + pIdx] = val
      if (val < 0) negSum -= val * dx * dp
    }
  }

  return { wigner: W, negativity: negSum }
}
```

### 3.2 Performance

| Dimension N | M | ρ_d computation (from PRD 2) | Wigner from ρ_d | Total per dim | All N dims |
|-------------|---|------------------------------|-----------------|---------------|------------|
| 2 | 512 | ~260M FLOPs | 512 FFTs × 512 = ~2.4M | ~262M | ~524M |
| 3 | 64 | ~17M FLOPs | 64 FFTs × 64 = ~25K | ~17M | ~51M |
| 4 | 32 | ~34M FLOPs | 32 FFTs × 32 = ~5K | ~34M | ~136M |
| 5 | 16 | ~17M FLOPs | 16 FFTs × 16 = ~1K | ~17M | ~85M |
| 7 | 8 | ~17M FLOPs | 8 FFTs × 8 = ~200 | ~17M | ~119M |

The Wigner computation is negligible compared to the ρ_d computation — it's M FFTs of length M, which is O(M² log M) vs O(totalSites × M) for the tensor contraction. The bottleneck remains the ρ_d computation, which is already budgeted in PRD 2.

**Wall-clock estimate** (all N dimensions, including ρ_d + Wigner + entropy):

| N | Estimated time per diagnostic frame | At decimation=5, amortized per frame |
|---|-------------------------------------|---------------------------------------|
| 3 | ~20 ms | ~4 ms |
| 5 | ~30 ms | ~6 ms |
| 7 | ~40 ms | ~8 ms |

Runs in a Web Worker (non-blocking). Acceptable.

### 3.3 Pairwise Joint Wigner Negativity (Optional)

For dimension pairs (d₁, d₂), the 4D joint Wigner function captures quantum correlations invisible to the marginals. Computed from the 2-coordinate reduced density matrix ρ_{d₁,d₂} (size M² × M²):

| N | M | ρ_{d₁,d₂} size | Wigner grid (4D) | Feasible? |
|---|---|----------------|------------------|-----------|
| 3 | 64 | 4096×4096 | 64⁴ = 16M points | Too expensive |
| 4 | 32 | 1024×1024 | 32⁴ = 1M points | Marginal (~1s) |
| 5 | 16 | 256×256 | 16⁴ = 65K points | Fast |
| 7 | 8 | 64×64 | 8⁴ = 4K points | Trivial |

Compute pairwise joint Wigner only when M ≤ 16 (N ≥ 5). For lower dimensions, use only the marginal negativity.

---

## Part 4: Sweep Infrastructure

### 4.1 Unified Sweep Orchestrator

The sweep runs sequentially over the (λ, N, γ) parameter space. For each point:

1. Reconfigure TDSE (potential, grid, dimension)
2. Reconfigure monitoring (γ — from PRD 1)
3. Reset wavefunction
4. Wait for shader compilation (dimension/grid changes trigger recompile)
5. Evolve T_evolve steps
6. Collect diagnostics over T_measure steps
7. Record (λ, N, γ) → (⟨S̄⟩, ⟨N̄_W⟩, ⟨IPR_norm⟩, variances)

**Dimension changes require TDSE pipeline rebuild.** To minimize rebuild cost, sweep in this order:

```
for each N (outer — most expensive to change):
  rebuild TDSE pipeline for N dimensions
  for each λ (middle — reconfigure potential, reset ψ):
    for each γ (inner — cheapest, just change monitoring rate):
      run evolution + collect diagnostics
```

This gives 5 pipeline rebuilds (one per N) and 60 potential reconfigurations (12λ × 5N) and 360 evolution runs.

### 4.2 Sweep Time Budget

| Step | Time per point | Total (360 points) |
|------|---------------|---------------------|
| Pipeline rebuild (per N) | ~2s | 5 × 2s = 10s |
| Potential reconfigure + reset (per λ×N) | ~0.1s | 60 × 0.1s = 6s |
| Evolution (1500 steps × ~500µs) | ~0.75s | 360 × 0.75s = 270s |
| Diagnostics (100 frames × ~30ms in worker) | ~3s | 360 × 3s = 1080s |
| **Total** | | **~23 minutes** |

The diagnostics computation dominates. With the Web Worker running in parallel with the next evolution point's GPU work, the effective time is closer to:

```
max(GPU evolution, CPU diagnostics) per point ≈ max(0.75s, 3s) = 3s
Total ≈ 360 × 3s + 16s overhead ≈ 18 minutes
```

This is a long sweep. Options:
- **Reduced sweep**: 8λ × 4N × 4γ = 128 points → ~7 minutes
- **Background execution**: sweep runs while the user interacts with the app normally. Progress bar in the analysis panel.
- **Incremental results**: each completed point is immediately added to the atlas visualization. The user sees the map filling in.

### 4.3 Data Output

Per sweep point, store:

```typescript
interface AtlasPoint {
  lambda: number
  dim: number
  gamma: number
  // Diagnostic A: coordinate entanglement
  avgCoordEntanglement: number
  varCoordEntanglement: number
  // Diagnostic B: Wigner negativity
  avgWignerNegativity: number
  varWignerNegativity: number
  // Diagnostic C: spatial delocalization
  avgIPR: number
  varIPR: number
  // Metadata
  gridSizePerDim: number
  totalSteps: number
  measurementWindow: number
}
```

Total data: 360 points × ~100 bytes = ~36 KB. Trivial.

---

## Part 5: Visualization

### 5.1 Atlas Views

The atlas data is 3D (λ × N × γ) with 3 observables. Present as:

**View 1: Erosion Curves** (primary view)

For a selected (λ, N): plot all three diagnostics vs γ on the same axes (normalized to [0,1]).

```
Y-axis: diagnostic value (normalized)
X-axis: monitoring rate γ
Lines: S̄ (blue), N̄_W (orange), IPR (green)
```

This directly shows whether the three diagnostics erode at different rates and whether there's an ordering.

**View 2: Dimension Comparison**

For a selected (λ, γ): plot one diagnostic vs N.

```
Y-axis: S̄ (or N̄_W, or IPR)
X-axis: dimension N
```

Shows how a specific aspect of quantumness scales with dimension.

**View 3: Cross-Diagnostic Scatter**

For all sweep points: scatter plot of S̄ vs N̄_W, colored by N.

```
X-axis: coordinate entanglement S̄ (normalized)
Y-axis: Wigner negativity N̄_W (normalized)
Color: dimension N
```

If the diagnostics track together: points cluster along the diagonal.
If they're independent: points fill the 2D plane.
If there's dimension-dependent structure: different colors cluster in different regions.

**View 4: 2D Heatmap Slices**

For a selected γ: heatmap of λ × N, colored by one diagnostic.

Three side-by-side heatmaps (S̄, N̄_W, IPR) at the same γ. If they look the same: quantumness is one-dimensional. If they look different: quantumness has structure.

### 5.2 UI Location

New tab in the analysis section of the right panel: **"Quantumness Atlas"**

| Component | Content |
|-----------|---------|
| Header | "Quantumness Atlas" with sweep controls |
| Sweep controls | λ range, N selection, γ range, start/stop, progress bar |
| View selector | Toggle between Erosion Curves / Dimension Comparison / Scatter / Heatmap |
| Erosion curves | Three overlaid sparklines (S̄, N̄_W, IPR) vs γ |
| Scatter plot | S̄ vs N̄_W with dimension coloring |
| Heatmaps | Three side-by-side λ × N maps at selected γ |
| Export | Download atlas data as CSV/JSON |

---

## Part 6: Test Plan

### 6.1 Unit Tests — Wigner from RDM

**File**: `src/tests/lib/physics/wigner/wignerFromRDM.test.ts`

```
describe('wignerFromRDM')

  test('pure Gaussian state has non-negative Wigner function')
    → ρ_d for a Gaussian wavepacket (known: ρ(i,j) = exp(-(i²+j²)/(4σ²)))
      All W(x,p) ≥ -ε (ε = 1e-8 for numerical noise).
      Negativity ≈ 0.

  test('Fock state |1⟩ has known Wigner negativity')
    → ρ_d = |1⟩⟨1| on M=32 grid.
      W(0,0) = -1/(πℏ) (negative at origin).
      Textbook result. Negativity > 0.
      Total negativity matches analytical value within 5%
      (discretization error at finite M).

  test('Wigner function integrates to 1')
    → Arbitrary ρ_d (normalized, Tr(ρ)=1).
      Σ_{x,p} W(x,p) Δx Δp = 1 ± 1e-6.

  test('marginal of Wigner over p gives position probability')
    → Σ_p W(x,p) Δp = ρ_d(x,x) for each x.
      Matches to 1e-8.

  test('marginal of Wigner over x gives momentum probability')
    → Σ_x W(x,p) Δx = ρ̃_d(p,p) (momentum-space density).
      Matches to 1e-8.

  test('Wigner negativity is zero for thermal (diagonal Gaussian) state')
    → ρ_d = diagonal with Gaussian weights.
      N_W = 0 (classical state).

  test('Wigner negativity increases with number of Fock state nodes')
    → |0⟩: N_W = 0. |1⟩: N_W > 0. |2⟩: N_W > N_W(|1⟩).
      Higher Fock states have more phase-space interference.
```

### 6.2 Unit Tests — Three-Diagnostic Independence

**File**: `src/tests/lib/physics/quantumnessAtlas.test.ts`

```
describe('diagnostic independence')

  test('correlated Gaussian has S̄ > 0 but N̄_W = 0')
    → Construct a 2D Gaussian wavefunction with cross-correlation:
      ψ(x₁,x₂) = exp(-(x₁² + x₂² + 2c·x₁·x₂)/(4σ²)) with |c| < 1.
      S₁ > 0 (non-separable), but Wigner function is Gaussian → N_W = 0.
      Demonstrates that entanglement ≠ nonclassicality.

  test('separable cat state has S̄ = 0 but N̄_W > 0')
    → ψ(x₁,x₂) = φ_cat(x₁) · φ_gauss(x₂)
      where φ_cat = (|α⟩ + |-α⟩)/√2 (superposition of two Gaussians).
      S₁ = 0 (product state), but W₁ has negativity (cat states are non-Gaussian).
      Demonstrates that nonclassicality ≠ entanglement.

  test('uniform state has IPR_norm = 1 but S̄ = 0 and N̄_W = 0')
    → ψ = 1/√totalSites everywhere.
      IPR_norm = 1, S̄ = 0 (uniform is separable), N̄_W ≈ 0.
      Demonstrates that delocalization ≠ entanglement ≠ nonclassicality.
```

### 6.3 Property-Based Tests

**File**: `src/tests/lib/physics/wigner/wignerFromRDM.property.test.ts`

```
describe('Wigner function invariants (property-based)')

  test('Wigner integrates to 1 for arbitrary normalized ρ_d')
    → fast-check: random Hermitian PSD ρ_d with Tr=1, M ∈ {4,8,16}.
      |Σ W Δx Δp - 1| < 1e-4. 200 samples.

  test('Wigner negativity ≥ 0 for all states')
    → fast-check: random ρ_d. N_W ≥ -1e-8. 200 samples.

  test('Wigner negativity = 0 for Gaussian ρ_d')
    → fast-check: random Gaussian ρ_d (parameterized by σ, x₀, p₀).
      N_W < 1e-6. 100 samples.
```

### 6.4 E2E Tests — Wigner Negativity Pipeline

**File**: `scripts/playwright/quantumness-atlas.spec.ts`

```
describe('Wigner Negativity GPU Pipeline')

  beforeEach:
    → tdseDynamics 3D, coupledAnharmonic, diagnostics on, entanglement on

  test('Gaussian initial state has near-zero Wigner negativity')
    → λ=0, no monitoring. Evolve 100 frames.
    → Read avgWignerNegativity from store.
    → avgWignerNegativity < 0.01 (Gaussian stays Gaussian in separable potential).

  test('chaotic evolution produces Wigner negativity')
    → λ=10, no monitoring. Evolve 300 frames.
    → Read avgWignerNegativity.
    → avgWignerNegativity > 0.01 (chaos generates non-Gaussian features).

  test('monitoring reduces Wigner negativity')
    → λ=10, γ=0: evolve 300 frames, record N_W_unmonitored.
    → Reset, λ=10, γ=5: evolve 300 frames, record N_W_monitored.
    → N_W_monitored < N_W_unmonitored (monitoring erodes nonclassicality).

  test('monitoring reduces coordinate entanglement')
    → λ=10, γ=0: evolve 300 frames, record S̄_unmonitored.
    → Reset, λ=10, γ=5: evolve 300 frames, record S̄_monitored.
    → S̄_monitored < S̄_unmonitored.

  test('monitoring reduces IPR (localizes)')
    → λ=10, γ=0: evolve 300 frames, record IPR_unmonitored.
    → Reset, λ=10, γ=5: evolve 300 frames, record IPR_monitored.
    → IPR_monitored < IPR_unmonitored.
```

### 6.5 E2E Tests — Sweep and Atlas

**File**: `scripts/playwright/quantumness-atlas.spec.ts` (continued)

```
describe('Quantumness Atlas Sweep')

  test('mini sweep (2λ × 2N × 2γ = 8 points) produces valid results')
    → Sweep λ={0.1, 10}, N={3,5}, γ={0, 3}.
    → All 8 points have finite, non-negative diagnostics.
    → At γ=0, λ=0.1: S̄ ≈ 0 and N̄_W ≈ 0 (weak coupling, no monitoring).
    → At γ=3, λ=10: S̄ < S̄(γ=0), N̄_W < N̄_W(γ=0) (monitoring erodes both).

  test('all three diagnostics are bounded correctly')
    → For all sweep points:
      S̄ ∈ [0, log(M)], N̄_W ≥ 0, IPR_norm ∈ (0, 1].

  test('atlas data is exportable as CSV')
    → Run mini sweep. Click export. Verify CSV has correct column headers
      and row count = 8.
```

### 6.6 Test File Placement

| Test File | Type | What it validates |
|-----------|------|-------------------|
| `src/tests/lib/physics/wigner/wignerFromRDM.test.ts` | Unit | Wigner from RDM, negativity, marginal consistency |
| `src/tests/lib/physics/quantumnessAtlas.test.ts` | Unit | Independence of three diagnostics (constructed counterexamples) |
| `src/tests/lib/physics/wigner/wignerFromRDM.property.test.ts` | Property | Wigner normalization, negativity bounds |
| `scripts/playwright/quantumness-atlas.spec.ts` | E2E | GPU pipeline, monitoring effect, sweep validity |

### 6.7 Chain of Trust

```
Analytical formulas (Gaussian → N_W=0, Fock |1⟩ → known N_W, marginals = probabilities)
  → CPU unit tests (exact values from known ρ_d)
    → CPU diagnostic independence tests (constructed states proving S̄ ⊥ N̄_W ⊥ IPR)
      → GPU e2e tests (chaotic TDSE → readback → ρ_d → Wigner → negativity → store → assertion)
        → Sweep e2e tests (mini atlas validates structure without full 360-point run)
```

---

## Part 7: Implementation Phases

### Phase 0: Prerequisites

- PRD 1 (Stochastic Decoherence Engine) Phase 1 complete: stochastic monitoring infrastructure operational
- PRD 2 (Coordinate Entanglement Atlas) Phase 1 complete: ρ_d computation and entropy working

### Phase 1: Wigner Negativity from RDM

1. Implement `wignerFromRDM()` in `src/lib/physics/wigner/wignerFromRDM.ts`
2. Implement small FFT routine (size ≤ 512, pure TypeScript, no external dependency)
3. Unit tests: Gaussian → 0, Fock → known value, marginal consistency
4. Property tests: normalization, negativity bounds
5. Add pairwise joint Wigner computation (for M ≤ 16)

### Phase 2: Unified Diagnostics

1. Extend Web Worker from PRD 2 to also compute Wigner negativity from the same ρ_d
2. Add N̄_W to the coordinate entanglement store (or create unified `quantumnessStore.ts`)
3. E2E test: chaotic TDSE produces N̄_W > 0, monitoring reduces N̄_W

### Phase 3: Atlas Sweep

1. Implement unified sweep orchestrator over (λ, N, γ) with dimension-outer loop
2. Store AtlasPoint array with all three diagnostics
3. Background execution with progress tracking
4. CSV/JSON export

### Phase 4: Visualization

1. Erosion curves view (3 lines vs γ)
2. Cross-diagnostic scatter plot (S̄ vs N̄_W colored by N)
3. Heatmap slices (λ × N at fixed γ, three side-by-side)
4. Dimension comparison view

### Phase 5: Polish

1. Preset configurations for common experiments
2. URL serialization for atlas params
3. Resolution dependence checks (automatic M vs M/2 validation)
4. Tooltip documentation

---

## Part 8: Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Marginal Wigner negativity is always zero (marginals of valid Wigner functions are non-negative) | Diagnostic B is uninformative for single-coordinate marginals | **See analysis below** | Use the Wigner function of ρ_d (reduced density matrix), NOT the marginal of the full Wigner function. These are different objects. The Wigner function of a mixed state ρ_d CAN be negative. |
| All three diagnostics track together perfectly | No interesting structure — quantumness is one-dimensional | Medium | This IS a result. It means quantumness is simpler than expected. The atlas still has value as a comprehensive benchmark. |
| Wigner negativity is dominated by grid artifacts at M=8 | False positives from discretization | Medium | Resolution dependence checks. Compare M=8 vs M=4 results. Threshold small negativities (N_W < 0.001) to zero. |
| Sweep takes too long (>30 min) | User abandonment | Medium | Offer reduced sweep presets (8λ × 3N × 3γ = 72 points, ~4 min). Show incremental results. |
| PRD 1 or PRD 2 not yet implemented | Atlas cannot run | Depends on dev order | Phase 0 prerequisites are explicit. Atlas is designed to be built last. |
| Joint Wigner negativity is always zero for the states this system produces | Pairwise diagnostic adds no information | Medium | This would mean that inter-dimensional quantum correlations are always Gaussian in character. Interesting negative finding. Fall back to marginal negativity (from ρ_d) which is more sensitive. |

### Marginal vs RDM Wigner — Critical Distinction

The marginal Wigner function obtained by integrating the full Wigner function W(x₁,p₁,...,x_N,p_N) over all but one (x_d, p_d) pair is always non-negative — it's a valid probability distribution. This would make Diagnostic B trivially zero.

However, the Wigner function of the REDUCED DENSITY MATRIX ρ_d is a DIFFERENT object. ρ_d is typically a MIXED state (when dimensions are entangled), and the Wigner function of a mixed state CAN be negative if the mixture involves non-Gaussian components.

The distinction:
- Marginal Wigner W_d(x,p) = ∫ W_full(...) d(other vars) → always ≥ 0
- Wigner of ρ_d = (1/πℏ) Σ_y ρ_d(x+y, x-y) e^{2ipy/ℏ} → can be < 0

These are the SAME object only when the full state is pure. For entangled states (where ρ_d is mixed), they differ, and the Wigner of ρ_d can show negativity that the marginal cannot.

Wait — actually, this is NOT correct. The marginal Wigner function and the Wigner function of ρ_d ARE the same object. The marginal of the full Wigner function over all other phase-space variables gives exactly the Wigner function of the reduced density matrix. This is a theorem.

And the Wigner function of any valid density matrix (pure or mixed) is always such that its marginals over p (or x) give the correct probability distributions — but the Wigner function itself CAN be negative for non-Gaussian mixed states.

So: the Wigner function of ρ_d IS the marginal of the full Wigner function, AND it can be negative when ρ_d is a non-Gaussian mixed state. Both statements are true.

The key question is whether chaotic TDSE dynamics produces reduced states ρ_d that are sufficiently non-Gaussian to have measurable Wigner negativity. This is genuinely unknown for this system.

If ρ_d remains approximately Gaussian (which happens when the coupling thermalizes the marginals toward a thermal state): N_W ≈ 0, and Diagnostic B is uninformative. In this case, the pairwise JOINT Wigner function W_{d₁,d₂} (Wigner of the 2-coordinate RDM) becomes the relevant observable, since 2-coordinate correlations can show negativity even when single-coordinate states are Gaussian.

**Mitigation**: Compute both single-coordinate and pairwise Wigner negativity. If single-coordinate is always zero, fall back to pairwise. If both are zero, report this as a finding: inter-dimensional entanglement in this system is Gaussian in character.

---

## Part 9: Success Criteria

### Infrastructure
- [ ] Wigner function from RDM matches analytical results (Gaussian → N_W = 0, Fock |1⟩ → known N_W)
- [ ] Wigner marginals reproduce position/momentum probability distributions
- [ ] Property tests pass (200+ samples)
- [ ] Web Worker computes all three diagnostics from single ψ readback

### Diagnostics
- [ ] Three diagnostics verified to be independent via constructed counterexamples (unit test)
- [ ] All three decrease under monitoring (e2e test)
- [ ] S̄ = 0 and N̄_W ≈ 0 at λ = 0 (separable baseline)

### Atlas
- [ ] Mini sweep (8 points) produces valid, bounded results
- [ ] Full sweep (360 points) completes in < 25 minutes
- [ ] Atlas data exportable as CSV with correct columns
- [ ] Erosion curves view shows three lines on same axes
- [ ] Cross-diagnostic scatter shows data points colored by dimension

### Scientific Output
- [ ] The atlas faithfully renders whatever relationship exists between the three diagnostics, without imposing expectations
- [ ] If all three diagnostics track together: this is reported as a finding (quantumness is one-dimensional)
- [ ] If they decouple: the specific ordering and its dimension-dependence are visible in the visualization
- [ ] Resolution dependence validated at ≥ 3 (λ,N) points (M vs M/2 within 20%)
