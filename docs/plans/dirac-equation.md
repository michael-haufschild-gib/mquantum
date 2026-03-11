# Plan: Dirac Equation (Relativistic Quantum Mechanics)

## Overview

Add a new quantum mode `'diracEquation'` that simulates the relativistic Dirac equation on a lattice. Unlike the scalar Schrödinger equation, the Dirac equation operates on multi-component spinors — 2^(⌊N/2⌋) components in N spatial dimensions. This mode visualizes antimatter, Zitterbewegung, the Klein paradox, and spin dynamics from first principles.

The Dirac equation **cannot** reuse the existing TDSE split-step FFT solver. The TDSE solver splits a scalar Hamiltonian H = T + V into kinetic and potential phases. The Dirac Hamiltonian H = cα·p + βmc² + V is a matrix operator — the kinetic term α·p couples spinor components, so a scalar phase kick doesn't work. A new compute pass is required.

## Physics

### The Dirac Equation

```
iℏ ∂ψ/∂t = (cα·p + βmc² + V)ψ
```

where:
- `ψ` is a multi-component spinor (not a scalar)
- `α_j` are N Hermitian matrices (one per spatial dimension), satisfying `{α_i, α_j} = 2δ_{ij}`
- `β` is a Hermitian matrix satisfying `β² = I` and `{α_j, β} = 0`
- `c` is the speed of light
- `m` is the particle rest mass
- `p = -iℏ∇` is the momentum operator

### Spinor Dimensionality by Spatial Dimension

The Dirac algebra in N spatial dimensions requires spinors of size S = 2^(⌊N/2⌋):

| Spatial Dim N | Spinor Components S | Gamma Matrices | Physical Interpretation |
|---------------|--------------------:|----------------|------------------------|
| 1 | 2 | 2×2 (Pauli-like) | Particle + antiparticle |
| 2 | 2 | 2×2 (graphene Dirac) | Sublattice pseudospin |
| 3 | 4 | 4×4 (standard Dirac) | Spin-up/down × particle/antiparticle |
| 4 | 4 | 4×4 (Kaluza-Klein) | Same as 3D + extra momentum |
| 5 | 4 | 4×4 | — |
| 6 | 8 | 8×8 | — |
| 7 | 8 | 8×8 | — |
| 8 | 16 | 16×16 | — |
| 9 | 16 | 16×16 | — |
| 10 | 32 | 32×32 (string theory) | — |
| 11 | 32 | 32×32 (M-theory) | — |

### Natural Units

Work in natural units where ℏ = c = 1 by default. The user can adjust `c` (effective speed of light) and `m` (rest mass) for pedagogical purposes — e.g., slow c to make relativistic effects visible at low energies.

### Solver: Split-Operator with Matrix Exponentials

The Dirac Hamiltonian in momentum space decomposes cleanly:

```
H(k) = cα·ℏk + βmc² + V(x)
```

**Split-step algorithm** (Strang splitting):

1. **Half-step potential** (position space): `ψ(x) → exp(-iV(x)dt/2ℏ) · ψ(x)`
   - V is diagonal in spinor space (scalar potential) → component-wise phase rotation
   - For vector potentials (EM coupling): V → V·I + eA₀ (scalar) is still diagonal
2. **FFT** each spinor component independently (S separate FFTs)
3. **Full-step free Dirac** (momentum space): `ψ̃(k) → exp(-iH_free(k)dt/ℏ) · ψ̃(k)`
   - H_free(k) = cα·ℏk + βmc² is a S×S matrix at each k-point
   - Diagonalize analytically: eigenvalues ±E(k) = ±√((cℏk)² + (mc²)²)
   - The matrix exponential is computed analytically (not numerically) — see §Shader Math
4. **Inverse FFT** each component
5. **Half-step potential** (position space)

This is analogous to the TDSE split-step but with matrix-valued operators instead of scalar phases.

### Matrix Exponential: Analytic Forms

**1D and 2D (S=2)**: H_free is a 2×2 matrix. The exponential has a closed-form:

```
exp(-iHt) = cos(Et)·I - i·sin(Et)·H/E
```

where E = √((cℏk)² + (mc²)²). This is 4 trig calls + arithmetic per k-point.

**3D-5D (S=4)**: H_free is a 4×4 matrix with eigenvalues ±E(k), each doubly degenerate. The exponential uses the Cayley-Hamilton theorem:

```
exp(-iHt) = cos(Et)·I - i·sin(Et)·(H/E)
```

This still holds because H² = E²·I for the free Dirac Hamiltonian. Same formula, just larger matrices.

**6D-7D (S=8)**: H_free is 8×8 but H² = E²·I still holds (the Clifford algebra guarantees this). Same formula.

**8D+ (S=16, 32)**: Same identity. The free Dirac propagator always satisfies H² = E²·I regardless of dimension, so the 2-term Cayley-Hamilton formula works universally.

**Key insight**: We never need a general matrix exponential. The Clifford algebra structure guarantees `H_free² = E²·I` in all dimensions, giving us the same `cos/sin` formula for all spinor sizes.

### Observable Quantities

| Observable | Formula | Visualization |
|-----------|---------|---------------|
| Total probability density | ρ = ψ†ψ = Σᵢ\|ψᵢ\|² | Standard density rendering |
| Particle density | ρ₊ = Σᵢ∈upper\|ψᵢ\|² | Upper spinor components |
| Antiparticle density | ρ₋ = Σᵢ∈lower\|ψᵢ\|² | Lower spinor components |
| Probability current | jᵏ = cψ†αᵏψ | Vector field overlay |
| Spin density | sᵏ = ψ†Σᵏψ (Σ = spin matrix) | Vector field overlay |
| Zitterbewegung | Time-domain oscillation of ⟨x⟩ at frequency 2mc²/ℏ | Position tracking in HUD |
| Helicity | h = σ·p̂ (spin projected onto momentum) | Scalar field |

### Key Physical Phenomena

1. **Klein Paradox**: Wavepacket hitting a potential step V₀ > 2mc². The transmission coefficient *exceeds* 1 — pair creation at the barrier. Render particle component (upper spinor) and antiparticle component (lower spinor) in different colors.

2. **Zitterbewegung**: Rapid trembling motion at frequency 2mc²/ℏ. A localized wavepacket oscillates between positive and negative energy components. Visible when `c` is low enough that 2mc²dt is resolvable.

3. **Spin Precession**: In a magnetic field (vector potential), the spin vector rotates. Visualize with a spin density vector field.

4. **Pair Creation/Annihilation**: Strong potential barriers create particle-antiparticle pairs. The antiparticle component appears as the wavepacket enters the barrier.

5. **Dispersion Relation**: E = ±√(p²c² + m²c⁴) — hyperbolic, not parabolic. At low momenta, reduces to E ≈ mc² + p²/2m (Schrödinger). At high momenta, E ≈ pc (massless/photon-like).

---

## Architecture Decision: New Compute Pass

The Dirac equation requires a **new** `DiracComputePass`, not an extension of `TDSEComputePass`, because:

1. **Multiple field buffers**: S component buffers instead of 1 (psiRe + psiIm → S pairs of Re/Im buffers)
2. **Coupled FFTs**: S independent FFTs per step (reuses FFT infrastructure but dispatched S times)
3. **Matrix kinetic propagator**: The k-space step applies a S×S matrix, not a scalar phase
4. **Different uniform struct**: Needs gamma matrix data, spinor size, mass, c, not TDSE-specific fields
5. **Different density computation**: ρ = Σᵢ|ψᵢ|² (sum over components) and particle/antiparticle split

However, the pass **reuses**:
- The Stockham FFT shader and dispatch logic (unchanged — operates on complex buffers)
- The density grid write shader pattern (modified to sum S components)
- The absorber shader pattern (applied per-component)
- The diagnostic reduction pattern (sum over all components)
- The `WebGPUBasePass` infrastructure

---

## Scope: Dimensions, Representations, and Render Modes

### Supported Dimensions: 1D-11D

The Dirac equation is well-defined in any spatial dimension. This mode supports dimensions 1 through 11:

| Dimension | Spinor Size | Grid Default | Memory (spinor only) | Primary Use |
|-----------|------------|-------------|---------------------|-------------|
| 1D | 2 | 512 | 4 KB | Klein paradox, ZBW, solitons |
| 2D | 2 | 256² | 256 KB | Graphene Dirac cones, Klein tunneling |
| 3D | 4 | 64³ | 8 MB | Standard QED, hydrogen fine structure |
| 4D | 4 | 32⁴ | 8 MB | Kaluza-Klein compactification |
| 5D | 4 | 16⁵ | 4 MB | — |
| 6D | 8 | 12⁶ | 24 MB | Extended supersymmetry |
| 7D | 8 | 10⁷ | 160 MB | ⚠ Large — reduce grid |
| 8D | 16 | 8⁸ | 512 MB | ⚠ Use 6⁸ or lower |
| 9D | 16 | 6⁹ | 320 MB | ⚠ Memory-limited |
| 10D | 32 | 6¹⁰ | ~3.8 GB | ⚠ Needs GPU with ≥6 GB |
| 11D | 32 | 4¹¹ | ~1 GB | ⚠ M-theory dimension, minimal grid |

For dimensions ≥ 7, the UI should warn about memory and suggest smaller grid sizes. The `maxStableDt` CFL condition (dt < Δx / (c·√N)) becomes more restrictive at high dimensions, which naturally limits step count.

**1D special case**: In 1D, the density grid is still written as a 3D texture (extending the 1D data along the other two axes). This matches the existing TDSE 1D→3D promotion logic in `tdseWriteGrid.wgsl.ts`. The raymarcher renders a "tube" visualization.

### Representations: Position Only (Phase 1)

**Phase 1 (this plan)**: Dirac mode supports **position representation only**. The representation selector is hidden. Rationale:

- **Momentum representation** is physically meaningful (Dirac spinor in k-space), but the solver *already works in k-space* during the kinetic step. Displaying the k-space spinor requires either:
  - Keeping the FFT'd data after the kinetic step (extra S buffers, or read-before-overwrite)
  - A separate FFT pass just for display (S extra FFTs per frame)
  Both are feasible but add complexity. The density grid would store |ψ̃(k)|² instead of |ψ(x)|².

- **Wigner function** for a spinor field is a 2S×2S matrix-valued phase-space distribution (the "Wigner matrix"), not a scalar. Visualizing it meaningfully requires choosing a scalar reduction (e.g., trace, diagonal elements). This is a research-level question.

**Future extension** (not in this plan): Add momentum representation by:
1. After the kinetic step (step 3 in Strang splitting), before inverse FFT, dispatch the `diracWriteGrid` shader reading from the k-space spinor data
2. Toggle via a `diracRepresentation: 'position' | 'momentum'` field in `DiracConfig`
3. The density grid channel layout stays the same (R=density, B=phase), just in k-space

### Isosurface Mode: Fully Supported

Isosurface rendering is **fully supported** out of the box. The isosurface threshold (`isoEnabled` / `isoThreshold` in `SchroedingerConfig`) operates on the density grid texture, which DiracComputePass populates identically to TDSEComputePass. The raymarching fragment shader:

1. Samples the density grid at each step
2. If `isoEnabled`, computes the threshold crossing and normal
3. Applies PBR lighting, SSS, emission based on the isosurface point

No Dirac-specific changes are needed. The `isoThreshold` slider in the RenderMode section works as-is.

For the `particleAntiparticleSplit` field view, the isosurface threshold can be applied to either channel:
- Total density (R + G) for the combined isosurface
- Particle only (R) or antiparticle only (G) — controlled by `fieldView`

