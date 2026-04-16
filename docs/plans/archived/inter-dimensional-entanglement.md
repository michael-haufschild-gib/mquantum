# Coordinate Entanglement Atlas — PRD

**Status**: Proposed
**Scope**: New diagnostic and analysis feature for TDSE dynamics
**Depends on**: TDSE compute pipeline (existing), diagnostics readback (existing), coupled anharmonic potential (existing)

## Executive Summary

Treat the N spatial dimensions of a single-particle wavefunction as N quantum subsystems. Measure the entanglement between these subsystems via the reduced density matrix. Track how this entanglement grows under integrable vs chaotic dynamics. Sweep across dimensions 2–11 and coupling strengths to map out a coordinate entanglement atlas — how growth and saturation depend on coupling and dimension.

This is a numerical experiment with unknown outcomes, not a visualization of known physics.

### Scientific Positioning

**What is already known:**

- Coordinate-partition entanglement (factorizing L²(ℝ^N) ≅ ⊗ L²(ℝ) and tracing out coordinates) is a standard entanglement construction for pure states. Entanglement between degrees of freedom in single-particle systems has been studied experimentally and theoretically for years (Hasegawa et al., [Found. Phys. 2010](https://link.springer.com/article/10.1007/s10701-010-9499-y)).
- Entanglement in coupled harmonic and anharmonic oscillator systems is well-established literature, including dynamical entropy calculations and continuous-variable treatments.
- Entanglement growth rate = Kolmogorov-Sinai rate has been proved for unstable quadratic bosonic systems ([JHEP 2018](https://link.springer.com/article/10.1007/JHEP03(2018)025)). This is NOT the same as a generic anharmonic system.
- Interscale entanglement in kicked-rotor models correlates with classical chaos ([arXiv:2201.09217](https://arxiv.org/html/2201.09217)). This is a different partition and model family than coordinate-factorized N-D anharmonic oscillators.

**What could be new** is the specific combination:

1. Continuous-space single-particle TDSE evolution (not a lattice model or kicked rotor)
2. Coordinate-partition entanglement diagnostics (not interscale or particle entanglement)
3. Systematic sweep over dimension N=2→11, especially into unusually high dimensions
4. Consistent comparison across integrable, weakly nonintegrable, and chaotic potentials
5. A scaling study of growth rates and saturation with N and coupling λ

The strongest defensible claim: **"We study coordinate-partition entanglement dynamics in continuous high-dimensional single-particle quantum systems and map how growth and saturation depend on coupling and dimension."**

This is a narrower and more honest novelty claim than "discovering a phase transition." The N-scaling atlas for continuous-space single-particle TDSE systems does not appear to be a standard settled result in the existing literature.

---

## Part 1: Physics

### 1.1 Setup

A single particle in N dimensions under the coupled anharmonic potential (already implemented as `potentialType = 'coupledAnharmonic'`, type 13):

```
V(x₁,...,x_N) = ½mω² Σ_d x_d² + λ Σ_{d<d'} x_d² x_{d'}²
```

- At λ=0: separable harmonic oscillator. Each dimension evolves independently. Zero inter-dimensional entanglement.
- At λ>0: dimensions couple. Energy flows between dimensions. The wavefunction becomes non-separable. Inter-dimensional entanglement grows.
- At large λ: classically chaotic. The classical counterpart has positive Lyapunov exponents.

### 1.2 Observable: Inter-Dimensional Entanglement Entropy

The wavefunction lives in L²(ℝ^N) = L²(ℝ) ⊗ ... ⊗ L²(ℝ). This tensor product structure defines a natural bipartition: dimension d vs all others.

**Reduced density matrix for dimension d:**

```
ρ_d(i, j) = Σ_{i₂,...,i_N} ψ(i₁,...,i_{d-1}, i, i_{d+1},...,i_N)
                           · ψ*(i₁,...,i_{d-1}, j, i_{d+1},...,i_N)
```

where the sum runs over all grid indices except dimension d. This is an M_d × M_d matrix (where M_d = gridSize[d]).

**Von Neumann entropy:**

```
S_d = -Tr(ρ_d log ρ_d) = -Σ_k λ_k log(λ_k)
```

where λ_k are the eigenvalues of ρ_d.

- S_d = 0: dimension d is separable from the rest (product state)
- S_d = log(M_d): dimension d is maximally entangled with the rest

**Average dimensional entanglement:**

```
S̄(t) = (1/N) Σ_d S_d(t)
```

### 1.3 Hypotheses to Test

| # | Hypothesis | Risk | What confirmation means | What refutation means |
|---|-----------|------|------------------------|----------------------|
| H1 | S̄(t)=0 for all t when λ=0 | Low (sanity check) | Separable Hamiltonians produce no coordinate entanglement | Implementation bug |
| H2 | S̄(t) grows approximately linearly at early times for chaotic λ | Medium | Suggests analog of many-body entanglement tsunami in single-particle systems | The many-body analogy breaks down for coordinate entanglement — still a finding |
| H3 | Linear growth rate dS̄/dt correlates with classical Lyapunov exponent | High | Would extend the KS-entanglement connection to single-particle coordinate entanglement. This is NOT implied by the JHEP 2018 result (which applies to unstable quadratic Hamiltonians, a different setting) | The relationship is specific to many-body / quadratic systems — also a finding |
| H4 | S̄_∞ (saturation value) increases with N | Medium | More dimensions = more entanglement capacity | Some dimensions dynamically decouple — interesting dynamical phenomenon |
| H5 | There exists a characteristic coupling scale λ*(N) marking a rapid crossover in S̄_∞ | Medium | A clear separation between low- and high-entanglement regimes | The transition is gradual at all N — the crossover map is still a valid result |
| H6 | λ*(N) decreases with N | Medium | More dimensions provide more coupling channels, lowering the entanglement threshold | λ* is dimension-independent or increases — challenges the "more channels" intuition |

**Important**: H5 describes a **crossover**, not a true phase transition. For a closed single-particle system with finitely many degrees of freedom, singular behavior (a true phase transition) is not expected. The question is whether the crossover is sharp enough to identify a characteristic scale λ*(N), not whether there is a critical point.

H3 is the highest-risk hypothesis. The cited literature proves the KS-entanglement connection only for specific model classes. Whether it extends to this setting is genuinely unknown.

### 1.4 The Coordinate Entanglement Atlas

The primary experimental output is a 2D heatmap:

```
Axes: λ (coupling strength, x-axis) × N (dimension count, y-axis)
Color: S̄_∞ (long-time average coordinate entanglement, normalized to [0,1])
```

For each (λ, N) point:
1. Initialize a separable Gaussian wavepacket in the N-D coupled anharmonic potential
2. Evolve T_evolve TDSE steps
3. Compute time-averaged S̄ over the last T_measure steps → S̄_∞(λ, N)

The atlas shows how entanglement saturation depends on coupling and dimension. If a rapid crossover exists, the map will show a boundary-like region. If the transition is gradual, the map shows smooth gradients. Both are valid results.

### 1.5 Extended Observables

Beyond single-coordinate entropies S_d, the following observables strengthen the study:

| Observable | Definition | Why it matters |
|-----------|-----------|----------------|
| S_d(t) per coordinate | -Tr(ρ_d log ρ_d) | Per-coordinate entanglement dynamics |
| S̄(t) average | (1/N) Σ_d S_d | Aggregate entanglement growth curve |
| S_{k|N-k}(t) bipartition entropy | Entropy of the k-dim vs (N-k)-dim partition | Richer than single-coordinate: captures collective entanglement |
| I(d₁,d₂) pairwise mutual information | S_{d₁} + S_{d₂} - S_{d₁,d₂} | Which coordinate pairs couple most strongly |
| Long-time average and variance | ⟨S̄⟩_T and Var(S̄)_T | Distinguishes saturation from oscillation |
| Resolution dependence | S̄_∞ at M vs M/2 per dimension | Confirms results are not grid artifacts |

The bipartition entropy S_{k|N-k} is especially important: for k=⌊N/2⌋, this gives the "half-system" entanglement that is the standard diagnostic in many-body physics. Computing it for k=1,2,...,⌊N/2⌋ reveals the entanglement structure across all bipartition scales.

---

## Part 2: Computation

### 2.1 Reduced Density Matrix Algorithm

**Input**: ψ as two Float32Arrays (psiRe, psiIm) of length totalSites = Π_d M_d

**For dimension d with grid size M_d**:

```typescript
function computeReducedDensityMatrix(
  psiRe: Float32Array, psiIm: Float32Array,
  gridSize: number[], targetDim: number
): { re: Float64Array, im: Float64Array, M: number } {
  const M = gridSize[targetDim]
  const rhoRe = new Float64Array(M * M)  // row-major
  const rhoIm = new Float64Array(M * M)

  // For each pair (i, j) in dimension d:
  //   ρ(i,j) = Σ_{other indices} ψ(...,i,...) · ψ*(...,j,...)
  // Implemented as: loop over all sites, decompose linear index to extract
  // the target dimension coordinate, accumulate outer product

  for (let idx = 0; idx < totalSites; idx++) {
    const i_d = extractAxisCoord(idx, gridSize, targetDim, N)
    const re_i = psiRe[idx], im_i = psiIm[idx]

    // Diagonal: ρ(i_d, i_d) += |ψ|²
    rhoRe[i_d * M + i_d] += re_i * re_i + im_i * im_i

    // Off-diagonal: need to find the partner site with same other-dim
    // coords but different target-dim coord j_d
    // ... (see detailed algorithm below)
  }
  return { re: rhoRe, im: rhoIm, M }
}
```

**Efficient implementation**: The naive approach (nested loop over all pairs) is O(M_d² · totalSites). A better approach groups sites by their "other dimensions" index:

```
otherIndex = linearIndex with dimension d removed
For each otherIndex:
  Extract the M_d values of ψ at that slice
  Accumulate the M_d × M_d outer product
```

This is O(totalSites · M_d) — one pass through ψ, accumulating an M_d × M_d outer product for each "fiber" along dimension d.

**Even more efficient**: Reorganize as a matrix multiplication. Reshape ψ as an (M_d × K) matrix where K = totalSites / M_d. Then ρ_d = ψ̃ · ψ̃†, which is a standard matrix-matrix multiply. This is O(M_d² · K) = O(M_d · totalSites), same asymptotic complexity but benefits from BLAS-like memory access patterns.

### 2.2 Eigendecomposition

The M_d × M_d Hermitian matrix ρ_d is eigendecomposed to obtain eigenvalues λ_k. Since ρ_d is positive-semidefinite Hermitian, a real symmetric eigendecomposition of size M_d suffices (the imaginary part of ρ_d can be handled by working with the 2M_d × 2M_d real embedding, or using a complex Hermitian eigensolver).

For M_d ≤ 64: Jacobi eigenvalue algorithm or QR iteration, O(M_d³). Trivial cost.

### 2.3 Von Neumann Entropy

```typescript
function vonNeumannEntropy(eigenvalues: Float64Array): number {
  let S = 0
  for (const λ of eigenvalues) {
    if (λ > 1e-15) S -= λ * Math.log(λ)
  }
  return S
}
```

### 2.4 Bipartition Entropy S_{k|N-k}

For a k-vs-(N-k) bipartition, the reduced density matrix for the k-dimensional subsystem has size M^k × M^k. This is feasible only for small k or small M:

| k | M | RDM size | Eigendecomp cost | Feasible? |
|---|---|----------|-----------------|-----------|
| 1 | 64 | 64×64 | 262K | Yes |
| 2 | 64 | 4096×4096 | 69B | No |
| 2 | 16 | 256×256 | 16.8M | Yes |
| 2 | 8 | 64×64 | 262K | Yes |
| 3 | 8 | 512×512 | 134M | Marginal |
| ⌊N/2⌋ | 4 | 4^(N/2) × 4^(N/2) | Varies | Yes for N ≤ 8 |

**Strategy**: Compute S_{k|N-k} for k=1 always. Compute k=2,...,⌊N/2⌋ only when M^k ≤ 1024 (RDM fits in ~8 MB and eigendecomp is < 1s).

### 2.5 Pairwise Mutual Information

For the N×N correlation heatmap:

```
I(d₁, d₂) = S_{d₁} + S_{d₂} - S_{d₁,d₂}
```

where S_{d₁,d₂} is the joint entropy from the 2-coordinate reduced density matrix (size M²×M²).

Compute pairwise MI only when M² ≤ 1024 (i.e., M ≤ 32). At M=64 (3D), the 4096×4096 eigendecomp is too expensive for real-time diagnostics. At M=8-16 (N≥5), it's cheap.

### 2.6 Resolution Dependence Check

To confirm results are not grid artifacts, the sweep should include at least one (λ, N) point computed at two different resolutions (e.g., M and M/2). If S̄_∞ changes by more than 20% when halving resolution, the result at that grid size is unreliable and should be flagged.

---

## Part 3: Performance

### 3.1 Cost Per Diagnostic Frame

The entanglement computation runs CPU-side on readback data, decimated (every K frames).

**Reduced density matrix for one dimension:**

| Grid | N | M_d | totalSites | Contraction cost | Eigen cost | Total |
|------|---|-----|------------|-----------------|------------|-------|
| 64³ | 3 | 64 | 262K | 262K × 64 = 16.8M | 64³ = 262K | ~17M FLOPs |
| 32⁴ | 4 | 32 | 1.05M | 1.05M × 32 = 33.6M | 32³ = 32.8K | ~34M FLOPs |
| 16⁵ | 5 | 16 | 1.05M | 1.05M × 16 = 16.8M | 16³ = 4.1K | ~17M FLOPs |
| 8⁷ | 7 | 8 | 2.1M | 2.1M × 8 = 16.8M | 8³ = 512 | ~17M FLOPs |
| 4¹¹ | 11 | 4 | 4.2M | 4.2M × 4 = 16.8M | 4³ = 64 | ~17M FLOPs |

**All N dimensions:** multiply by N.

| Grid | N | Total FLOPs | Estimated wall time (single core) |
|------|---|-------------|-----------------------------------|
| 64³ | 3 | 51M | ~15 ms |
| 32⁴ | 4 | 134M | ~40 ms |
| 16⁵ | 5 | 84M | ~25 ms |
| 8⁷ | 7 | 118M | ~35 ms |
| 4¹¹ | 11 | 185M | ~55 ms |

At decimation interval = 5 frames (DIAG_DECIMATION): **3–11 ms amortized per frame**. Acceptable.

### 3.2 Readback Cost

The measurement readback already copies psiRe + psiIm from GPU to CPU. For the entanglement computation, we reuse the same readback infrastructure (`requestMeasurementReadback` in `TDSEMeasurementReadback.ts`).

| Grid | Readback size | GPU→CPU copy time |
|------|---------------|-------------------|
| 64³ (3D) | 2 × 1 MB = 2 MB | ~0.5 ms |
| 32⁴ (4D) | 2 × 4 MB = 8 MB | ~2 ms |
| 16⁵ (5D) | 2 × 4 MB = 8 MB | ~2 ms |
| 8⁷ (7D) | 2 × 8 MB = 16 MB | ~4 ms |

Readback is async (non-blocking). The CPU computation runs after mapAsync resolves.

### 3.3 Memory Budget

| Component | Size | Notes |
|-----------|------|-------|
| Readback buffers (psiRe + psiIm) | 2 × totalSites × 4 bytes | Already allocated for measurement system |
| ρ_d matrix (largest: 64×64 complex) | 64 × 64 × 16 = 64 KB | Reused across dimensions |
| Eigenvalue buffer | 64 × 8 = 512 bytes | Trivial |
| Time series history (256 entries × N) | 256 × 11 × 8 = 22 KB | Ring buffer |
| Pairwise MI matrix (N×N) | 11 × 11 × 8 = 968 bytes | Trivial |
| **Total new memory** | **< 100 KB** | Negligible |

### 3.4 Phase Diagram Sweep Cost

| Parameter | Value |
|-----------|-------|
| λ values | 15 points (log-spaced from 0.01 to 100) |
| N values | 6 points (N = 2, 3, 4, 5, 7, 9) |
| Total (λ, N) points | 90 |
| Steps per point (evolve + measure) | 2000 |
| Time per step (incl. localization) | ~500 µs |
| Time per point | ~1 s |
| **Total sweep time** | **~90 seconds** |

Runs in background with progress bar.

### 3.5 Grid Size Per Dimension

The total lattice sites are bounded by GPU memory and compute budget. The grid sizes that keep totalSites near 1M (the practical limit for real-time 60 FPS TDSE):

| N (dims) | Grid per dim | Total sites | Notes |
|----------|-------------|-------------|-------|
| 2 | 512 | 262K | High resolution |
| 3 | 64 | 262K | Default |
| 4 | 32 | 1.05M | Existing preset |
| 5 | 16 | 1.05M | Existing preset |
| 6 | 10 | 1M | Nearest power-of-2: 8 → 262K |
| 7 | 8 | 2.1M | Feasible |
| 8 | 6 | 1.7M | Not power-of-2 (FFT requires P2) → 4 → 65K |
| 9 | 4 | 262K | Low resolution but functional |
| 10 | 4 | 1.05M | At the limit |
| 11 | 4 | 4.2M | Expensive but feasible |

**FFT constraint**: Grid sizes must be powers of 2 (the TDSE split-step FFT requires this — see `nearestPow2()` in `computePassUtils.ts`). This limits options:

| N | M (power of 2) | Total sites |
|---|----------------|-------------|
| 2 | 512 | 262K |
| 3 | 64 | 262K |
| 4 | 32 | 1.05M |
| 5 | 16 | 1.05M |
| 6 | 8 | 262K |
| 7 | 8 | 2.1M |
| 8 | 4 | 65K |
| 9 | 4 | 262K |
| 11 | 4 | 4.2M |

**Resolution concern**: At M=4 per dimension (N≥8), there are only 4 grid points per axis. The reduced density matrix is 4×4, which can have at most log(4) = 1.39 bits of entropy. This is coarse but still sufficient to distinguish separable (S=0) from entangled (S>0) states. The phase diagram at high N will have lower precision but should still show the qualitative trend.

For the phase diagram, recommend: N = {2, 3, 4, 5, 7} with M = {512, 64, 32, 16, 8}. This covers 5 dimensions with reasonable resolution. N=9 and N=11 can be included as low-resolution extensions.

---

## Part 4: Implementation

### 4.1 New Files

| File | Purpose |
|------|---------|
| `src/lib/physics/coordinateEntanglement.ts` | Core math: reduced density matrix, eigendecomposition, entropy |
| `src/lib/physics/coordinateEntanglement.worker.ts` | Web Worker for non-blocking CPU computation |
| `src/stores/coordinateEntanglementStore.ts` | Store for entanglement time series, pairwise MI, sweep results |
| `src/components/sections/Advanced/CoordinateEntanglementSection.tsx` | UI panel |

### 4.2 Core Algorithm: `coordinateEntanglement.ts`

```typescript
export interface CoordinateEntanglementResult {
  /** Per-dimension entanglement entropy S_d (d vs rest) */
  entropies: number[]
  /** Average entropy S̄ = (1/N) Σ S_d */
  averageEntropy: number
  /** Maximum possible entropy log(M_d) for each dimension */
  maxEntropies: number[]
  /** Normalized average S̄ / max(S̄) ∈ [0, 1] */
  normalizedEntropy: number
  /** Bipartition entropies S_{k|N-k} for k=1,...,⌊N/2⌋ (null entries if too expensive) */
  bipartitionEntropies: (number | null)[]
  /** Pairwise mutual information I(d₁,d₂) — upper triangle of N×N matrix, or null if skipped */
  mutualInfo: Float64Array | null
  /** Eigenvalue spectrum of ρ₁ for the first dimension (for diagnostics) */
  spectrum: number[]
}

export function computeCoordinateEntanglement(
  psiRe: Float32Array, psiIm: Float32Array,
  gridSize: number[], latticeDim: number,
  options: { computePairwiseMI: boolean, computeBipartitions: boolean }
): CoordinateEntanglementResult
```

The function:
1. For each dimension d = 0..N-1:
   a. Compute ρ_d via tensor contraction (single pass through ψ)
   b. Eigendecompose ρ_d (Jacobi method, 64×64 max)
   c. Compute S_d from eigenvalues
2. If computePairwiseMI and M_d₁·M_d₂ ≤ 1024:
   a. Compute 2D reduced density matrices for all pairs
   b. Compute joint entropy S_{d₁,d₂}
   c. I(d₁,d₂) = S_{d₁} + S_{d₂} - S_{d₁,d₂}
3. Return all results

### 4.3 Integration with TDSE Pipeline

The entanglement computation hooks into the existing diagnostics decimation cycle:

```
TDSEComputePassEvolution.ts (existing):
  → Frame N: run Strang evolution
  → Every DIAG_DECIMATION frames: run diagnostics readback

NEW: After diagnostics readback resolves:
  → If entanglement tracking enabled:
    → Ship (psiRe, psiIm) to Web Worker
    → Worker computes DimEntanglementResult
    → Worker posts result back
    → Store updates time series + pairwise MI
```

This runs entirely in a Web Worker to avoid blocking the render loop. The readback data is already available from the measurement system.

### 4.4 Store: `coordinateEntanglementStore.ts`

```typescript
interface CoordinateEntanglementState {
  enabled: boolean
  computePairwiseMI: boolean
  computeBipartitions: boolean

  // Time series (ring buffer)
  historyEntropies: Float64Array[]  // N arrays of length HISTORY_LEN
  historyAverage: Float64Array       // length HISTORY_LEN
  historyHead: number
  historyCount: number

  // Latest snapshot
  currentEntropies: number[]
  currentAverageEntropy: number
  currentNormalizedEntropy: number
  currentSpectrum: number[]
  currentBipartitionEntropies: (number | null)[]

  // Pairwise MI matrix (N×N, upper triangle)
  mutualInfoMatrix: Float64Array | null

  // Long-time statistics
  longTimeAverage: number   // ⟨S̄⟩_T
  longTimeVariance: number  // Var(S̄)_T

  // Atlas sweep results
  sweepResults: { lambda: number, dim: number, entropy: number }[]
  sweepInProgress: boolean
  sweepProgress: number // 0–1

  // Actions
  setEnabled: (v: boolean) => void
  setComputePairwiseMI: (v: boolean) => void
  setComputeBipartitions: (v: boolean) => void
  pushResult: (result: CoordinateEntanglementResult) => void
  clearHistory: () => void
  startSweep: () => void
  addSweepPoint: (lambda: number, dim: number, entropy: number) => void
  completeSweep: () => void
}
```

### 4.5 UI: `CoordinateEntanglementSection.tsx`

Located in the right panel analysis tab, below existing diagnostics.

| Component | Content |
|-----------|---------|
| Header | "Coordinate Entanglement" with enable toggle |
| Entropy sparkline | S̄(t) time series — main visual, shows growth/saturation |
| Per-dimension bars | N horizontal bars showing S_d / log(M_d) for each dimension |
| Bipartition curve | S_{k\|N-k} vs k for k=1,...,⌊N/2⌋ (when computable) |
| Correlation heatmap | N×N heatmap of I(d₁,d₂), updates every diagnostic frame |
| Spectrum view | Eigenvalue spectrum of ρ₁ (bar chart, log scale) |
| Atlas (sweep mode) | 2D heatmap of S̄_∞(λ, N) with sweep controls |

**Controls:**

| Control | Type | Range | Default |
|---------|------|-------|---------|
| Enable | Switch | on/off | off |
| Compute pairwise MI | Switch | on/off | off (saves CPU) |
| Sweep mode | Switch | on/off | off |
| λ range (min) | NumberInput | 0.001–100 | 0.01 |
| λ range (max) | NumberInput | 0.001–100 | 50 |
| λ sweep points | NumberInput | 5–30 | 15 |
| Sweep dimensions | MultiToggleGroup | {2,3,4,5,7,9} | {3,4,5} |

### 4.6 Presets

| Preset | Potential | λ | N | Description |
|--------|-----------|---|---|-------------|
| Separable Baseline | coupledAnharmonic | 0 | 3 | Zero entanglement (sanity check) |
| Weak Coupling | coupledAnharmonic | 0.1 | 3 | Perturbative entanglement growth |
| Strong Chaos | coupledAnharmonic | 10.0 | 3 | Rapid entanglement saturation |
| 5D Chaos | coupledAnharmonic | 5.0 | 5 | Higher-dimensional entanglement |
| Dimensional Sweep | coupledAnharmonic | 1.0 | 3 | Starting point for λ×N phase diagram |

---

## Part 5: Test Plan

### 5.1 Unit Tests — Reduced Density Matrix

**File**: `src/tests/lib/physics/dimensionalEntanglement.test.ts`

```
describe('computeReducedDensityMatrix')

  test('product state → diagonal ρ with expected eigenvalues')
    → ψ(x₁,x₂) = φ₁(x₁)·φ₂(x₂) on 8×8 grid.
      φ₁ = [1/√2, 1/√2, 0, 0, 0, 0, 0, 0], φ₂ = [1, 0, ..., 0].
      ρ₁ should be diag(0.5, 0.5, 0, ..., 0).
      Eigenvalues = {0.5, 0.5, 0, 0, 0, 0, 0, 0}.
      S₁ = log(2). Exact to 1e-10.

  test('maximally entangled state → uniform eigenvalues')
    → ψ(i,j) = δ_{ij} / √M on M×M grid (2D "Bell state" analog).
      ρ₁(i,j) = Σ_k ψ(i,k)ψ*(j,k) = δ_{ij}/M.
      S₁ = log(M). Exact.

  test('ρ_d is Hermitian')
    → Random ψ on 16×16 grid. ρ₁(i,j) = ρ₁(j,i)* to 1e-12.

  test('ρ_d has unit trace')
    → Random ψ (normalized). Tr(ρ₁) = 1.0 to 1e-10.

  test('ρ_d is positive semi-definite')
    → Random ψ. All eigenvalues of ρ₁ ≥ -1e-10.

  test('S_d = 0 for product state in all dimensions')
    → ψ = product of 1D Gaussians on 8×8×8 grid (3D).
      S₁ = S₂ = S₃ = 0 to 1e-10.

  test('S_d = 0 for harmonic oscillator eigenstate')
    → ψ = n-th Hermite-Gauss in each dimension (product state by construction).
      S_d = 0 for all d. This verifies that the HO eigenstates produce
      the expected separability baseline.
```

### 5.2 Unit Tests — Entropy Computation

**File**: `src/tests/lib/physics/dimensionalEntanglement.test.ts` (continued)

```
describe('vonNeumannEntropy')

  test('S = 0 for pure state (single eigenvalue = 1)')
    → eigenvalues = [1, 0, 0, 0]. S = 0.

  test('S = log(M) for uniform distribution')
    → eigenvalues = [1/M, 1/M, ..., 1/M]. S = log(M). Exact.

  test('S = log(2) for two equal eigenvalues')
    → eigenvalues = [0.5, 0.5, 0, 0]. S = log(2). Exact.

  test('S is additive for product states')
    → Two-dimensional product state. S_{1,2} = S_1 + S_2.
      (Joint entropy equals sum for independent subsystems.)

  test('mutual information ≥ 0 for all states')
    → Property test (fast-check): random ψ on 8×8 grid.
      I(1,2) = S_1 + S_2 - S_{1,2} ≥ -1e-10. Runs 200 samples.

  test('mutual information = 0 for product states')
    → ψ = product. I(1,2) = 0 to 1e-10.
```

### 5.3 Unit Tests — Entanglement Dynamics (CPU Reference)

**File**: `src/tests/lib/physics/dimensionalEntanglement.test.ts` (continued)

These tests use a small-grid CPU-side TDSE evolution to verify that entanglement behaves as expected, independent of the GPU pipeline.

```
describe('entanglement dynamics (CPU reference)')

  test('separable Hamiltonian (λ=0) preserves S=0 over 100 steps')
    → 2D grid (16×16), harmonic potential, λ=0.
      Evolve 100 steps with split-step CPU FFT.
      S₁(t) = 0 ± 1e-8 at every step.

  test('coupled Hamiltonian (λ>0) produces S>0 after evolution')
    → 2D grid (16×16), coupled anharmonic, λ=5.0.
      Evolve 200 steps. S₁(200) > 0.01.
      This confirms the coupling generates entanglement.

  test('entanglement growth rate increases with λ')
    → 2D grid (16×16). λ=1 vs λ=10, same initial state, 100 steps.
      dS₁/dt(λ=10) > dS₁/dt(λ=1).
      Stronger coupling → faster entanglement production.

  test('entanglement saturates below log(M)')
    → 2D grid (16×16), λ=10, 1000 steps.
      S₁(t) should plateau. S₁(1000) ≤ log(16) = 2.77.
      S₁(1000) should be within 20% of S₁(800) (saturation).
```

### 5.4 Property-Based Tests

**File**: `src/tests/lib/physics/dimensionalEntanglement.property.test.ts`

```
describe('dimensional entanglement invariants (property-based)')

  test('Tr(ρ_d) = 1 for arbitrary normalized ψ')
    → fast-check: random normalized ψ on 8^N grid, N ∈ {2,3,4}.
      Tr(ρ_d) = 1.0 ± 1e-8 for all d. 200 samples.

  test('S_d ∈ [0, log(M_d)] for arbitrary ψ')
    → fast-check: random ψ. S_d ≥ -1e-10 and S_d ≤ log(M_d) + 1e-10.
      200 samples.

  test('S_d is invariant under global phase rotation')
    → fast-check: ψ and e^{iθ}ψ produce identical S_d. 200 samples.

  test('I(d₁,d₂) ≥ 0 for arbitrary ψ')
    → fast-check: random ψ on 8×8 grid.
      I(1,2) = S_1 + S_2 - S_{1,2} ≥ -1e-8. 200 samples.
```

### 5.5 E2E Tests — GPU Pipeline

**File**: `scripts/playwright/dimensional-entanglement.spec.ts`

Pattern: follows `anderson-localization.spec.ts` (store-driven diagnostics, parameter sweep, numerical assertions).

```
describe('Dimensional Entanglement GPU Pipeline')

  beforeEach:
    → Navigate to tdseDynamics 3D, coupledAnharmonic potential,
      diagnostics enabled, entanglement tracking enabled

  test('separable potential (λ=0) produces S̄ ≈ 0')
    → Set anharmonicLambda = 0, evolve 200 frames.
    → Read entanglement store: currentAverageEntropy < 0.01.
    → Chain of trust: WGSL potential shader (λ=0 → V separable) →
      GPU TDSE evolution → readback → CPU entanglement computation.

  test('coupled potential (λ=5) produces S̄ > 0 after evolution')
    → Set anharmonicLambda = 5, evolve 300 frames.
    → Read entanglement store: currentAverageEntropy > 0.1.

  test('entanglement increases with coupling strength')
    → λ=0.5, 300 frames → record S̄₁.
    → Reset, λ=10, 300 frames → record S̄₂.
    → S̄₂ > S̄₁.

  test('entanglement time series has correct length')
    → Evolve 100 frames with DIAG_DECIMATION=5.
    → historyCount ≈ 20 (100/5).

  test('per-dimension entropies are all non-negative')
    → Evolve 200 frames.
    → All currentEntropies[d] ≥ 0.

  test('per-dimension entropies sum consistently with average')
    → Read currentEntropies and currentAverageEntropy.
    → |mean(currentEntropies) - currentAverageEntropy| < 1e-6.

  test('pairwise mutual information matrix is symmetric')
    → Enable pairwise MI, evolve 200 frames.
    → For all (d₁,d₂): |I(d₁,d₂) - I(d₂,d₁)| < 1e-6.

  test('4D coupled anharmonic produces higher-dimensional entanglement')
    → Navigate to 4D (32⁴ grid), λ=5, evolve 300 frames.
    → currentEntropies has length 4.
    → currentAverageEntropy > 0.05.

  test('entanglement sparkline data is finite and bounded')
    → Evolve 500 frames.
    → All history values are finite (no NaN/Inf).
    → All values in [0, log(M)].
```

### 5.6 E2E Tests — Phase Diagram Sweep

**File**: `scripts/playwright/dimensional-entanglement.spec.ts` (continued)

```
describe('Dimensional Entanglement Sweep')

  test('3-point λ sweep produces monotonically increasing S̄_∞')
    → Sweep λ = [0.1, 1.0, 10.0] at N=3, 300 frames each.
    → S̄_∞(0.1) < S̄_∞(1.0) < S̄_∞(10.0).

  test('sweep across 2 dimensions produces valid results')
    → Sweep λ=5 at N=3 (64³) and N=4 (32⁴).
    → Both produce S̄_∞ > 0.
    → Both produce finite, bounded values.

  test('λ=0 sweep point produces S̄_∞ ≈ 0 regardless of dimension')
    → Sweep λ=0 at N=3 and N=5.
    → Both S̄_∞ < 0.01.
```

### 5.7 Test File Placement Summary

| Test File | Type | What it validates |
|-----------|------|-------------------|
| `src/tests/lib/physics/dimensionalEntanglement.test.ts` | Unit | RDM correctness, entropy formulas, dynamics reference |
| `src/tests/lib/physics/dimensionalEntanglement.property.test.ts` | Property | Trace=1, entropy bounds, phase invariance, MI ≥ 0 |
| `scripts/playwright/dimensional-entanglement.spec.ts` | E2E | GPU pipeline, λ sweep, dimensional scaling |

### 5.8 Chain of Trust

```
Analytical formula (log(M) for uniform, 0 for product)
  → CPU unit test (exact values, 1e-10 tolerance)
    → CPU dynamics test (16×16 grid, 100-step evolution)
      → GPU pipeline e2e (WGSL evolution → readback → CPU entropy → store → assertion)
```

If unit tests pass but e2e fails: the GPU readback or WGSL evolution has a bug.
If unit tests fail: the CPU entanglement math is wrong.

---

## Part 6: Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| f32 precision in ψ readback corrupts ρ_d eigenvalues | Spurious small eigenvalues, inflated entropy | Medium | Use Float64Array for ρ_d accumulation. Threshold eigenvalues < 1e-7 to zero. |
| Grid resolution too coarse at high N (M=4) | Cannot distinguish separable from weakly entangled | Medium | Report entropy in bits (log₂) and note resolution limits. S_max = log₂(4) = 2 bits — still 4× separation between S=0 and S_max. Include resolution dependence checks in the atlas. |
| Web Worker overhead delays results | Entanglement panel lags behind live evolution | Low | Worker runs async, UI shows "computing..." indicator. Decimation ensures at most 1 computation per 5 frames. |
| Hypotheses are wrong (no linear growth, no clear crossover scale) | Atlas shows smooth gradients without sharp features | Medium-high | The feature is designed as an exploratory atlas, not a demonstration of predicted behavior. Smooth results are still a valid numerical study. The visualization is valuable regardless. |
| Lyapunov-entanglement connection doesn't hold | H3 is refuted — growth rate doesn't correlate with Lyapunov exponent | Medium | This is explicitly flagged as a high-risk hypothesis. Refutation is a publishable result (negative results matter). The feature does not depend on H3 being true. |
| Readback contention with measurement system | Both systems need psiRe/psiIm readback simultaneously | Low | Share readback: if measurement readback is in flight, entanglement computation uses the same data. Guard with in-flight flag. |
| Eigendecomposition numerical instability for near-degenerate ρ_d | NaN in entropy | Low | Use robust Jacobi iteration with convergence check. Fall back to SVD if Jacobi fails. |
| Results are grid artifacts at low resolution | S̄_∞ changes >20% when halving M | Medium | Include resolution dependence checks. Flag unreliable points in the atlas. Require at least one cross-resolution validation per dimension. |

---

## Part 7: Implementation Phases

### Phase 1: Core Math + Store

1. Implement `computeReducedDensityMatrix()` and `vonNeumannEntropy()` in `coordinateEntanglement.ts`
2. Implement k-dimensional bipartition RDM computation (for S_{k|N-k})
3. Implement Jacobi eigendecomposition for Hermitian matrices (or adapt existing `hermitianEigendecompose` from `openQuantum/integrator.ts`)
4. Create `coordinateEntanglementStore.ts` with time series ring buffer + long-time statistics
5. Unit tests for RDM, entropy, product states, Bell states, bipartitions
6. Property-based tests for invariants

### Phase 2: GPU Integration

1. Hook entanglement computation into TDSE diagnostics readback cycle
2. Create Web Worker wrapper for non-blocking computation
3. Wire worker results → store
4. E2E test: λ=0 → S≈0, λ>0 → S>0

### Phase 3: Visualization

1. Create `CoordinateEntanglementSection.tsx`
2. Entropy sparkline (reuse existing Sparkline component)
3. Per-dimension entropy bars
4. Bipartition entropy curve S_{k|N-k} vs k
5. Pairwise MI heatmap (new component or adapt existing pattern)
6. Eigenvalue spectrum bar chart

### Phase 4: Atlas Sweep

1. Implement sweep orchestrator (λ × N grid, sequential execution)
2. Atlas heatmap visualization
3. Resolution dependence validation (automatic M vs M/2 check)
4. Presets for integrable baseline, weak/strong chaos, sweep start
5. E2E test: λ sweep monotonicity

### Phase 5: Polish

1. URL serialization for entanglement-related params
2. Export entanglement time series + atlas data as CSV
3. Auto-detect optimal grid sizes per dimension
4. Tooltip documentation

---

## Part 8: Success Criteria

### Core Math
- [ ] Product state produces S=0 (exact to 1e-10) in unit tests
- [ ] Maximally entangled state produces S=log(M) (exact to 1e-10) in unit tests
- [ ] Tr(ρ_d)=1 and ρ_d ≥ 0 for all tested wavefunctions
- [ ] Property-based tests pass 200+ samples without violation

### GPU Pipeline
- [ ] λ=0 produces S̄ < 0.01 in e2e test (separability verified through full GPU pipeline)
- [ ] λ>0 produces S̄ > 0.1 after 300 frames (coupling generates entanglement)
- [ ] Higher λ produces higher S̄ (monotonicity in coupling strength)
- [ ] 4D and 5D grids produce valid entanglement results
- [ ] No NaN/Inf in any diagnostic value after 1000 frames

### Experimental Results
- [ ] Atlas sweep completes in < 2 minutes for 15×5 = 75 points
- [ ] Atlas shows qualitative difference between low-λ (blue) and high-λ (red) regions
- [ ] The atlas renders whatever λ-N relationship the physics produces, without imposing expectations
- [ ] Resolution dependence check: S̄_∞ at M vs M/2 differs by < 20% for at least 3 validated (λ,N) points
- [ ] Bipartition entropies S_{k|N-k} computed for k=1,...,⌊N/2⌋ at N=5 with M=16

### Test Coverage
- [ ] All unit tests pass (RDM, entropy, dynamics reference)
- [ ] All property-based tests pass (200+ samples)
- [ ] All e2e tests pass (GPU pipeline, sweep monotonicity)