The `diracWriteGrid` shader writes the appropriate quantity to channel R based on `fieldView`, so the isosurface always reads channel R.

---

## Implementation Steps

### Phase 1: Type System & Config

#### Step 1.1: Add `'diracEquation'` to `SchroedingerQuantumMode`

**File**: `src/lib/geometry/extended/types.ts`

```typescript
export type SchroedingerQuantumMode =
  | 'harmonicOscillator'
  | 'hydrogenND'
  | 'freeScalarField'
  | 'tdseDynamics'
  | 'becDynamics'
  | 'diracEquation'
```

#### Step 1.2: Add Dirac-specific types

**File**: `src/lib/geometry/extended/types.ts`

```typescript
/**
 * Dirac equation initial condition.
 * - gaussianPacket: Localized Gaussian spinor wavepacket (positive-energy projection)
 * - planeWave: Plane wave with definite momentum and spin
 * - standingWave: Superposition of +k and -k plane waves
 * - zitterbewegung: Superposition of positive and negative energy states to exhibit trembling
 */
export type DiracInitialCondition =
  | 'gaussianPacket'
  | 'planeWave'
  | 'standingWave'
  | 'zitterbewegung'

/**
 * What quantity to render from the Dirac spinor.
 * - totalDensity: ψ†ψ (all components)
 * - particleDensity: upper spinor components only
 * - antiparticleDensity: lower spinor components only
 * - particleAntiparticleSplit: particle in color A, antiparticle in color B (dual-channel)
 * - spinDensity: magnitude of spin vector |s| = |ψ†Σψ|
 * - currentDensity: magnitude of probability current |j| = |cψ†αψ|
 * - phase: phase of dominant spinor component
 */
export type DiracFieldView =
  | 'totalDensity'
  | 'particleDensity'
  | 'antiparticleDensity'
  | 'particleAntiparticleSplit'
  | 'spinDensity'
  | 'currentDensity'
  | 'phase'

/**
 * Potential type for the Dirac equation.
 * - none: Free particle (V=0)
 * - step: Step potential (Klein paradox)
 * - barrier: Rectangular barrier
 * - well: Finite square well (bound states)
 * - harmonicTrap: Harmonic oscillator potential (Dirac oscillator)
 * - coulomb: Coulomb 1/r potential (relativistic hydrogen-like)
 */
export type DiracPotentialType =
  | 'none'
  | 'step'
  | 'barrier'
  | 'well'
  | 'harmonicTrap'
  | 'coulomb'

/**
 * Configuration for the Dirac equation solver.
 */
export interface DiracConfig {
  // === Lattice ===
  /** Spatial dimensionality (1-11, synced from global dimension).
   *  S = 2^(⌊N/2⌋) spinor components are allocated. */
  latticeDim: number
  /** Grid points per dimension (power of 2, FFT requirement) */
  gridSize: number[]
  /** Grid spacing per dimension */
  spacing: number[]

  // === Physics ===
  /** Particle rest mass (natural units, default 1.0) */
  mass: number
  /** Speed of light (natural units, default 1.0; reduce for pedagogical slow-light) */
  speedOfLight: number
  /** Reduced Planck constant (natural units, default 1.0) */
  hbar: number
  /** Time step */
  dt: number
  /** Sub-steps per frame */
  stepsPerFrame: number

  // === Potential ===
  potentialType: DiracPotentialType
  /** Potential height/depth V₀ (energy units) */
  potentialStrength: number
  /** Potential width (spatial units, for barrier/well) */
  potentialWidth: number
  /** Potential center position along axis 0 */
  potentialCenter: number
  /** Harmonic trap frequency (for harmonicTrap type) */
  harmonicOmega: number
  /** Coulomb charge Z (for coulomb type) */
  coulombZ: number

  // === Initial Condition ===
  initialCondition: DiracInitialCondition
  /** Wavepacket center position — length equals latticeDim */
  packetCenter: number[]
  /** Gaussian width (sigma) */
  packetWidth: number
  /** Initial momentum vector k₀ — length equals latticeDim */
  packetMomentum: number[]
  /** Initial spin direction (for spin-polarized packets).
   *  For S=2: single angle θ. For S=4: (θ, φ) on Bloch sphere.
   *  For S>4: first two entries used as (θ, φ), rest default to 0. */
  spinDirection: number[]
  /** Positive-energy projection strength (0-1).
   *  1.0 = pure positive energy (no Zitterbewegung).
   *  0.5 = equal positive/negative (maximum Zitterbewegung). */
  positiveEnergyFraction: number

  // === Display ===
  fieldView: DiracFieldView
  /** Color for particle (positive-energy) component */
  particleColor: [number, number, number]
  /** Color for antiparticle (negative-energy) component */
  antiparticleColor: [number, number, number]
  /** Auto-scale density normalization */
  autoScale: boolean

  // === Absorber ===
  absorberEnabled: boolean
  absorberWidth: number
  absorberStrength: number

  // === Diagnostics ===
  diagnosticsEnabled: boolean
  diagnosticsInterval: number

  // === Runtime ===
  needsReset: boolean
  /** Slice positions for dimensions > 3 */
  slicePositions: number[]
}

export const DEFAULT_DIRAC_CONFIG: DiracConfig = {
  latticeDim: 3,
  gridSize: [64, 64, 64],
  spacing: [0.15, 0.15, 0.15],
  mass: 1.0,
  speedOfLight: 1.0,
  hbar: 1.0,
  dt: 0.005,
  stepsPerFrame: 2,
  potentialType: 'step',
  potentialStrength: 3.0,
  potentialWidth: 0.5,
  potentialCenter: 0.0,
  harmonicOmega: 1.0,
  coulombZ: 1.0,
  initialCondition: 'gaussianPacket',
  packetCenter: [-2.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  packetWidth: 0.5,
  packetMomentum: [5.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  spinDirection: [0, 0],
  positiveEnergyFraction: 1.0,
  particleColor: [0.2, 0.6, 1.0],
  antiparticleColor: [1.0, 0.3, 0.2],
  autoScale: true,
  absorberEnabled: true,
  absorberWidth: 0.1,
  absorberStrength: 5.0,
  diagnosticsEnabled: true,
  diagnosticsInterval: 5,
  needsReset: true,
  slicePositions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
}
```

#### Step 1.3: Add `dirac` field to `SchroedingerConfig`

**File**: `src/lib/geometry/extended/types.ts`

In the `SchroedingerConfig` interface, after the `bec` field:

```typescript
/** Dirac equation configuration (when quantumMode === 'diracEquation') */
dirac: DiracConfig
```

In `DEFAULT_SCHROEDINGER_CONFIG`:

```typescript
dirac: DEFAULT_DIRAC_CONFIG,
```

#### Step 1.4: Add `dirac` to `TRANSIENT_FIELDS`

**File**: `src/stores/utils/presetSerialization.ts`

```typescript
'schroedinger.dirac.needsReset',
```

---

### Phase 2: Dirac Algebra (Rust/WASM + Web Worker)

The Clifford algebra generation involves tensor products that scale as O(S²) per matrix entry, where S = 2^(⌊N/2⌋). For 10D (S=32), each gamma matrix has 1024 complex entries and there are 11 of them. The positive-energy projector applies an S×S matrix-vector product at every k-point in the grid (up to 524K sites for 10D). This work belongs in Rust/WASM on a web worker to keep the main thread free for rendering.

**Pattern**: Follow the existing `kSpaceWorker.ts` message-passing pattern (not Comlink). The WASM module is loaded inside the worker. The main thread sends a request with dimension + config, the worker returns `Float32Array` gamma matrices ready for GPU upload.

#### Step 2.1: Rust Clifford algebra module

**File**: `src/wasm/mdimension_core/src/clifford.rs` (new file)

```rust
//! N-dimensional Clifford algebra generation for the Dirac equation.
//!
//! Generates alpha matrices (α₁..αₙ) and beta (β) satisfying:
//!   {αᵢ, αⱼ} = 2δᵢⱼ·I
//!   {αⱼ, β} = 0
//!   β² = I
//!
//! Uses the standard recursive tensor-product construction.

/// Compute spinor dimension: S = 2^(⌊N/2⌋)
pub fn spinor_size(spatial_dim: usize) -> usize {
    1 << (spatial_dim / 2)
}

/// Complex S×S matrix stored as flat Vec<f32> with re/im interleaved.
/// Layout: [re(0,0), im(0,0), re(0,1), im(0,1), ..., re(S-1,S-1), im(S-1,S-1)]
/// Total length: S * S * 2
pub type ComplexMatrix = Vec<f32>;

/// Generate all Dirac matrices for N spatial dimensions.
///
/// Returns (alphas, beta) where:
///   alphas: Vec of N complex matrices, each S×S
///   beta: one S×S complex matrix
///
/// Implementation approach:
///   1D (S=2): Pauli matrices σ₁, σ₂, σ₃
///   2D (S=2): α₁ = σ₁, α₂ = σ₂, β = σ₃
///   3D (S=4): αⱼ = [[0, σⱼ], [σⱼ, 0]], β = [[I, 0], [0, -I]]
///   4D (S=4): α₄ = [[0, -iI], [iI, 0]]
///   5D (S=4): α₅ = γ⁵ = iα₁α₂α₃α₄β (chirality matrix)
///   6D+ (S doubles): recursive tensor products with Pauli matrices:
///     αⱼ(2k) = αⱼ(2k-1) ⊗ σ₃   for j ≤ 2k-1
///     α_{2k}  = I_{S/2} ⊗ σ₁
///     β(2k)   = β(2k-1) ⊗ σ₃
///   Odd dim 2k+1: α_{2k+1} = chirality matrix of the 2k-dim algebra
pub fn generate_dirac_matrices(spatial_dim: usize) -> (Vec<ComplexMatrix>, ComplexMatrix) {
    // ... recursive implementation ...
}

/// Kronecker (tensor) product of two complex matrices.
fn kronecker_product(a: &[f32], a_size: usize, b: &[f32], b_size: usize) -> ComplexMatrix {
    // Result is (a_size * b_size) × (a_size * b_size)
    // ...
}

/// Complex matrix multiplication C = A × B (both S×S).
fn complex_mat_mul(a: &[f32], b: &[f32], s: usize) -> ComplexMatrix {
    // ...
}

/// Identity matrix of size S.
fn complex_identity(s: usize) -> ComplexMatrix {
    // ...
}

/// Verify anticommutation relations (debug builds only).
#[cfg(debug_assertions)]
pub fn verify_clifford_algebra(
    alphas: &[ComplexMatrix],
    beta: &ComplexMatrix,
    s: usize,
) -> bool {
    // Check {αᵢ, αⱼ} = 2δᵢⱼ·I, {αⱼ, β} = 0, β² = I
    // ...
}
```

#### Step 2.2: WASM bindings for Clifford algebra

**File**: `src/wasm/mdimension_core/src/lib.rs` (edit)

Add to the existing module:

```rust
mod clifford;

// ============================================================================
// Phase 3: Dirac Equation — Clifford Algebra
// ============================================================================

/// Generates Dirac gamma matrices for N spatial dimensions.
///
/// # Arguments
/// * `spatial_dim` - Number of spatial dimensions (1-11)
///
/// # Returns
/// Flat f32 buffer containing all matrices packed sequentially:
///   [alpha_1 | alpha_2 | ... | alpha_N | beta]
/// Each matrix is S×S×2 floats (complex, row-major, re/im interleaved).
/// First 4 bytes of the returned buffer encode spinor_size as a u32 (reinterpreted as f32).
/// Layout: [spinorSize_as_f32, alpha_1_data..., alpha_2_data..., ..., beta_data...]
#[wasm_bindgen]
pub fn generate_dirac_matrices_wasm(spatial_dim: usize) -> Vec<f32> {
    let s = clifford::spinor_size(spatial_dim);
    let (alphas, beta) = clifford::generate_dirac_matrices(spatial_dim);
    let matrix_size = s * s * 2;  // complex entries per matrix

    // Pack: [spinor_size_bits, alpha_1..., alpha_N..., beta...]
    let total = 1 + spatial_dim * matrix_size + matrix_size;
    let mut result = Vec::with_capacity(total);
    result.push(f32::from_bits(s as u32));
    for alpha in &alphas {
        result.extend_from_slice(alpha);
    }
    result.extend_from_slice(&beta);

    #[cfg(debug_assertions)]
    {
        assert!(clifford::verify_clifford_algebra(&alphas, &beta, s));
    }

    result
}

/// Returns the spinor size for a given spatial dimension.
#[wasm_bindgen]
pub fn dirac_spinor_size_wasm(spatial_dim: usize) -> usize {
    clifford::spinor_size(spatial_dim)
}
```

#### Step 2.3: Web worker for Dirac algebra computation

**File**: `src/lib/physics/dirac/diracAlgebraWorker.ts` (new file)

Follows the `kSpaceWorker.ts` pattern:

```typescript
/**
 * Web Worker for Dirac algebra computation.
 *
 * Generates Clifford algebra gamma matrices in Rust/WASM off the main thread.
 * The matrices are generated once per dimension change and transferred back
 * as Float32Array buffers ready for GPU upload.
 *
 * Message protocol:
 *   Main → Worker: DiracAlgebraRequest
 *   Worker → Main: DiracAlgebraResponse (with Transferable gamma buffer)
 */

export interface DiracAlgebraRequest {
  type: 'generateMatrices'
  epoch: number
  spatialDim: number
}

export interface DiracAlgebraResponse {
  type: 'result'
  epoch: number
  /** Packed gamma matrices: [spinorSize_bits, alpha_1..., alpha_N..., beta...] */
  gammaData: Float32Array
  spinorSize: number
}

// Load WASM inside the worker
let wasmModule: Awaited<typeof import('mdimension-core')> | null = null

async function ensureWasm() {
  if (!wasmModule) {
    const mod = await import('mdimension-core')
    await mod.default()
    wasmModule = mod
  }
  return wasmModule
}

self.onmessage = async (e: MessageEvent<DiracAlgebraRequest>) => {
  const msg = e.data
  if (msg.type !== 'generateMatrices') return

  const wasm = await ensureWasm()
  const gammaData = wasm.generate_dirac_matrices_wasm(msg.spatialDim)
  const spinorSize = wasm.dirac_spinor_size_wasm(msg.spatialDim)

  // Convert to Float32Array if needed (wasm-bindgen may return plain array)
  const buffer = gammaData instanceof Float32Array
    ? gammaData
    : new Float32Array(gammaData)

  const response: DiracAlgebraResponse = {
    type: 'result',
    epoch: msg.epoch,
    gammaData: buffer,
    spinorSize,
  }

  self.postMessage(response, { transfer: [buffer.buffer] })
}
```

#### Step 2.4: Main-thread bridge

**File**: `src/lib/physics/dirac/diracAlgebra.ts` (new file)

```typescript
/**
 * Main-thread interface to the Dirac algebra web worker.
 *
 * Manages the worker lifecycle, request/response epochs, and provides
 * a promise-based API for gamma matrix generation.
 *
 * Usage:
 *   const bridge = new DiracAlgebraBridge()
 *   const { gammaData, spinorSize } = await bridge.generateMatrices(spatialDim)
 *   // gammaData is ready for device.queue.writeBuffer() to the gamma storage buffer
 */

import type { DiracAlgebraRequest, DiracAlgebraResponse } from './diracAlgebraWorker'

export class DiracAlgebraBridge {
  private worker: Worker | null = null
  private epoch = 0
  private pending: Map<number, {
    resolve: (r: { gammaData: Float32Array; spinorSize: number }) => void
    reject: (e: Error) => void
  }> = new Map()

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./diracAlgebraWorker.ts', import.meta.url),
        { type: 'module' }
      )
      this.worker.onmessage = (e: MessageEvent<DiracAlgebraResponse>) => {
        const { epoch, gammaData, spinorSize } = e.data
        const p = this.pending.get(epoch)
        if (p) {
          this.pending.delete(epoch)
          p.resolve({ gammaData, spinorSize })
        }
      }
      this.worker.onerror = (e) => {
        // Reject all pending
        for (const [, p] of this.pending) {
          p.reject(new Error(`Dirac algebra worker error: ${e.message}`))
        }
        this.pending.clear()
      }
    }
    return this.worker
  }

  async generateMatrices(spatialDim: number): Promise<{
    gammaData: Float32Array
    spinorSize: number
  }> {
    const worker = this.ensureWorker()
    const epoch = ++this.epoch
    return new Promise((resolve, reject) => {
      this.pending.set(epoch, { resolve, reject })
      const msg: DiracAlgebraRequest = {
        type: 'generateMatrices',
        epoch,
        spatialDim,
      }
      worker.postMessage(msg)
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    for (const [, p] of this.pending) {
      p.reject(new Error('DiracAlgebraBridge disposed'))
    }
    this.pending.clear()
  }
}
```

#### Step 2.5: JS fallback for Clifford algebra

**File**: `src/lib/physics/dirac/cliffordAlgebraFallback.ts` (new file)

Pure TypeScript implementation of the same algorithm, used when WASM is unavailable (graceful degradation, matching the existing pattern in `animation-wasm.ts`). The bridge class tries WASM first, falls back to this if the worker fails to initialize.

```typescript
/**
 * Pure JS fallback for Clifford algebra generation.
 * Used when WASM is unavailable.
 * Same algorithm as clifford.rs, same output format.
 */
export function generateDiracMatricesFallback(spatialDim: number): {
  gammaData: Float32Array
  spinorSize: number
}

export function spinorSize(spatialDim: number): number {
  return 1 << Math.floor(spatialDim / 2)
}
```

#### Step 2.6: Physical scales (pure TypeScript — lightweight, no WASM needed)

**File**: `src/lib/physics/dirac/scales.ts` (new file)

```typescript
/** Compton wavelength: λ_C = ℏ/(mc) */
export function comptonWavelength(hbar: number, mass: number, c: number): number

/** Zitterbewegung frequency: ω_Z = 2mc²/ℏ */
export function zitterbewegungFrequency(mass: number, c: number, hbar: number): number

/** Klein threshold: V₀ = 2mc² (pair creation onset) */
export function kleinThreshold(mass: number, c: number): number

/** Relativistic energy-momentum relation: E = √((pc)² + (mc²)²) */
export function relativisticEnergy(p: number, mass: number, c: number): number

/** Estimate safe dt from CFL-like condition: dt < Δx/(c·√N) */
export function maxStableDt(spacing: number[], c: number): number
```

---

### Phase 3: Store Actions

#### Step 3.1: Add Dirac actions to the Schrödinger slice

**File**: `src/stores/slices/geometry/schroedingerSlice.ts`

Add a `setSchroedingerQuantumMode` branch for `'diracEquation'` (mirroring the TDSE/BEC branches):

```typescript
if (mode === 'diracEquation') {
  if (state.schroedinger.representation !== 'position') {
    updates.representation = 'position'
  }
  if (state.schroedinger.crossSectionEnabled) {
    updates.crossSectionEnabled = false
  }
  const dim = useGeometryStore.getState().dimension
  const prev = state.schroedinger.dirac
  if (prev.latticeDim !== dim) {
    const resized = resizeDiracArrays(prev, dim)
    updates.dirac = { ...prev, ...resized, needsReset: true }
  }
}
```

Add `resizeDiracArrays` helper:
```typescript
function resizeDiracArrays(config: DiracConfig, dim: number): Partial<DiracConfig> {
  return {
    latticeDim: dim,
    gridSize: resizeArray(config.gridSize, dim, 64),
    spacing: resizeArray(config.spacing, dim, 0.15),
    packetCenter: resizeArray(config.packetCenter, dim, 0),
    packetMomentum: resizeArray(config.packetMomentum, dim, 0),
    slicePositions: resizeArray(config.slicePositions, dim, 0),
  }
}
```

Add Dirac-specific setters:
```typescript
setDiracMass: clampedSetter('dirac.mass', 0.01, 100.0),
setDiracSpeedOfLight: clampedSetter('dirac.speedOfLight', 0.01, 10.0),
setDiracDt: (dt: number) => { /* with CFL clamping via maxStableDt */ },
setDiracPotentialType: valueSetter('dirac.potentialType'),
setDiracPotentialStrength: clampedSetter('dirac.potentialStrength', -100, 100),
setDiracInitialCondition: valueSetter('dirac.initialCondition'),
setDiracFieldView: valueSetter('dirac.fieldView'),
setDiracPositiveEnergyFraction: clampedSetter('dirac.positiveEnergyFraction', 0, 1),
setDiracGridSize: (axis: number, size: number) => { /* with needsReset */ },
setDiracNeedsReset: () => { /* set needsReset: true */ },
clearDiracNeedsReset: () => { /* set needsReset: false */ },
// ... etc, following BEC/TDSE setter patterns
```

#### Step 3.2: Add actions to `ExtendedObjectActions` type

**File**: `src/stores/slices/geometry/types.ts`

Add the Dirac setter signatures to the actions interface.

---

### Phase 4: GPU Compute — DiracComputePass

This is the core of the implementation. A new compute pass that handles:
- S pairs of (Re, Im) buffers for the spinor field
- S independent FFTs per step (reusing existing Stockham FFT shader)
- Matrix-valued k-space propagator
- Multi-component density grid writing

#### Step 4.1: Dirac uniform struct

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/diracUniforms.wgsl.ts` (new file)

```wgsl
struct DiracUniforms {
  // Lattice parameters (same layout as TDSE for FFT reuse)
  gridSize: array<u32, 12>,      // offset 0, 48 bytes
  strides: array<u32, 12>,       // offset 48, 48 bytes
  spacing: array<f32, 12>,       // offset 96, 48 bytes
  totalSites: u32,               // offset 144
  latticeDim: u32,               // offset 148

  // Physics
  mass: f32,                     // offset 152
  speedOfLight: f32,             // offset 156
  hbar: f32,                     // offset 160
  dt: f32,                       // offset 164
  spinorSize: u32,               // offset 168 (2, 4, 8, 16, or 32)

  // Potential
  potentialType: u32,            // offset 172
  potentialStrength: f32,        // offset 176
  potentialWidth: f32,           // offset 180
  potentialCenter: f32,          // offset 184
  harmonicOmega: f32,            // offset 188
  coulombZ: f32,                 // offset 192

  // Initial condition
  initCondition: u32,            // offset 196
  packetWidth: f32,              // offset 200
  positiveEnergyFraction: f32,   // offset 204
  packetCenter: array<f32, 12>,  // offset 208, 48 bytes
  packetMomentum: array<f32, 12>,// offset 256, 48 bytes

  // Display
  fieldView: u32,                // offset 304
  autoScale: u32,                // offset 308
  simTime: f32,                  // offset 312

  // Absorber
  absorberEnabled: u32,          // offset 316
  absorberWidth: f32,            // offset 320
  absorberStrength: f32,         // offset 324

  // Slice (N-D → 3D)
  slicePositions: array<f32, 12>,// offset 328, 48 bytes

  // Basis vectors for N-D rotation (same as TDSE)
  basisX: array<f32, 12>,        // offset 376, 48 bytes
  basisY: array<f32, 12>,        // offset 424, 48 bytes
  basisZ: array<f32, 12>,        // offset 472, 48 bytes

  // Bounding
  boundingRadius: f32,           // offset 520
  densityScale: f32,             // offset 524

  _pad: vec2f,                   // offset 528, 8 bytes → total 536 (round to 544)
};
```

#### Step 4.2: Gamma matrix storage buffer

The gamma matrices (alpha_1..alpha_N and beta) are uploaded as a single storage buffer. Layout:

```
Buffer layout: [alpha_1 | alpha_2 | ... | alpha_N | beta]
Each matrix: S×S complex entries = S×S×2 floats (row-major, re/im interleaved)
Total size: (N+1) × S² × 2 × 4 bytes
```

For 3D (S=4): (3+1) × 16 × 2 × 4 = 512 bytes
For 10D (S=32): (10+1) × 1024 × 2 × 4 = 90,112 bytes (~88 KB)

```wgsl
@group(0) @binding(1) var<storage, read> gammaMatrices: array<f32>;

// Access: gammaMatrices[matrixIndex * spinorSize * spinorSize * 2 + row * spinorSize * 2 + col * 2 + 0] = real
// Access: gammaMatrices[matrixIndex * spinorSize * spinorSize * 2 + row * spinorSize * 2 + col * 2 + 1] = imag
```

#### Step 4.3: Spinor field buffers

Instead of the TDSE's single `psiRe`/`psiIm` pair, the Dirac solver uses S pairs:

```typescript
// In DiracComputePass.ts
private spinorBuffersRe: GPUBuffer[] = []  // S buffers, each totalSites × f32
private spinorBuffersIm: GPUBuffer[] = []  // S buffers, each totalSites × f32
```

For efficiency on GPU, pack all components into a single buffer with offset indexing:

```typescript
// Alternative: single large buffer
private spinorReBuffer: GPUBuffer  // S × totalSites × f32
private spinorImBuffer: GPUBuffer  // S × totalSites × f32
```

The shader accesses component `c` at site `idx` as: `spinorRe[c * totalSites + idx]`

**Decision**: Use the single-buffer approach. It simplifies bind group creation (one buffer instead of S) and the FFT shaders can process it with an offset parameter.

#### Step 4.4: Initialization shader

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/diracInit.wgsl.ts` (new file)

```wgsl
// Initialize a Gaussian spinor wavepacket.
// For a positive-energy spin-up packet in 3D (S=4):
//   ψ = N · exp(-r²/4σ²) · exp(ik₀·r) · u(k₀)
// where u(k₀) is the positive-energy spinor for momentum k₀.
//
// For simplicity, the init shader creates a Gaussian in component 0 (spin-up particle)
// and applies the positive-energy projector in a subsequent k-space pass if
// positiveEnergyFraction < 1.0.

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  // Decode N-D coordinates
  var coords: array<u32, 12>;
  var temp = idx;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    coords[d] = temp % params.gridSize[d];
    temp /= params.gridSize[d];
  }

  // Compute position and Gaussian envelope
  var r2: f32 = 0.0;
  var phase: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    let centered = pos - params.packetCenter[d];
    r2 += centered * centered;
    phase += params.packetMomentum[d] * pos;
  }

  let envelope = exp(-r2 / (4.0 * params.packetWidth * params.packetWidth));
  let cosPhase = cos(phase / params.hbar);
  let sinPhase = sin(phase / params.hbar);

  // Initialize spinor: component 0 = envelope × exp(ik·r), rest = 0
  // (positive-energy projection applied in a separate pass if needed)
  for (var c: u32 = 0u; c < params.spinorSize; c++) {
    let bufIdx = c * params.totalSites + idx;
    if (c == 0u) {
      spinorRe[bufIdx] = envelope * cosPhase;
      spinorIm[bufIdx] = envelope * sinPhase;
    } else {
      spinorRe[bufIdx] = 0.0;
      spinorIm[bufIdx] = 0.0;
    }
  }
}
```

A second init dispatch applies the positive-energy projector in k-space (after FFT).

#### Step 4.5: Potential half-step shader

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/diracPotentialHalf.wgsl.ts` (new file)

```wgsl
// Half-step potential: ψ_c(x) → exp(-iV(x)dt/2ℏ) · ψ_c(x) for each component c.
// The scalar potential V(x) is diagonal in spinor space.

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  let V = potential[idx];
  let phase = -V * params.dt / (2.0 * params.hbar);
  let cosP = cos(phase);
  let sinP = sin(phase);

  // Apply phase rotation to each spinor component
  for (var c: u32 = 0u; c < params.spinorSize; c++) {
    let bufIdx = c * params.totalSites + idx;
    let re = spinorRe[bufIdx];
    let im = spinorIm[bufIdx];
    spinorRe[bufIdx] = re * cosP - im * sinP;
    spinorIm[bufIdx] = re * sinP + im * cosP;
  }
}
```

#### Step 4.6: Free Dirac propagator (k-space) shader

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/diracKinetic.wgsl.ts` (new file)

This is the key shader. At each k-point, it computes:

```
exp(-iH_free(k)·dt/ℏ) = cos(E·dt/ℏ)·I - i·sin(E·dt/ℏ)·(H_free/E)
```

where `E(k) = √((cℏ|k|)² + (mc²)²)` and `H_free(k) = cα·ℏk + βmc²`.

```wgsl
// The key identity: H_free² = E²·I (from Clifford algebra anticommutation)
// This means exp(-iHt) = cos(Et)·I - i·sin(Et)·H/E
//
// We compute H_free·ψ by matrix-vector multiply using gamma matrices from storage,
// then combine: ψ_out = cos(Et)·ψ - i·sin(Et)·(H·ψ)/E

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  // Decode k-space coordinates
  var kVec: array<f32, 12>;
  var temp = idx;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let gd = params.gridSize[d];
    let ki = temp % gd;
    temp /= gd;
    // FFT frequency: ki < N/2 → ki, ki >= N/2 → ki - N
    let freq = select(f32(ki), f32(ki) - f32(gd), ki >= gd / 2u);
    kVec[d] = freq * 2.0 * 3.14159265 / (f32(gd) * params.spacing[d]);
  }

  // Read spinor at this k-point
  var psiRe_local: array<f32, 32>;  // max spinor size
  var psiIm_local: array<f32, 32>;
  for (var c: u32 = 0u; c < params.spinorSize; c++) {
    let bufIdx = c * params.totalSites + idx;
    psiRe_local[c] = spinorRe[bufIdx];
    psiIm_local[c] = spinorIm[bufIdx];
  }

  // Compute H_free · ψ = (c·Σⱼ αⱼ·ℏkⱼ + β·mc²) · ψ
  var HpsiRe: array<f32, 32>;
  var HpsiIm: array<f32, 32>;
  // Initialize with β·mc² · ψ
  let mc2 = params.mass * params.speedOfLight * params.speedOfLight;
  matVecMul(params.spinorSize, params.latticeDim, mc2, psiRe_local, psiIm_local, HpsiRe, HpsiIm);
  // Add c·Σⱼ αⱼ·ℏkⱼ · ψ
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let coeff = params.speedOfLight * params.hbar * kVec[d];
    alphaMatVecMulAdd(d, params.spinorSize, coeff, psiRe_local, psiIm_local, HpsiRe, HpsiIm);
  }

  // Energy: E = √(Σ(cℏk_d)² + (mc²)²)
  var k2: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let ck = params.speedOfLight * params.hbar * kVec[d];
    k2 += ck * ck;
  }
  let E = sqrt(k2 + mc2 * mc2);

  // exp(-iH·dt/ℏ)·ψ = cos(E·dt/ℏ)·ψ - i·sin(E·dt/ℏ)·(H·ψ)/E
  let arg = E * params.dt / params.hbar;
  let cosArg = cos(arg);
  let sinArg = sin(arg);
  let invE = select(1.0 / E, 0.0, E < 1e-20);

  for (var c: u32 = 0u; c < params.spinorSize; c++) {
    // cos(Et)·ψ_c
    let reCos = cosArg * psiRe_local[c];
    let imCos = cosArg * psiIm_local[c];
    // -i·sin(Et)·(Hψ)_c/E = sin(Et)/E · (Hψ_im, -Hψ_re)
    let reKin = sinArg * invE * HpsiIm[c];
    let imKin = -sinArg * invE * HpsiRe[c];

    let bufIdx = c * params.totalSites + idx;
    spinorRe[bufIdx] = reCos + reKin;
    spinorIm[bufIdx] = imCos + imKin;
  }
}
```

**Performance concern**: For S=32 (10D/11D), the inner loops iterate 32 times with matrix-vector products involving 32×32 matrices. This is 32 × 32 × 2 = 2048 FMAs per k-point per matrix. With 11 alpha matrices + beta = 12 matrices, that's ~24K FMAs per site. At 64³ = 262K sites, this is ~6.3 billion FMAs per step. Modern GPUs handle this (RTX 4090: ~80 TFLOPS), but it's worth monitoring.

**Optimization**: For S ≤ 4 (dimensions 1-5), unroll the matrix-vector multiply entirely. For S ≥ 8, use the loop. The shader can branch on `params.spinorSize` since all threads in a workgroup have the same value (uniform control flow).

#### Step 4.7: Density grid write shader

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/diracWriteGrid.wgsl.ts` (new file)

Adapts the existing `tdseWriteGrid.wgsl.ts` pattern but sums over spinor components:

```wgsl
// For each 3D grid voxel, sample the spinor field and compute the selected observable.
//
// fieldView modes:
//   0: totalDensity     — Σ_c |ψ_c|²
//   1: particleDensity  — Σ_{c<S/2} |ψ_c|²
//   2: antiparticleDensity — Σ_{c≥S/2} |ψ_c|²
//   3: particleAntiparticleSplit — (particle, antiparticle) in (r, g) channels
//   4: spinDensity      — |ψ†Σψ| (requires spin matrix application)
//   5: currentDensity   — |cψ†αψ| (requires alpha matrix application)
//   6: phase            — arg(ψ₀) (phase of dominant component)

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // ... map 3D grid to N-D lattice coordinates (same as tdseWriteGrid) ...

  if (params.fieldView == 0u) {
    // Total density
    var density: f32 = 0.0;
    for (var c: u32 = 0u; c < params.spinorSize; c++) {
      let bufIdx = c * params.totalSites + siteIdx;
      let re = spinorRe[bufIdx];
      let im = spinorIm[bufIdx];
      density += re * re + im * im;
    }
    textureStore(densityGrid, gid, vec4f(density, 0.0, 0.0, 1.0));

  } else if (params.fieldView == 3u) {
    // Particle/antiparticle split
    var particleDensity: f32 = 0.0;
    var antiparticleDensity: f32 = 0.0;
    let half = params.spinorSize / 2u;
    for (var c: u32 = 0u; c < params.spinorSize; c++) {
      let bufIdx = c * params.totalSites + siteIdx;
      let re = spinorRe[bufIdx];
      let im = spinorIm[bufIdx];
      let d = re * re + im * im;
      if (c < half) {
        particleDensity += d;
      } else {
        antiparticleDensity += d;
      }
    }
    textureStore(densityGrid, gid, vec4f(particleDensity, antiparticleDensity, 0.0, 1.0));
  }
  // ... other field views ...
}
```

#### Step 4.8: DiracComputePass class

**File**: `src/rendering/webgpu/passes/DiracComputePass.ts` (new file)

Structure mirrors `TDSEComputePass.ts` with these differences:

```typescript
export class DiracComputePass extends WebGPUBasePass {
  // Spinor field: single buffer containing S components packed sequentially
  private spinorReBuffer: GPUBuffer | null = null
  private spinorImBuffer: GPUBuffer | null = null
  private spinorSize: number = 0

  // Gamma matrices storage buffer (uploaded from CPU)
  private gammaBuffer: GPUBuffer | null = null

  // Potential buffer (same as TDSE)
  private potentialBuffer: GPUBuffer | null = null

  // FFT infrastructure (reused from TDSE pattern)
  private fftScratchA: GPUBuffer | null = null
  private fftScratchB: GPUBuffer | null = null
  // ... same FFT fields as TDSEComputePass ...

  // Pipelines
  private initPipeline: GPUComputePipeline | null = null
  private potentialFillPipeline: GPUComputePipeline | null = null
  private potentialHalfPipeline: GPUComputePipeline | null = null
  private kineticPipeline: GPUComputePipeline | null = null
  private writeGridPipeline: GPUComputePipeline | null = null
  private absorberPipeline: GPUComputePipeline | null = null
  private projectorPipeline: GPUComputePipeline | null = null  // positive-energy projection

  execute(ctx, config, isPlaying, speed, basisX, basisY, basisZ, boundingRadius): void {
    // 1. Rebuild if config changed (grid size, dimension, spinor size)
    // 2. Upload uniforms + gamma matrices
    // 3. Init or reset (includes positive-energy projection in k-space)
    // 4. Time evolution (Strang splitting):
    //    a. Half-step V (per-component phase rotation)
    //    b. Pack (if needed) + Forward FFT × S components
    //    c. Free Dirac propagator (matrix exponential in k-space)
    //    d. Inverse FFT × S components
    //    e. Half-step V
    //    f. Absorber (per-component)
    // 5. Write density grid
    // 6. Diagnostics
  }
}
```

**FFT dispatch for S components**: The existing FFT infrastructure processes one complex buffer at a time. For S spinor components, we dispatch the FFT S times, each time pointing to the appropriate offset in the packed spinor buffer. This is done by writing a `componentOffset` uniform before each FFT dispatch.

Alternative (more efficient): Modify the FFT pack/unpack shaders to handle an array of S complex fields in a single dispatch, processing them in parallel across workgroups. This is an optimization that can be deferred — the per-component approach works first.

#### Step 4.9: Potential shader

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/diracPotential.wgsl.ts` (new file)

Simpler than TDSE potentials — the Dirac equation's key scenarios use step, barrier, and Coulomb potentials:

```wgsl
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  // Decode coordinates, compute position
  var pos: array<f32, 12>;
  // ... same coordinate decoding as TDSE ...

  var V: f32 = 0.0;

  if (params.potentialType == 0u) {
    // Free particle
    V = 0.0;
  } else if (params.potentialType == 1u) {
    // Step potential: V₀ for x₀ > center
    V = select(0.0, params.potentialStrength, pos[0] > params.potentialCenter);
  } else if (params.potentialType == 2u) {
    // Rectangular barrier
    let halfWidth = params.potentialWidth * 0.5;
    let inBarrier = abs(pos[0] - params.potentialCenter) < halfWidth;
    V = select(0.0, params.potentialStrength, inBarrier);
  } else if (params.potentialType == 3u) {
    // Finite square well
    let halfWidth = params.potentialWidth * 0.5;
    let inWell = abs(pos[0] - params.potentialCenter) < halfWidth;
    V = select(0.0, -params.potentialStrength, inWell);
  } else if (params.potentialType == 4u) {
    // Harmonic trap
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      r2 += pos[d] * pos[d];
    }
    V = 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r2;
  } else if (params.potentialType == 5u) {
    // Coulomb: V = -Z/r (regularized to avoid singularity)
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      r2 += pos[d] * pos[d];
    }
    let r = sqrt(r2 + 0.01 * params.spacing[0] * params.spacing[0]);  // soft-core regularization
    V = -params.coulombZ / r;
  }

  potential[idx] = V;
}
```

---

### Phase 5: Renderer Integration

#### Step 5.1: Add `'diracEquation'` to `QUANTUM_MODE_MAP`

**File**: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

```typescript
const QUANTUM_MODE_MAP: Record<string, number> = {
  harmonicOscillator: 0,
  hydrogenND: 1,
  freeScalarField: 2,
  tdseDynamics: 3,
  becDynamics: 4,
  diracEquation: 5,
}
```

#### Step 5.2: Route Dirac through its own compute pass

In the renderer, add Dirac detection alongside the existing TDSE/BEC/FSF routing:

```typescript
const isDirac = this.rendererConfig.quantumMode === 'diracEquation'
const isTdse = this.rendererConfig.quantumMode === 'tdseDynamics' || this.rendererConfig.quantumMode === 'becDynamics'
const isComputeMode = isFreeScalar || isTdse || isDirac
```

In the setup method, conditionally create the `DiracComputePass`:

```typescript
if (isDirac) {
  this.diracPass = new DiracComputePass(device)
}
```

In the render loop, when `isDirac`:

```typescript
if (isDirac && this.diracPass) {
  const diracConfig = extended.schroedinger.dirac
  this.diracPass.execute(ctx, diracConfig, isPlaying, speed, basisX, basisY, basisZ, boundingRadius)
  this.densityTexture = this.diracPass.getDensityTextureView()
}
```

The density texture format and grid size are the same as TDSE — the raymarching shader reads it identically. The `fieldView` determines what quantity is stored in the grid.

#### Step 5.3: Shader compilation flags

The Dirac mode uses `useDensityGrid: true` and `densityGridHasPhase: true` (for phase-based color algorithms), same as TDSE/BEC. The raymarching fragment shader reads the density grid without changes.

For the `particleAntiparticleSplit` field view, the density grid stores (particle, antiparticle) in the (r, g) channels. The existing color algorithms need one addition:

Add a new color algorithm slot (e.g., `colorAlgorithm == 20`) that reads both channels and maps them to the user-configured particle/antiparticle colors. This requires a small addition to the fragment shader's color algorithm switch.

```wgsl
} else if (colorAlgorithm == 20u) {
  // Dirac particle/antiparticle dual-color
  let particle = gridSample.r;
  let antiparticle = gridSample.g;
  let pColor = vec3f(object.particleColorR, object.particleColorG, object.particleColorB);
  let aColor = vec3f(object.antiparticleColorR, object.antiparticleColorG, object.antiparticleColorB);
  color = pColor * particle + aColor * antiparticle;
  density = particle + antiparticle;
}
```

---

### Phase 6: Diagnostics

#### Step 6.1: Dirac diagnostics store

**File**: `src/stores/diracDiagnosticsStore.ts` (new file)

```typescript
import { create } from 'zustand'

interface DiracDiagnosticsState {
  hasData: boolean
  totalNorm: number
  normDrift: number
  maxDensity: number
  /** Particle (positive-energy) fraction of total probability */
  particleFraction: number
  /** Antiparticle (negative-energy) fraction */
  antiparticleFraction: number
  /** Mean position ⟨x⟩ (for tracking Zitterbewegung) */
  meanPosition: number[]
  /** Compton wavelength at current mass/c */
  comptonWavelength: number
  /** Zitterbewegung frequency */
  zitterbewegungFreq: number
  /** Klein threshold at current mass/c */
  kleinThreshold: number

  update: (snapshot: Partial<DiracDiagnosticsState>) => void
  reset: () => void
}
```

#### Step 6.2: Diagnostic compute shader

**File**: `src/rendering/webgpu/shaders/schroedinger/compute/diracDiagnostics.wgsl.ts` (new file)

Adapts the existing TDSE diagnostics reduction but computes:
- Total norm: Σ_sites Σ_components |ψ_c|²
- Particle norm: Σ_sites Σ_{c<S/2} |ψ_c|²
- Max density: max over sites of Σ_c |ψ_c|²
- Mean position (optional, for ZBW tracking): Σ_sites x · Σ_c |ψ_c|²

Uses the same two-pass reduction pattern (partial sums → finalize) as `tdseDiagnostics.wgsl.ts`.

---

### Phase 7: UI Controls — Placement and Wiring

#### Step 7.1: `DiracControls.tsx`

**File**: `src/components/sections/Geometry/SchroedingerControls/DiracControls.tsx` (new file)

This component renders inside the "Field Configuration" section of the left sidebar, replacing the mode-specific controls area when `quantumMode === 'diracEquation'`. It follows the exact same pattern as `BECControls.tsx` / `TDSEControls.tsx` — a flat list of `ControlGroup` / `Slider` / `Select` / `Switch` using the `src/components/ui/` primitives.

**UI layout** (top to bottom, within the "Field Configuration" section):

```
┌─ Field Configuration ──────────────────────┐
│                                            │
│  Scenario Preset   [Klein Paradox ▾]       │  ← Select from DIRAC_SCENARIO_PRESETS
│                                            │
│  ── Initial Condition ──                   │
│  Type              [Gaussian Packet ▾]     │  ← DiracInitialCondition select
│  Energy Projection ═════════○═══ 1.0       │  ← positiveEnergyFraction slider (0-1)
│  Spin θ            ═══○═════════ 0.0       │  ← spinDirection[0] (visible when S≥2)
│  Spin φ            ═══○═════════ 0.0       │  ← spinDirection[1] (visible when S≥4)
│                                            │
│  ── Physics ──                             │
│  Mass (m)          ═══════○═════ 1.0       │  ← 0.01 to 100
│  Speed of Light (c)═══════○═════ 1.0       │  ← 0.01 to 10 (slow light = visible ZBW)
│  ℏ                 ═══════○═════ 1.0       │  ← 0.01 to 10
│  ┌ Info ─────────────────────────┐         │
│  │ λ_C = 1.00  ω_Z = 2.00       │         │  ← Computed from mass, c, ℏ
│  │ V_Klein = 2.00                │         │
│  │ Spinor: 4 components          │         │  ← From spinorSize(dim)
│  └───────────────────────────────┘         │
│                                            │
│  ── Potential ──                           │
│  Type              [Step ▾]                │  ← DiracPotentialType select
│  Height (V₀)       ═══════════○═ 3.0       │  ← potentialStrength
│  ⚠ V₀ > 2mc² — Klein regime               │  ← Warning when V₀ > kleinThreshold
│  Width             ═══════○═════ 0.5       │  ← (visible for barrier/well)
│  Center            ═══○═════════ 0.0       │
│  ω                 ═══════○═════ 1.0       │  ← (visible for harmonicTrap)
│  Z                 ═══════○═════ 1.0       │  ← (visible for coulomb)
│                                            │
│  ── Display ──                             │
│  Field View        [Total Density ▾]       │  ← DiracFieldView select
│  Particle Color    [■ ████████]            │  ← ColorPicker (visible for split view)
│  Antiparticle      [■ ████████]            │  ← ColorPicker (visible for split view)
│  Auto Scale        [✓]                     │  ← Switch
│                                            │
│  ── Absorber ──                            │
│  Enabled           [✓]                     │  ← Switch
│  Width             ═══════○═════ 0.1       │  ← (visible when enabled)
│  Strength          ═══════○═════ 5.0       │
│                                            │
│  ── Numerics ──                            │
│  Grid Size (N₀)    [64 ▾]                  │  ← Power-of-2 select per dim
│  Grid Size (N₁)    [64 ▾]                  │  ← (up to latticeDim entries)
│  ...                                       │
│  Spacing           ═══════○═════ 0.15      │
│  dt                ═══════○═════ 0.005     │
│  Steps/Frame       ═══════○═════ 2         │
│  ┌ CFL Info ─────────────────────┐         │
│  │ dt_max = 0.012 (CFL stable)   │         │
│  │ Current: ✓ stable              │         │
│  └───────────────────────────────┘         │
│                                            │
│  ── Slice Positions (dims > 3) ──          │
│  Dim 4             ═══○═════════ 0.0       │  ← (visible when dim > 3)
│  Dim 5             ═══○═════════ 0.0       │
│  ...                                       │
│                                            │
│  [ ↻ Reset Wavefunction ]                  │  ← Button, sets needsReset
│                                            │
└────────────────────────────────────────────┘
```

All controls use existing `src/components/ui/` primitives: `Select`, `Slider`, `Switch`, `Button`, `ColorPicker`, `ControlGroup`. No raw HTML.

#### Step 7.2: Wire into `SchroedingerControls/index.tsx`

**File**: `src/components/sections/Geometry/SchroedingerControls/index.tsx`

Three changes:

**1. Mode selector** (the `ToggleGroup` at the top of the Geometry section):
```typescript
{ value: 'diracEquation', label: 'Dirac' }
```
Added to the options array alongside `harmonicOscillator`, `hydrogenND`, `freeScalarField`, `tdseDynamics`, `becDynamics`.

**2. Mode flag and conditional rendering** (around line 316-319):
```typescript
const isDiracEquation = config.quantumMode === 'diracEquation'
```

In the mode-conditional block (around line 519):
```tsx
{isDiracEquation ? (
  <DiracControls config={config.dirac} dimension={dimension} actions={diracActions} />
) : isBecDynamics ? (
  <BECControls ... />
) : isTdseDynamics ? (
  <TDSEControls ... />
) : isFreeScalarField ? (
  <FreeScalarControls ... />
) : ...}
```

**3. Section title** (line 518):
```tsx
<Section title={isFreeScalarField || isTdseDynamics || isBecDynamics || isDiracEquation
  ? 'Field Configuration' : 'Quantum State'}>
```

**4. Representation selector guard** (line 452):
```tsx
{!isFreeScalarField && !isTdseDynamics && !isBecDynamics && !isDiracEquation && (
```

**5. Dirac-specific analysis/diagnostics controls below**:
```tsx
{isDiracEquation && (
  <DiracDiagnosticsToggle config={config.dirac} actions={diracActions} />
)}
```

#### Step 7.3: Wire into animation drawer

**File**: `src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx`

```typescript
const isDirac = config.quantumMode === 'diracEquation'
const isComputeMode = isFreeScalarField || isTdse || isBec || isDirac
```

- Time Evolution panel: add `&& !isDirac` to the visibility guard (line 170)
- Auto-Loop panel: change `isTdse` to `isTdse || isDirac` (line 190)
- All other panels already gated by `!isComputeMode`

#### Step 7.4: Wire Dirac analysis section into ControlPanel

**File**: `src/components/sections/ControlPanel.tsx`

Import and add `<DiracAnalysisSection />` alongside `<TDSEAnalysisSection />` and `<BECAnalysisSection />`. The section self-gates (returns null unless `quantumMode === 'diracEquation'`).

---

### Phase 8: Feature Compatibility — Full Integration Audit

This phase traces every rendering feature, UI section, sidebar panel, and animation control to determine what works, what needs hiding, and what needs adaptation for Dirac mode.

#### Step 8.1: Renderer Pipeline Integration

The renderer (`WebGPUSchrodingerRenderer.ts`) uses `isTdse` / `isFreeScalar` flags to control ~20 shader compilation options. Dirac needs the same treatment. Add `isDirac` alongside the existing flags:

**File**: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`

```typescript
const isDirac = this.rendererConfig.quantumMode === 'diracEquation'
const isComputeMode = isFreeScalar || isTdse || isDirac
```

Every location that currently checks `isFreeScalar || isTdse` must also include `|| isDirac`. There are ~25 such locations in the renderer (found via grep). Full list:

| Line pattern | What it controls | Dirac behavior |
|-|-|-|
| `useDensityGrid = isFreeScalar \|\| isTdse \|\| ...` | Enable 3D density texture path | `true` — Dirac writes density grid |
| `baseDensityGridSize = (isFreeScalar \|\| isTdse)` | Grid resolution source | Same — read from `dirac.gridSize` |
| `densityGridHasPhase = (isFreeScalar \|\| isTdse)` | Phase in B channel | `true` — Dirac grid stores phase in channel B |
| `shaderQuantumMode = (isFreeScalar \|\| isTdse) ? ...` | Shader inline eval vs grid | `'densityGrid'` — no inline evalPsi |
| `termCount = (isFreeScalar \|\| isTdse) ? 1 : ...` | Superposition terms | `1` — not applicable |
| `nodal = (isFreeScalar \|\| isTdse) ? false : ...` | Nodal surface rendering | `false` — no analytical nodal surfaces |
| `temporalAccumulation = (isFreeScalar \|\| isTdse) ? false` | Temporal reprojection | `false` — density grid updates each frame |
| `phaseMateriality = (isFreeScalar \|\| isTdse) ? false` | Phase-dependent material | `false` — no inline phase function |
| `interference = (isFreeScalar \|\| isTdse) ? false` | Interference fringing | `false` — no inline evalPsi |
| `uncertaintyBoundary = (isFreeScalar \|\| isTdse) ? false` | Uncertainty boundary | `false` — no analytical uncertainty |
| `isWigner = (isFreeScalar \|\| isTdse) ? false` | Wigner function | `false` — not applicable |
| `isFreeScalar: isFreeScalar \|\| isTdse` | Generic "density grid mode" flag | `true` — Dirac is also density-grid-based |
| `useEigenfunctionCache = ...` | Eigenfunction texture cache | `false` — no eigenfunctions |
| `useAnalyticalGradient = ...` | Gradient computation in shader | `false` — use finite differences on grid |
| `useRobustEigenInterpolation = ...` | Interpolation mode | `false` |
| `is2D = !isFreeScalarEarly && !isTdseEarly && ...` | 2D pipeline variant | Include `&& !isDiracEarly` |
| `isTemporal = ... && !isTdseEarly` | Temporal accumulation | Include `&& !isDiracEarly` |

**Action**: Systematically add `|| isDirac` to each of these. The pattern is: Dirac behaves identically to TDSE/BEC for all pipeline flags because it also renders from a density grid texture.

#### Step 8.2: Color Algorithms

**File**: `src/rendering/shaders/palette/types.ts` → `getAvailableColorAlgorithms()`

This function gates which color algorithms appear in the UI dropdown based on `quantumMode`. Currently has explicit branches for `'tdseDynamics'`, `'becDynamics'`, and `'freeScalarField'`. Dirac needs its own branch.

**Dirac density grid channel layout**:
- R: total density (ρ = ψ†ψ) or particle density
- G: antiparticle density (when `fieldView === 'particleAntiparticleSplit'`)
- B: phase of dominant spinor component (arg(ψ₀))
- A: potential overlay (V(x) normalized)

This matches the TDSE layout (R=density, G=logDensity, B=phase, A=potential) except G stores antiparticle density instead of logDensity. This means:

**Compatible color algorithms (same as TDSE)**:
- `blackbody` — reads R (density)
- `phaseCyclicUniform` — reads B (phase)
- `phaseDiverging` — reads B (phase)
- `diverging` — reads B (phase)
- `domainColoringPsi` — reads R+B (density + phase)
- `viridis` — reads R (density)
- `inferno` — reads R (density)
- `densityContours` — reads R (density)
- `phaseDensity` — reads R+B (density + phase)

**New color algorithm** (`particleAntiparticle`, slot 20): reads R (particle) and G (antiparticle) channels, maps to user-configured dual colors. Only available when `quantumMode === 'diracEquation'`.

**File changes**:
1. `getAvailableColorAlgorithms()` — add `'diracEquation'` branch returning TDSE-compatible set + `'particleAntiparticle'`
2. `COLOR_ALGORITHM_OPTIONS` — add `{ value: 'particleAntiparticle', label: 'Particle / Antiparticle' }` entry
3. `COLOR_ALGORITHM_TO_INT` — assign integer 20
4. `ColorAlgorithmSelector.tsx` — add `'diracEquation'` to `isComputeMode` check (line 72) so it auto-selects a valid algorithm on mode switch
5. Fragment shader `emission.wgsl.ts` — add `colorAlgorithm == 20u` branch (see Phase 5, Step 5.3)

#### Step 8.3: Lighting, PBR, and Materials

**No changes needed.** Lighting and PBR operate on the raymarched isosurface geometry, not on the wavefunction data:

| Feature | Where it runs | Mode dependency | Dirac status |
|-|-|-|-|
| Multi-light system | Fragment shader `lighting.wgsl.ts` | None — applied to any isosurface | Works as-is |
| PBR material | `MaterialUniforms` (bind group 1) | None — reads roughness, metallic from store | Works as-is |
| Subsurface scattering | Fragment shader SSS block | Reads density grid for thickness estimate | Works — density grid channel R is populated |
| Emission glow | `emission.wgsl.ts` | Reads density + color from grid/algorithm | Works — standard pipeline |
| Fog integration | Volume integration loop | Reads density grid | Works as-is |

The entire lighting pipeline is downstream of the density-to-color mapping. Once the density grid is populated (which DiracComputePass handles), all lighting features operate unchanged.

#### Step 8.4: Animation Drawer Integration

**File**: `src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx`

Current mode flags (line 159-165):
```typescript
const isFreeScalarField = config.quantumMode === 'freeScalarField'
const isTdse = config.quantumMode === 'tdseDynamics'
const isBec = config.quantumMode === 'becDynamics'
const isComputeMode = isFreeScalarField || isTdse || isBec
```

Add:
```typescript
const isDirac = config.quantumMode === 'diracEquation'
const isComputeMode = isFreeScalarField || isTdse || isBec || isDirac
```

| Animation Panel | Current Gating | Dirac Behavior |
|-|-|-|
| Time Evolution (timeScale) | `!isFreeScalarField && !isTdse && !isBec` (line 170) | **HIDE** — Dirac uses its own `dt/stepsPerFrame`. Add `&& !isDirac` |
| TDSE Auto-Loop | `isTdse` (line 190) | **SHOW** — Dirac also benefits from auto-loop. Change to `(isTdse \|\| isDirac)` |
| Interference Fringing | `!isComputeMode` (line 210) | **HIDE** — already covered by `isComputeMode` |
| Probability Flow (texture noise) | `!isComputeMode` (line 258) | **HIDE** — already covered |
| Probability Current (j-field) | `!isComputeMode` (line 300) | **HIDE** — already covered. Dirac has its own j = cψ†αψ via `currentDensity` fieldView |
| Slice Animation (dims ≥ 4) | Visible for all modes | **KEEP** — Dirac supports N-D slicing |
| Phase Animation | Gated by mode | **HIDE** — Dirac has dynamic phase from time evolution, not parametric phase |

#### Step 8.5: Sidebar Sections — Full Audit

Every sidebar section in `src/components/sections/` is traced:

| Section | Directory | Mode Gating | Dirac Action |
|-|-|-|-|
| **Geometry** | `Geometry/` | Always shown | **ADAPT** — mode selector gets `'diracEquation'` option. `SchroedingerControls/index.tsx` gets `isDiracEquation` branch rendering `<DiracControls>` |
| **Faces** (Color) | `Faces/` | Always shown | **ADAPT** — `ColorAlgorithmSelector.tsx` add `'diracEquation'` to `isComputeMode` (line 72), add `'particleAntiparticle'` option. `FacesSection.tsx` no mode gating → works as-is |
| **Lights** | `Lights/` | No mode gating | **WORKS** — lighting is mode-agnostic |
| **RenderMode** | `RenderMode/` | No mode gating | **WORKS** — isosurface/volume toggle applies to density grid |
| **PostProcessing** | `PostProcessing/` | No mode gating | **WORKS** — bloom, SSAO, SSR, tone mapping all mode-agnostic |
| **Environment** | `Environment/` | No mode gating | **WORKS** — skybox, ground plane mode-agnostic |
| **Performance** | `Performance/` | No mode gating | **WORKS** — quality presets mode-agnostic |
| **Export** | `Export/` | No mode gating | **WORKS** — screenshot/video mode-agnostic |
| **Settings** | `Settings/` | No mode gating | **WORKS** |
| **Shortcuts** | `Shortcuts/` | No mode gating | **WORKS** |
| **Advanced/CrossSection** | `Advanced/` | Returns null for `tdseDynamics`, `becDynamics`, etc. | **HIDE** — add `\|\| config.quantumMode === 'diracEquation'` to early return (line 99 of `SchroedingerCrossSectionSection.tsx`) |
| **Advanced/QuantumEffects** | `Advanced/` | Returns null for `tdseDynamics`, `becDynamics`, `freeScalarField`, dim ≤ 2, wigner | **HIDE** — add `\|\| config.quantumMode === 'diracEquation'` to early return (line 99 of `SchroedingerQuantumEffectsSection.tsx`) |
| **Advanced/TDSEAnalysis** | `Advanced/` | Returns null unless `quantumMode === 'tdseDynamics'` | **NO CHANGE** — Dirac has its own analysis section |
| **Advanced/BECAnalysis** | `Advanced/` | Returns null unless `quantumMode === 'becDynamics'` | **NO CHANGE** |
| **Advanced/OpenQuantumDiagnostics** | `Advanced/` | Gated by `openQuantumEnabled` + HO/hydrogen modes | **NO CHANGE** — already hidden for Dirac |
| **ObjectTypes** | `ObjectTypes/` | Shows `ObjectTypeExplorer` | **ADAPT** — `ObjectTypeExplorer.tsx` needs `'diracEquation'` in any mode-list rendering. Check if it reads `quantumMode` for display |
| **Test** | `Test/` | Dev-only | **NO CHANGE** |

#### Step 8.6: New Dirac Analysis Section

**File**: `src/components/sections/Advanced/DiracAnalysisSection.tsx` (new file)

Similar to `TDSEAnalysisSection.tsx` / `BECAnalysisSection.tsx`. Shows Dirac-specific diagnostics:

- Particle fraction ρ₊ / (ρ₊ + ρ₋)
- Antiparticle fraction ρ₋ / (ρ₊ + ρ₋)
- Total norm ||ψ||²
- Norm drift
- Compton wavelength λ_C
- ZBW frequency ω_Z
- Klein threshold V_K

Gated: returns null unless `quantumMode === 'diracEquation'`.

Wire into `ControlPanel.tsx` alongside the existing TDSE/BEC analysis sections.

#### Step 8.7: Representation Selector

**File**: `src/components/sections/Geometry/SchroedingerControls/index.tsx`

The representation selector (position / momentum / wigner) is hidden for TDSE, BEC, and FSF modes (line 452):

```tsx
{!isFreeScalarField && !isTdseDynamics && !isBecDynamics && (
```

Add `&& !isDiracEquation`. Dirac mode only supports position-space density rendering.

#### Step 8.8: Section Title

The section title changes based on mode (line 518):

```tsx
<Section title={isFreeScalarField || isTdseDynamics || isBecDynamics ? 'Field Configuration' : 'Quantum State'}>
```

Add `|| isDiracEquation` to the condition → title becomes "Field Configuration" for Dirac.

#### Step 8.9: N-D Rotation

N-D rotation (`src/stores/rotationStore.ts`, `src/components/sections/Geometry/`) is mode-agnostic — it rotates the bounding cube and computes basis vectors `basisX/Y/Z` passed to the renderer. Dirac passes these to `DiracComputePass` for the writeGrid shader to project N-D coordinates into the 3D density grid. **No changes needed.**

#### Step 8.10: Isosurface and Volume Rendering

Both `isoEnabled` / `isoThreshold` and volume integration work on the density grid texture. The shader reads `densityGrid` regardless of which compute pass populated it. **No changes needed** except ensuring `DiracComputePass.getDensityTextureView()` returns the same `GPUTextureView` format (`rgba16float`, same as TDSE).

#### Step 8.11: Post-Processing Pipeline

All post-processing passes (Bloom, SSAO, SSR, DOF, Tone Mapping, FXAA, SMAA, Motion Blur, Chromatic Aberration) read from the scene-color/depth textures produced by the fragment shader. They are completely decoupled from the quantum mode. **No changes needed.**

#### Step 8.12: ℏ Slider (Planck Constant Control)

The `SchroedingerControls/index.tsx` has an ℏ slider (around line 452-470, visible for modes that use `representation`). Since Dirac hides the representation selector, this slider is hidden too. Dirac has its own ℏ control inside `DiracControls.tsx`. **No conflict.**

#### Step 8.13: Preset System

**File**: `src/stores/utils/presetSerialization.ts`

Scene presets serialize the full store state. The Dirac config will be included in `schroedinger.dirac`. Ensure:
1. `TRANSIENT_FIELDS` includes `'schroedinger.dirac.needsReset'` (Phase 1, Step 1.4)
2. The preset merge logic handles the new `dirac` key (it should auto-merge via spread operator if following the existing pattern)

---

### Phase 9: Scenario Presets

#### Step 9.1: Create presets file

**File**: `src/lib/physics/dirac/presets.ts` (new file)

```typescript
export interface DiracScenarioPreset {
  id: string
  name: string
  description: string
  overrides: Partial<DiracConfig>
}

export const DIRAC_SCENARIO_PRESETS: DiracScenarioPreset[] = [
  {
    id: 'kleinParadox',
    name: 'Klein Paradox',
    description: 'Wavepacket hitting a supercritical step potential (V₀ > 2mc²) — pair creation at the barrier',
    overrides: {
      latticeDim: 1,
      gridSize: [512],
      spacing: [0.05],
      mass: 1.0,
      speedOfLight: 1.0,
      potentialType: 'step',
      potentialStrength: 3.0,  // > 2mc² = 2.0
      potentialCenter: 0.0,
      initialCondition: 'gaussianPacket',
      packetCenter: [-3.0],
      packetWidth: 0.5,
      packetMomentum: [5.0],
      positiveEnergyFraction: 1.0,
      fieldView: 'particleAntiparticleSplit',
      dt: 0.005,
      stepsPerFrame: 4,
    },
  },
  {
    id: 'zitterbewegung',
    name: 'Zitterbewegung',
    description: 'Trembling motion from positive/negative energy interference at frequency 2mc²/ℏ',
    overrides: {
      latticeDim: 1,
      gridSize: [512],
      spacing: [0.05],
      mass: 1.0,
      speedOfLight: 0.5,  // Slow light to make ZBW visible
      potentialType: 'none',
      initialCondition: 'zitterbewegung',
      positiveEnergyFraction: 0.5,  // Equal mix → maximum ZBW
      fieldView: 'particleAntiparticleSplit',
      dt: 0.002,
      stepsPerFrame: 8,
    },
  },
  {
    id: 'diracBarrierTunneling',
    name: 'Barrier Tunneling',
    description: 'Relativistic tunneling through a potential barrier — compare transmission with Schrödinger',
    overrides: {
      latticeDim: 1,
      gridSize: [512],
      spacing: [0.05],
      potentialType: 'barrier',
      potentialStrength: 1.5,
      potentialWidth: 1.0,
      initialCondition: 'gaussianPacket',
      packetMomentum: [4.0],
      positiveEnergyFraction: 1.0,
      fieldView: 'totalDensity',
    },
  },
  {
    id: 'relativisticHydrogen',
    name: 'Relativistic Hydrogen',
    description: 'Dirac particle in a Coulomb potential — fine structure from spin-orbit coupling',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      potentialType: 'coulomb',
      coulombZ: 1.0,
      initialCondition: 'gaussianPacket',
      packetWidth: 1.0,
      packetMomentum: [0, 0, 0],
      fieldView: 'totalDensity',
      dt: 0.005,
    },
  },
  {
    id: 'grapheneDirac',
    name: 'Graphene (2D Dirac)',
    description: '2D massless Dirac fermion — linear dispersion, Klein tunneling through npn junction',
    overrides: {
      latticeDim: 2,
      gridSize: [256, 256],
      spacing: [0.08, 0.08],
      mass: 0.0,  // Massless!
      speedOfLight: 1.0,
      potentialType: 'barrier',
      potentialStrength: 2.0,
      potentialWidth: 1.5,
      initialCondition: 'gaussianPacket',
      packetMomentum: [6.0, 0],
      positiveEnergyFraction: 1.0,
      fieldView: 'totalDensity',
    },
  },
  {
    id: 'diracOscillator',
    name: 'Dirac Oscillator',
    description: 'Harmonic trap for a relativistic particle — energy levels E_n = mc²√(1 + 2nℏω/mc²)',
    overrides: {
      latticeDim: 1,
      gridSize: [256],
      spacing: [0.08],
      potentialType: 'harmonicTrap',
      harmonicOmega: 1.0,
      initialCondition: 'gaussianPacket',
      packetWidth: 0.8,
      packetMomentum: [0],
      fieldView: 'totalDensity',
    },
  },
  {
    id: 'spinPrecession',
    name: 'Spin Precession',
    description: 'Spin-polarized wavepacket — watch the spin rotate in an inhomogeneous potential',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.12, 0.12, 0.12],
      potentialType: 'harmonicTrap',
      harmonicOmega: 0.5,
      initialCondition: 'gaussianPacket',
      spinDirection: [Math.PI / 4, 0],
      positiveEnergyFraction: 1.0,
      fieldView: 'spinDensity',
    },
  },
  {
    id: 'highDimDirac',
    name: '10D Dirac (String Theory)',
    description: '32-component spinor in 10 spatial dimensions — the Dirac equation of superstring theory',
    overrides: {
      latticeDim: 10,
      gridSize: [8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
      spacing: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
      mass: 1.0,
      potentialType: 'none',
      initialCondition: 'gaussianPacket',
      packetWidth: 0.8,
      fieldView: 'totalDensity',
      dt: 0.003,
      stepsPerFrame: 2,
    },
  },
]
```

---

### Phase 10: EnergyDiagramHUD Adaptation

#### Step 10.1: Extend HUD for Dirac mode

**File**: `src/components/canvas/EnergyDiagramHUD.tsx`

Add Dirac visibility condition:

```typescript
const isDirac = quantumMode === 'diracEquation'
const isVisible = (...existing... ||
                   (isDirac && dirac.diagnosticsEnabled)) && !isCinematic
```

For Dirac mode, the HUD shows:

**SVG plot**: Two curves:
1. V(x) potential profile (same as TDSE)
2. E(k) dispersion: ±√((ck)² + (mc²)²) — hyperbolic curves showing the mass gap 2mc²
3. Horizontal dashed line at V = 2mc² (Klein threshold)

**Metrics readout**:
```
λ_C = 1.00    ω_Z = 2.00
V_K = 2.00    ||ψ||² = 1.000
ρ₊ = 98.2%    ρ₋ = 1.8%
Δn = +0.01%
```

---

### Phase 11: Bounding Radius

#### Step 11.1: Add Dirac branch to `computeBoundingRadius`

**File**: `src/lib/geometry/extended/schroedinger/boundingRadius.ts`

The bounding radius for lattice-based modes is determined by the grid extent:

```typescript
if (quantumMode === 'diracEquation') {
  // Bounding radius from lattice extent (same pattern as TDSE/BEC)
  // The lattice extends from -L/2 to +L/2 where L = gridSize × spacing
  const maxExtent = Math.max(
    ...Array.from({ length: Math.min(dimension, 3) }, (_, d) =>
      (config.gridSize[d] ?? 64) * (config.spacing[d] ?? 0.15) * 0.5
    )
  )
  return Math.max(maxExtent * 1.1, MIN_BOUND_R)
}
```

---

### Phase 12: Tests

#### Step 12.1: Rust unit tests (Clifford algebra)

**File**: `src/wasm/mdimension_core/src/clifford.rs` (inline `#[cfg(test)]` module)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_spinor_sizes() {
        assert_eq!(spinor_size(1), 2);
        assert_eq!(spinor_size(2), 2);
        assert_eq!(spinor_size(3), 4);
        assert_eq!(spinor_size(10), 32);
        assert_eq!(spinor_size(11), 32);
    }

    #[test]
    fn test_anticommutation_all_dims() {
        for dim in 1..=11 {
            let (alphas, beta) = generate_dirac_matrices(dim);
            let s = spinor_size(dim);
            assert!(verify_clifford_algebra(&alphas, &beta, s),
                "Clifford algebra verification failed for dim={dim}");
        }
    }

    #[test]
    fn test_h_squared_equals_e_squared_identity() {
        // For random k-vectors, verify H_free² = E²·I
        // This is the key identity that makes the propagator formula work
        // ...
    }
}
```

Run with: `cargo test --manifest-path src/wasm/mdimension_core/Cargo.toml`

#### Step 12.2: Vitest tests (JS fallback + scales)

**File**: `src/tests/lib/physics/dirac/cliffordAlgebra.test.ts` (new file)

Tests the JS fallback produces the same results:
- Verify anticommutation: {αᵢ, αⱼ} = 2δᵢⱼ·I for all dimensions 1-11
- Verify {αⱼ, β} = 0 for all j
- Verify β² = I
- Verify spinor sizes: S = 2^(⌊N/2⌋)
- Cross-check: JS fallback output matches expected matrices for 1D-3D (hardcoded reference)

**File**: `src/tests/lib/physics/dirac/scales.test.ts` (new file)

- `comptonWavelength(1, 1, 1) === 1`
- `zitterbewegungFrequency(1, 1, 1) === 2`
- `kleinThreshold(1, 1) === 2`
- `maxStableDt` returns values that keep CFL < 1

#### Step 12.2: Store tests

**File**: `src/tests/stores/extendedObjectStore.dirac.test.ts` (new file)

- Mode switching to `'diracEquation'` forces `representation = 'position'`
- Mode switching disables `crossSectionEnabled`
- `resizeDiracArrays` handles dimension changes correctly
- Config setters clamp values within range
- `needsReset` set on grid size change

---

## File Summary

| File | Action | Description |
|-|-|-|
| `src/lib/geometry/extended/types.ts` | Edit | Add `'diracEquation'` to mode union, `DiracConfig`, `DEFAULT_DIRAC_CONFIG` |
| `src/wasm/mdimension_core/src/clifford.rs` | **New** | Rust Clifford algebra — gamma matrix generation |
| `src/wasm/mdimension_core/src/lib.rs` | Edit | Add `mod clifford` + WASM bindings |
| `src/lib/physics/dirac/diracAlgebraWorker.ts` | **New** | Web worker — runs WASM off main thread |
| `src/lib/physics/dirac/diracAlgebra.ts` | **New** | Main-thread bridge (promise-based API) |
| `src/lib/physics/dirac/cliffordAlgebraFallback.ts` | **New** | Pure JS fallback for Clifford algebra |
| `src/lib/physics/dirac/scales.ts` | **New** | Compton wavelength, ZBW frequency, Klein threshold |
| `src/lib/physics/dirac/presets.ts` | **New** | 8 curated Dirac scenario presets |
| `src/stores/slices/geometry/schroedingerSlice.ts` | Edit | Add Dirac mode-switch logic, `resizeDiracArrays`, Dirac setters |
| `src/stores/slices/geometry/types.ts` | Edit | Add Dirac action signatures |
| `src/stores/diracDiagnosticsStore.ts` | **New** | Dirac diagnostics store |
| `src/stores/utils/presetSerialization.ts` | Edit | Add `dirac.needsReset` to transient fields |
| `src/rendering/webgpu/shaders/schroedinger/compute/diracUniforms.wgsl.ts` | **New** | Dirac uniform struct |
| `src/rendering/webgpu/shaders/schroedinger/compute/diracInit.wgsl.ts` | **New** | Spinor wavepacket initialization |
| `src/rendering/webgpu/shaders/schroedinger/compute/diracPotentialHalf.wgsl.ts` | **New** | Per-component potential half-step |
| `src/rendering/webgpu/shaders/schroedinger/compute/diracPotential.wgsl.ts` | **New** | Potential types (step, barrier, Coulomb, etc.) |
| `src/rendering/webgpu/shaders/schroedinger/compute/diracKinetic.wgsl.ts` | **New** | Matrix exponential free Dirac propagator |
| `src/rendering/webgpu/shaders/schroedinger/compute/diracWriteGrid.wgsl.ts` | **New** | Multi-component density grid writer |
| `src/rendering/webgpu/shaders/schroedinger/compute/diracDiagnostics.wgsl.ts` | **New** | Multi-component diagnostic reduction |
| `src/rendering/webgpu/passes/DiracComputePass.ts` | **New** | Full Dirac equation compute orchestrator |
| `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` | Edit | Add `diracEquation` to mode map, routing |
| `src/rendering/webgpu/shaders/schroedinger/compose.ts` | Edit | Add color algorithm 20 (particle/antiparticle) |
| `src/components/sections/Geometry/SchroedingerControls/DiracControls.tsx` | **New** | Dirac UI controls |
| `src/components/sections/Geometry/SchroedingerControls/index.tsx` | Edit | Add Dirac mode branch, hide representation |
| `src/components/layout/TimelineControls/SchroedingerAnimationDrawer.tsx` | Edit | Add `isDirac` to `isComputeMode` |
| `src/components/sections/Advanced/SchroedingerQuantumEffectsSection.tsx` | Edit | Hide for `diracEquation` |
| `src/components/sections/Advanced/SchroedingerCrossSectionSection.tsx` | Edit | Hide for `diracEquation` |
| `src/components/sections/Advanced/DiracAnalysisSection.tsx` | **New** | Dirac diagnostics panel (ρ₊/ρ₋, λ_C, ω_Z, V_K) |
| `src/components/sections/Faces/ColorAlgorithmSelector.tsx` | Edit | Add `diracEquation` to `isComputeMode`, add `particleAntiparticle` option |
| `src/rendering/shaders/palette/types.ts` | Edit | Add `diracEquation` branch in `getAvailableColorAlgorithms`, add algorithm 20 |
| `src/components/canvas/EnergyDiagramHUD.tsx` | Edit | Dirac diagnostics display + dispersion plot |
| `src/lib/geometry/extended/schroedinger/boundingRadius.ts` | Edit | Dirac bounding radius from lattice extent |
| `src/tests/lib/physics/dirac/cliffordAlgebra.test.ts` | **New** | Clifford algebra verification (both WASM + fallback) |
| `src/tests/lib/physics/dirac/scales.test.ts` | **New** | Physical scales unit tests |
| `src/tests/stores/extendedObjectStore.dirac.test.ts` | **New** | Store tests |

**New files**: 22
**Edited files**: 14

---

## Implementation Order

1. **Types & config** (Phase 1) — foundation, no runtime effect
2. **Dirac algebra in Rust/WASM** (Phase 2) — Clifford algebra + web worker, testable independently via `cargo test` and Vitest
3. **Store actions** (Phase 3) — enables UI development
4. **GPU compute** (Phase 4) — the physics engine (largest phase, ~8 shader files + pass)
5. **Renderer routing** (Phase 5) — connects GPU to display
6. **Diagnostics** (Phase 6) — observables readout
7. **UI controls** (Phase 7) — user-facing controls
8. **Feature compat** (Phase 8) — hide/show existing features
9. **Presets** (Phase 9) — curated scenarios
10. **HUD** (Phase 10) — diagnostic overlay
11. **Bounding radius** (Phase 11) — camera framing
12. **Tests** (Phase 12) — verification

**Critical path**: Phases 1 → 2 → 4 → 5. Once these are done, the mode is functional (switch to it, see a spinor evolve). Phases 3, 6-12 are integration and polish.

**Phase 2 build note**: After adding `clifford.rs`, run `npm run wasm:build` (`wasm-pack build ./src/wasm/mdimension_core --target web`) to regenerate the WASM package. The new `generate_dirac_matrices_wasm` and `dirac_spinor_size_wasm` exports will be available to the worker. Run `cargo test` first to verify the algebra is correct before building WASM.

**Highest-risk phase**: Phase 4 (GPU compute). The kinetic propagator shader (Step 4.6) is the most complex piece — it performs matrix-vector multiplies using gamma matrices from a storage buffer with variable spinor size. The `H² = E²·I` identity eliminates the need for general matrix exponentials, which is a major simplification. Test with 1D (S=2) first.

---

## Key Differences from BEC Plan

| Aspect | BEC | Dirac |
|-|-|-|
| Solver | Extends TDSE (2-line change) | New compute pass (cannot share) |
| Field buffers | 1 scalar (Re + Im) | S spinor components (S pairs of Re + Im) |
| FFT count | 1 per step | S per step |
| k-space step | Scalar phase | S×S matrix exponential |
| New shaders | 0 (modified existing) | 7 new WGSL shader files |
| CPU math | Trivial (μ, ξ formulas) | Clifford algebra in Rust/WASM + web worker |
| GPU memory | Same as TDSE | S× more field memory (up to 32×) |
| Performance ceiling | Same as TDSE | S× more FFTs + matrix ops |

---

## Performance Considerations

### Memory Budget

For a 64³ grid (262,144 sites):
- TDSE: 2 buffers × 262K × 4 bytes = 2 MB
- Dirac 3D (S=4): 8 buffers × 262K × 4 = 8 MB
- Dirac 10D (S=32, but 8³ = 524K sites): 64 buffers × 524K × 4 = 128 MB

The 10D case is tight but feasible on GPUs with ≥ 4 GB VRAM. The grid size auto-scales down with dimension (8 per dim for 10D).

### Compute Budget

Per time step:
- S forward FFTs + S inverse FFTs = 2S FFTs
- 1 kinetic propagator dispatch (S×S matrix per site)
- 2 potential half-steps (S multiplies per site)

For 3D (S=4): 8 FFTs + matrix ops ≈ 4× TDSE cost
For 10D (S=32): 64 FFTs + matrix ops ≈ 32× TDSE cost (but on smaller grids)

### Mitigation

1. Smaller default grid for high dimensions (8 per dim for 10D vs 64 for 3D)
2. Fewer `stepsPerFrame` default for high dimensions
3. The CFL condition for Dirac (dt < Δx/c√N) naturally limits step size
4. FFT batching optimization (deferred): dispatch all S FFTs in a single workgroup with shared memory
