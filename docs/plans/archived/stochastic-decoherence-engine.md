# Stochastic Decoherence Engine — PRD

**Status**: Proposed
**Scope**: Two visualization features sharing one GPU infrastructure
**Depends on**: TDSE compute pipeline (existing), measurement system (existing)

## Executive Summary

Add position-space decoherence to the TDSE compute pipeline via a stochastic localization operator applied each timestep. This single mechanism enables two features:

1. **Decoherent Branching Visualization** — a rare interactive visualization of decoherence and pointer-state emergence in continuous space, showing how a wavefunction separates into effectively autonomous components under environment coupling
2. **Continuous Monitoring Transition** — a sandbox for exploring whether continuous weak monitoring in spatial wave mechanics exhibits a sharp transition or only a crossover, and how this depends on potential type and spatial dimensionality

Neither is a new `SchroedingerQuantumMode`. Both are extensions to `tdseDynamics` with new UI in the right editor panel's analysis tab.

### Scientific Positioning

These features visualize well-established physics (decoherence, pointer-state selection, continuous measurement) in a format that is rare as an interactive product. They do not claim to produce new theoretical results.

**Feature A** renders dynamics that have been studied theoretically for decades (Zurek's einselection, Caldeira-Leggett decoherence). The novelty is the real-time 3D spatial visualization with color-coded branch separation — not the underlying physics. Claims about "watching reality branch" should be understood as visualization of effective branch autonomy, not as settling the measurement problem or endorsing a specific interpretation.

**Feature B** explores whether a transition or crossover appears in a specific model (single-particle TDSE under continuous weak position monitoring). This is an open question for this exact setup: continuous monitoring has been studied in many-body systems (free fermions, bosons), but some models show no sharp MIPT under local measurements. Whether a transition occurs in a single-particle continuous-space setting is unknown, making this genuinely exploratory — but the outcome (sharp transition, crossover, or no transition) is not predetermined. The feature is valuable regardless of which answer emerges, as a tool for investigating the monitored dynamics.

---

## Part 1: Shared GPU Infrastructure

### 1.1 Physics: Stochastic Schrödinger Equation (SSE)

The standard TDSE evolves ψ deterministically:

```
iℏ ∂ψ/∂t = Hψ
```

The stochastic extension adds continuous spontaneous localization (CSL):

```
dψ = (-i/ℏ)H ψ dt + Σ_k √γ (L_k - ⟨L_k⟩) ψ dW_k
```

where L_k are localization operators (Gaussian position projectors), γ is the monitoring/decoherence rate, and dW_k are independent Wiener increments.

**Discretized for the TDSE grid**, this reduces to: after each Strang splitting step, apply a stochastic localization kick at N_loc randomly chosen grid sites per step:

```wgsl
// Per site i, per step:
let localization_weight = γ * dt * gaussian(site_i, collapse_center_k, σ_loc);
psiRe[i] *= (1.0 + localization_weight * (noise_k - expectation_k));
psiIm[i] *= (1.0 + localization_weight * (noise_k - expectation_k));
```

The key parameters:
| Parameter | Symbol | Range | Physical meaning |
|-----------|--------|-------|------------------|
| Monitoring rate | γ | 0–10 | Strength of environment coupling |
| Localization width | σ_loc | 0.5–5.0 (grid spacings) | Resolution of position monitoring |
| Collapse sites/step | N_loc | 1–32 | How many random positions are monitored per step |
| Noise seed | seed | u32 | Reproducibility |

### 1.2 Implementation: New WGSL Compute Shader

A single new compute pipeline `tdse-stochastic-localization` inserted into the Strang splitting loop after step 7 (fused unpack + potential half) and before step 8 (absorber).

**Location in evolution loop** (`TDSEComputePassEvolution.ts:89–158`):

```
existing step 6+7: fusedUnpackPotentialPipeline
── NEW: stochastic localization dispatch ──
existing step 8: absorberPipeline
existing step 9: renormalization
```

#### Shader design

```
File: src/rendering/webgpu/shaders/schroedinger/compute/tdseStochasticLoc.wgsl.ts
```

**Inputs** (bind group 0):
- binding 0: `TDSEUniforms` (existing, read-only)
- binding 1: `psiRe: array<f32>` (read-write)
- binding 2: `psiIm: array<f32>` (read-write)
- binding 3: `StochasticParams` uniform (new, 64 bytes)

**StochasticParams uniform struct** (64 bytes):

```wgsl
struct StochasticParams {
  gamma: f32,             // monitoring rate
  sigma: f32,             // localization Gaussian width (world units)
  numCollapseSites: u32,  // N_loc this step
  stepIndex: u32,         // for PRNG seeding
  seed: u32,              // user seed
  dt: f32,                // timestep (duplicated for convenience)
  _pad0: u32,
  _pad1: u32,
  // Collapse centers: packed as (x, y, z, noise_value) × 8
  // Max 8 collapse sites per dispatch (dispatch multiple times for N_loc > 8)
  centers: array<vec4f, 8>,  // 128 bytes
};
// Total: 32 + 128 = 160 bytes (round to 160, aligned)
```

**Algorithm per invocation** (one thread per grid site):
1. For each collapse center k (0..numCollapseSites):
   - Compute distance² from this site to center k (in N-D lattice coordinates)
   - Compute Gaussian weight: `w = exp(-dist² / (2 * sigma²))`
   - Compute localization factor: `factor = gamma * dt * w * noise_k`
   - Accumulate multiplicative update to psi
2. Apply accumulated update: `psi[i] *= (1.0 + total_factor)`

**Why multiplicative, not additive**: Multiplicative update preserves wavefunction phase structure. The expectation subtraction (⟨L_k⟩ term) is computed CPU-side from the previous step's diagnostics readback (norm in left/right halves, already available).

**Workgroup size**: 64 (matches existing `LINEAR_WG`)

#### CPU-side orchestration

New file: `src/rendering/webgpu/passes/TDSEStochasticLocalization.ts`

Per frame:
1. If γ = 0, skip entirely (zero-cost when disabled)
2. Generate N_loc random collapse centers on CPU using seeded PRNG
3. For each center, draw a Gaussian noise value dW ~ N(0, 1)
4. Compute ⟨L_k⟩ from previous frame's norm-left/norm-right diagnostic (already in `diagResultBuffer`)
5. Pack centers + noise into StochasticParams uniform
6. Dispatch localization shader (1 dispatch per batch of 8 centers)
7. Existing renormalization step (step 9) corrects any norm drift

### 1.3 Buffer Additions

| Buffer | Size | Usage | Notes |
|--------|------|-------|-------|
| `stochasticUniformBuffer` | 160 bytes | UNIFORM | Collapse centers + params |

**No additional psi buffers.** The localization operates in-place on the existing `psiReBuffer` and `psiImBuffer`.

### 1.4 Pipeline/Bind Group Changes

- 1 new compute pipeline (stochastic localization)
- 1 new bind group (reuses psiRe/psiIm from existing bind groups, adds stochastic uniform)
- Register in `TDSEComputePassSetup.ts` pipeline creation
- Dispatch from `TDSEComputePassEvolution.ts` (conditional on γ > 0)

---

## Part 2: Feature A — Decoherent Branching Visualization

### 2.1 Concept

A TDSE wavefunction in a branching potential (double-well, barrier, beam splitter) evolves with stochastic localization enabled. The wavefunction splits into pointer states (e.g., left-well / right-well, transmitted / reflected). Each pointer state is rendered in a distinct color within the same 3D volume. As decoherence progresses, the spatial overlap between branches shrinks to zero — the user watches a single quantum reality fork into independent classical outcomes.

### 2.2 Pointer-State Decomposition

For the initial implementation, use **spatial partitioning** — the simplest physically motivated decomposition:

| Potential type | Branch A | Branch B | Partition |
|---------------|----------|----------|-----------|
| Double well | Left well | Right well | x < 0 vs x ≥ 0 |
| Barrier | Reflected | Transmitted | x < barrier vs x ≥ barrier |
| Beam splitter | Path 1 | Path 2 | Quadrant partition |
| Radial double well | Inner | Outer | r < r_mid vs r ≥ r_mid |

The partition is defined by a **branch plane** — a hyperplane in the N-D lattice that divides the grid into two regions. The branch plane position is configurable (defaults to the potential's symmetry point).

**No eigenstate decomposition needed.** This is a key simplification: we don't need to project onto eigenstates (which would require solving the eigenvalue problem). We just need to know "how much ψ is on each side of the partition."

### 2.3 Visualization: Dual-Channel Density Encoding

The existing density texture is `rgba16float` with encoding:
```
R: normDensity (display scalar)
G: logDensity
B: phase
A: rawDensity or -potOverlay
```

**Approach**: Add a second 3D texture (`branchTex`, same size as density texture: 96³) that stores per-voxel branch weights:

```
branchTex encoding:
R: branch-A density fraction (0–1)
G: branch-B density fraction (0–1)
B: overlap metric (product of A and B densities, normalized)
A: reserved
```

This is computed in a modified `tdseWriteGrid` shader that, for each voxel:
1. Evaluates ψ as normal (trilinear interpolation)
2. Determines which branch region the N-D lattice coordinate falls in
3. Writes the appropriate channel

The **raymarcher** reads both textures and maps branch fractions to colors:
- Pure branch A: color A (e.g., cyan)
- Pure branch B: color B (e.g., magenta)
- Overlap region: blended (purple), with opacity proportional to overlap metric
- As decoherence progresses: overlap → 0, pure colors dominate

### 2.4 Diagnostics Panel

New section in the right panel analysis tab: **Branch Analysis**

| Metric | Source | Display |
|--------|--------|---------|
| Branch A population | ∫|ψ|² over region A (from existing diagPartialLeftBuffer) | Percentage bar |
| Branch B population | ∫|ψ|² over region B (from existing diagPartialRightBuffer) | Percentage bar |
| Branch coherence | Re(∫ψ_A* · ψ_B) cross-term magnitude | Sparkline (decays to 0) |
| Decoherence time | Fitted exponential decay of coherence | Numeric display |
| Branch entropy | -Σ p_k ln p_k for branch populations | Numeric display |

**Critical insight**: The TDSE diagnostics already compute `normLeft` and `normRight` (partial norms on each side of the grid midpoint) — see `TDSEComputePassBuffers.ts:21` (`DIAG_RESULT_COUNT = 5` includes `normLeft, normRight`). The branch population metrics come for free.

The branch coherence requires a new diagnostic reduction: compute ∫ ψ_A* · ψ_B where ψ_A = ψ · χ_A (ψ restricted to region A) and ψ_B = ψ · χ_B. This is one additional reduction pass (same pattern as the existing norm reduction).

### 2.5 UI Controls

Added as a new "Decoherence" Section in the left editor panel -> Geometry tab:

| Control | Type | Range | Default |
|---------|------|-------|---------|
| Enable decoherence | Switch | on/off | off |
| Monitoring rate (γ) | Slider | 0–10 | 0.5 |
| Localization width (σ) | Slider | 0.5–5.0 | 2.0 |
| Collapse sites/step | Slider (integer) | 1–32 | 4 |
| Show branches | Switch | on/off | off |
| Branch plane position | Slider | -1.0 to 1.0 (normalized) | 0.0 |
| Branch color A | ColorPicker | — | cyan |
| Branch color B | ColorPicker | — | magenta |
| Seed | NumberInput | 0–999999 | 42 |

### 2.6 Presets
Added to the "Scenario" presets in the left editor panel's top, all automatic enabling decoherence. Other scenario presets that already exist must be extended to disable decoherence when selected.

| Preset | Potential | γ | σ | Description |
|--------|-----------|---|---|-------------|
| Double Well Branching | doubleWell | 1.0 | 2.0 | Particle in double well, watch left/right separation |
| Barrier Branching | barrier | 0.5 | 1.5 | Wavepacket hits barrier, transmitted/reflected split |
| Schrödinger's Cat | doubleWell (deep) | 0.2 | 3.0 | Slow decoherence of macroscopic superposition |
| Rapid Collapse | barrier | 5.0 | 1.0 | Fast environment coupling, immediate localization |

---

## Part 3: Feature B — Continuous Monitoring Transition

### 3.1 Concept

The same stochastic localization mechanism, but focused on exploring whether a **critical monitoring rate** γ_c exists at which the wavefunction transitions from delocalized to localized. The user sweeps γ and observes whether a sharp transition, gradual crossover, or no transition emerges — this is an open question for single-particle continuous-space systems.

**Important caveat**: MIPT has been demonstrated in many-body quantum circuits, but some monitored-boson models with local measurements show no sharp transition. Whether this specific setup (single particle, continuous space, weak position monitoring) exhibits a genuine phase transition is not established by existing literature. The feature is designed as an exploratory sandbox, not as a demonstration of known physics.

### 3.2 Order Parameter: Inverse Participation Ratio (IPR)

The IPR measures how delocalized the wavefunction is:

```
IPR = (Σ |ψ_i|²)² / Σ |ψ_i|⁴ = 1 / Σ p_i²
```

- Fully delocalized (uniform): IPR = N (number of sites)
- Fully localized (delta): IPR = 1
- Normalized: IPR_norm = IPR / N ∈ [0, 1]

The existing diagnostics already compute `Σ |ψ|⁴` (the `sumPsi4` field in `DIAG_RESULT_COUNT`) for exactly this purpose. **IPR comes for free.**

### 3.3 Monitoring Sweep

The monitoring feature automates a parameter sweep:

1. User sets a potential (e.g., harmonic, box, lattice)
2. User sets γ range (e.g., 0.01 to 5.0) and number of sweep points (e.g., 20)
3. For each γ value:
   a. Initialize wavefunction (ground state or wavepacket)
   b. Evolve for T_evolve steps with stochastic localization at rate γ
   c. Record time-averaged IPR over the last T_measure steps
4. Plot IPR(γ) — observe whether a sharp drop, gradual crossover, or smooth decay emerges

**This is computationally equivalent to an Anderson localization sweep** — and the app already has `andersonSweepStore.ts` with sweep infrastructure. The monitoring sweep can reuse or mirror that architecture.

**Open question**: The shape of the IPR(γ) curve is not predicted by existing theory for this model. A sharp drop would suggest a phase transition. A smooth monotonic decrease would suggest a crossover. Both outcomes are scientifically valuable — the feature visualizes whichever behavior the physics produces.

### 3.4 Diagnostics Panel

New section in the right panel analysis tab: **Monitoring Dynamics**

| Metric | Source | Display |
|--------|--------|---------|
| Current IPR | From existing sumPsi4 diagnostic | Numeric + sparkline |
| IPR(γ) curve | Accumulated from sweep | Scatter plot |
| Steepest descent γ | Largest |ΔIPR/Δγ| in sweep data | Vertical marker on plot (if slope exceeds threshold) |
| Delocalization measure | log(IPR) / log(N) | Percentage bar |
| Monitoring rate (γ) | Current setting | Numeric |

Note: The "steepest descent" marker is shown only when the local slope exceeds a threshold (|ΔIPR/Δγ| > 0.1). If the curve is smooth with no sharp feature, no marker is shown — this is informative, not a failure.

### 3.5 UI Controls

| Control | Type | Range | Default |
|---------|------|-------|---------|
| Enable monitoring | Switch | on/off | off |
|Presets | Select | see 3.6 Presets below | Box Monitoring |
| Monitoring rate (γ) | Slider | 0–10 | 0.0 |
| Sweep mode | Switch | on/off | off |
| γ range (min) | NumberInput | 0.01–10 | 0.01 |
| γ range (max) | NumberInput | 0.01–10 | 5.0 |
| Sweep points | NumberInput (int) | 5–50 | 20 |
| Evolution time (T_evolve) | NumberInput | 100–10000 steps | 2000 |
| Measurement window (T_measure) | NumberInput | 50–2000 steps | 500 |
| Current sweep progress | ProgressBar | — | — |

### 3.6 Presets

| Preset | Potential | γ range | Description |
|--------|-----------|---------|-------------|
| Box Monitoring | infinite walls | 0.01–5.0 | Simplest confining potential — cleanest IPR curve |
| Harmonic Monitoring | harmonic | 0.01–3.0 | Monitoring in smooth confining potential |
| Lattice Monitoring | periodic lattice | 0.01–8.0 | Interplay of Bloch delocalization and monitoring |
| Chaotic Monitoring | coupled anharmonic | 0.01–5.0 | How does chaos affect the IPR(γ) curve? |

---

## Part 4: Performance Analysis

### 4.1 Baseline: Current TDSE Performance

The existing TDSE evolution for a 64³ grid (262,144 sites):

| Operation | Dispatches/step | Approx. GPU time |
|-----------|----------------|-----------------|
| Fused V-half + pack | 1 | ~15 µs |
| FFT (3 axes, ~6 stages each) | ~18 | ~200 µs |
| Kinetic propagator | 1 | ~15 µs |
| Inverse FFT | ~18 | ~200 µs |
| Fused unpack + V-half | 1 | ~15 µs |
| Absorber (conditional) | 0–1 | ~5 µs |
| Renormalization (reduce + finalize + scale) | 3 | ~30 µs |
| **Total per step** | **~42** | **~480 µs** |

At 4 steps/frame, 60 FPS: ~1.9 ms/frame for evolution. Well within budget.

### 4.2 Stochastic Localization Cost

The new localization dispatch:

| Factor | Value | Notes |
|--------|-------|-------|
| Threads | 262,144 (= totalSites) | Same as existing dispatches |
| Work per thread | ~8 Gaussian evaluations (N_loc ≤ 8) | 1 exp() + 3 multiply per center |
| Memory access | 2 reads + 2 writes (psiRe, psiIm) | Same buffers as existing ops |
| Dispatches per step | ceil(N_loc / 8) | 1 dispatch for N_loc ≤ 8 |
| **Estimated time** | **~20–40 µs per dispatch** | Comparable to the kinetic step |

**Impact at default settings (N_loc=4, 4 steps/frame)**: +80–160 µs/frame = **+4–8% overhead**. Negligible.

**Worst case (N_loc=32, 8 steps/frame)**: 4 dispatches × 8 steps × 40 µs = 1.28 ms/frame. Still under 10% of frame budget.

### 4.3 Branch Texture Cost (Feature A only)

| Resource | Size | Notes |
|----------|------|-------|
| `branchTex` 3D texture | 96³ × 4 × 2 bytes = 14 MB | rgba16float, same format as density |
| Write grid dispatch | 96³ / (4³) = 13,824 workgroups | Same cost as existing density write |
| Raymarcher sample | +1 texture sample per ray step | Texture cache friendly (same coords) |

**Branch texture write**: ~50 µs (same as existing density grid write). Runs once per frame.

**Raymarcher overhead**: +1 `textureSample` per ray step. The raymarcher is fragment-bound, not compute-bound. At ~100 ray steps per pixel, this adds ~100 texture lookups per fragment. On modern GPUs with texture caches, the density texture and branch texture have identical access patterns (same 3D coordinates), so the second sample hits the texture cache. **Estimated impact: +5–15% on raymarcher, which is typically ~3–5 ms. So +0.15–0.75 ms/frame.**

### 4.4 Sweep Cost (Feature B only)

The MIPT sweep runs the entire TDSE evolution sequentially for each γ value. This is inherently serial and time-consuming:

| Parameter | Value | Time |
|-----------|-------|------|
| Sweep points | 20 | — |
| Steps per point (evolve + measure) | 2500 | — |
| Time per step | ~500 µs | ~480 µs baseline + ~20 µs localization |
| **Time per point** | — | **1.25 seconds** |
| **Total sweep time** | — | **~25 seconds** |

This runs in the background with a progress bar. The renderer continues showing the current wavefunction during the sweep. Each sweep point runs to completion before advancing to the next γ value.

### 4.5 Memory Budget

| Component | 64³ grid | 128³ grid | Notes |
|-----------|----------|-----------|-------|
| Existing psiRe + psiIm | 2 MB | 16 MB | Already allocated |
| Stochastic uniform | 160 B | 160 B | Constant |
| Branch texture (Feature A) | 14 MB | 113 MB | Only if branching enabled |
| **Total new** | **14 MB** | **113 MB** | — |

For 128³ grids, the branch texture is large. **Optimization**: use `rgba8unorm` instead of `rgba16float` for the branch texture — branch fractions don't need float16 precision. This reduces it to 28 MB.

Alternative: don't use a separate branch texture. Instead, encode branch information in the existing density texture's alpha channel, replacing the current raw-density encoding when branch mode is active. This uses zero additional memory but sacrifices the quantum carpet's raw density input. Since branching and carpet are unlikely to be used simultaneously, this tradeoff is acceptable. **Recommended for v1.**

### 4.6 Optimization Strategies

| Strategy | Saves | Complexity |
|----------|-------|------------|
| **Skip dispatch when γ = 0** | 100% of localization cost | Trivial (already planned) |
| **Batch collapse centers** | Dispatch overhead (64 bytes/dispatch) | Pack up to 8 centers per dispatch |
| **Reuse alpha channel for branch data** | 14–113 MB texture memory | Moderate (shader conditional) |
| **Decimate localization** | GPU time on low-end hardware | Apply localization every 2nd or 4th step instead of every step. Physics still correct for γ·dt << 1. |
| **Reduce N_loc on low-tier GPUs** | Proportional to N_loc reduction | Auto-detect via existing `performanceStore` GPU tier |
| **Share stochastic uniform with absorber BG** | 1 bind group creation | Minor refactor |
| **Sweep: skip rendering during evolution** | ~3–5 ms/frame during sweep | Render only at measurement windows |
| **Branch texture: half resolution** | 8x memory reduction | 48³ instead of 96³, bilinear filtering compensates |

### 4.7 Consumer Hardware Targets

| GPU tier | 64³ grid | 128³ grid | Notes |
|----------|----------|-----------|-------|
| Intel UHD 620 (integrated) | 60 FPS baseline, ~55 FPS with decoherence | Not recommended | Sweep: ~60s |
| Apple M1 (integrated) | 60 FPS all features | 30–45 FPS with branch tex | Sweep: ~25s |
| NVIDIA GTX 1060 | 60 FPS all features | 60 FPS all features | Sweep: ~15s |
| NVIDIA RTX 3060+ | 60 FPS all features | 60 FPS all features | Sweep: ~8s |

**Conclusion**: All features run at interactive framerates on 2018+ consumer hardware at the default 64³ grid. The 128³ grid is already a "high quality" setting that taxes integrated GPUs — stochastic localization doesn't materially change that picture.

---

## Part 5: Implementation Phases

### Phase 1: Shared Infrastructure (stochastic localization shader + dispatch)

1. Create `tdseStochasticLoc.wgsl.ts` — the WGSL compute shader
2. Create `TDSEStochasticLocalization.ts` — CPU-side orchestration (uniform packing, PRNG, dispatch)
3. Add `StochasticLocConfig` to `TdseConfig` in `src/lib/geometry/extended/tdse.ts`
4. Wire into `TDSEComputePassEvolution.ts` evolution loop (after step 7, before step 8)
5. Add pipeline + bind group creation to `TDSEComputePassSetup.ts`
6. Add store setters for γ, σ, N_loc, seed in `schroedingerSlice.ts`
7. Unit tests for PRNG determinism, norm preservation

### Phase 2: Feature A — Decoherent Branching

1. Add branch-plane logic to `tdseWriteGrid.wgsl.ts` (encode branch membership in alpha or second texture)
2. Modify raymarcher to read branch data and apply dual-color rendering
3. Add branch coherence reduction pass (cross-term ∫ψ_A*·ψ_B)
4. Create `BranchAnalysisSection.tsx` UI component
5. Add branching presets to `src/lib/physics/tdse/presets.ts`
6. E2E test: double-well branching produces separated color regions

### Phase 3: Feature B — Continuous Monitoring Transition

1. Create `monitoringSweepStore.ts` (or extend `andersonSweepStore.ts`)
2. Implement sweep orchestrator (sequential γ values, IPR accumulation)
3. Create `MonitoringDynamicsSection.tsx` UI with IPR(γ) plot
4. Add monitoring presets to `src/lib/physics/tdse/presets.ts`
5. E2E test: sweep produces IPR(γ) curve with monotonically decreasing trend

### Phase 4: Polish

1. Auto-detect GPU tier and adjust N_loc / localization decimation
2. Add URL serialization params (`sloc_g`, `sloc_s`, `sloc_n`)
3. Keyboard shortcuts for quick γ adjustment
4. Tooltip documentation for all new controls

---

## Part 6: Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| f32 precision drift from stochastic multiplications | Norm diverges over time | Medium | Existing renormalization (step 9) already corrects per-frame. Monitor in diagnostics. |
| Stochastic noise breaks FFT periodicity | Spurious artifacts at grid boundaries | Low | Localization Gaussian decays to 0 before grid edges when σ < grid_extent/4 |
| Branch coherence metric noisy at low γ | Phase diagram hard to read | Medium | Time-averaging window (T_measure) smooths fluctuations |
| No sharp transition exists in this model | IPR(γ) curve is smooth, no critical γ | Medium-high | The feature is designed to be valuable regardless: a smooth crossover is itself a finding. The UI does not promise a transition — it shows whatever the IPR(γ) curve produces. Some monitored-boson models show no MIPT under local measurements, so this outcome is plausible. |
| Consumer GPU memory pressure from branch texture | OOM on 4GB GPUs at 128³ | Low | Use alpha-channel encoding (zero extra memory) for v1 |
| PRNG quality affects physics | Correlated noise produces artifacts | Low | Use PCG hash (same as existing Anderson disorder PRNG) |

---

## Part 7: Test Plan

### 7.1 Unit Tests — PRNG and Localization Kernel

**File**: `src/tests/lib/physics/stochastic/localizationKernel.test.ts`

Pattern: follows `anderson/disorderPotential.test.ts` (deterministic PRNG, statistical quality).

```
describe('stochasticPRNG')
  - 'produces deterministic sequence from seed'
    → Two PRNG instances with seed=42 produce identical 100-value sequences.
  - 'different seeds produce different sequences'
    → Seed=1 vs seed=2: at least 1 of first 10 values differs.
  - 'values are in [0, 1) range'
    → 1000 samples all satisfy 0 ≤ v < 1.
  - 'passes chi-squared uniformity test (10 bins, p=0.001)'
    → 10,000 samples into 10 bins: χ² < 27.88 (9 dof, p=0.001 critical value).

describe('generateCollapseCenters')
  - 'returns N_loc centers within lattice bounds'
    → For gridSize=[64,64,64], all centers satisfy 0 ≤ c_d < gridSize[d].
  - 'centers are reproducible with same seed and step index'
    → Same (seed, stepIndex) → identical center array.
  - 'different step indices produce different centers'
    → Step 0 vs step 1: at least one center differs.
  - 'Gaussian noise values have correct statistics (N=10000, seed=42)'
    → Mean ≈ 0 (|mean| < 0.05), std ≈ 1 (|std - 1| < 0.05) via
       Box-Muller or ziggurat with known analytical moments.
```

### 7.2 Unit Tests — Localization Operator Mathematics

**File**: `src/tests/lib/physics/stochastic/localizationOperator.test.ts`

Pattern: follows `openQuantum/lindblad.test.ts` (operator invariants, trace/norm conservation).

These tests verify the CPU-side localization math that mirrors the WGSL shader logic. The CPU reference implementation is used both for testing and as the ground truth for the GPU shader verification in e2e tests.

```
describe('applyLocalizationStep — single site 1D')
  - 'norm is preserved after single localization step'
    → ψ = uniform 64-site wavefunction. Apply one localization at center=32, σ=2.0, γ=1.0.
      Σ|ψ_i|² before = Σ|ψ_i|² after (to 1e-10).
      Formula: factor_i = γ·dt·exp(-|x_i - x_c|²/(2σ²))·(dW - ⟨L⟩)
      where ⟨L⟩ = Σ_j |ψ_j|² · exp(-|x_j - x_c|²/(2σ²)) is the expectation.
      The expectation subtraction is what guarantees norm conservation.

  - 'localization concentrates density near collapse center'
    → ψ = uniform. Apply 100 localization steps at center=32.
      |ψ_{32}|² > |ψ_{0}|² (density shifts toward collapse center).

  - 'γ=0 produces identity operation (no change)'
    → ψ_before === ψ_after (bitwise identical).

  - 'localization preserves phase structure'
    → ψ = complex Gaussian wavepacket with momentum k₀.
      After localization, the local phase gradient darg(ψ)/dx near the
      collapse center matches k₀ to within 1% (momentum not destroyed).

  - 'larger σ produces gentler localization (wider post-step distribution)'
    → ψ = uniform. Apply same γ, same N_steps, σ=1 vs σ=5.
      IPR(σ=5) > IPR(σ=1) (wider Gaussian = less localization).

  - 'larger γ produces stronger localization'
    → ψ = uniform. Apply same σ, same N_steps, γ=0.1 vs γ=5.0.
      IPR(γ=5) < IPR(γ=0.1) (stronger monitoring = more localized).
```

### 7.3 Unit Tests — Branch Decomposition

**File**: `src/tests/lib/physics/stochastic/branchDecomposition.test.ts`

Pattern: follows `measurement.test.ts` (spatial decomposition, axis coordinate extraction).

```
describe('spatialBranchPartition')
  - 'left/right partition sums to total norm'
    → ψ arbitrary 1D (N=64). normLeft + normRight = totalNorm (to 1e-12).

  - 'symmetric wavefunction gives equal branch populations'
    → ψ = cos(πx/L) on [-L/2, L/2]. Both branches = 0.5 ± 1e-6.

  - 'wavepacket entirely in left well gives branchA ≈ 1, branchB ≈ 0'
    → ψ = Gaussian at x = -L/4 with σ << L/4. Branch A > 0.99.

  - 'partition plane at non-center position works correctly'
    → ψ = delta at site 48 on N=64 grid. Plane at site 32:
      branchA(sites 0–31) = 0, branchB(sites 32–63) = 1.

describe('branchCoherence')
  - 'coherence = 0 for non-overlapping branches'
    → ψ_A nonzero only on sites 0–31, ψ_B only on 32–63.
      Cross-term ∫ψ_A*·ψ_B = 0 (exact).

  - 'coherence = 1 for identical branches (fully coherent)'
    → ψ_A = ψ_B = ψ (same wavefunction in both regions).
      Normalized coherence |∫ψ_A*·ψ_B|² / (||ψ_A||²·||ψ_B||²) = 1.

  - 'coherence decreases monotonically under localization'
    → ψ = symmetric superposition in double-well. Apply N localization
      steps. Record coherence every 10 steps. Sequence is monotonically
      decreasing (within noise tolerance of ±0.02 per step).
```

### 7.4 Unit Tests — IPR Computation

**File**: `src/tests/lib/physics/stochastic/ipr.test.ts`

Pattern: follows `analyticalBenchmarks.test.ts` (exact analytical values, stated tolerances).

```
describe('inverseParticipationRatio')
  - 'IPR of uniform distribution = N'
    → ψ_i = 1/√N for all i. IPR = (Σ|ψ|²)² / Σ|ψ|⁴ = N² / N·(1/N²) = N.
      Exact analytical result, tolerance 1e-10.

  - 'IPR of delta function = 1'
    → ψ_i = δ_{i,k}. IPR = 1² / 1 = 1. Exact.

  - 'IPR of two equal peaks = 2'
    → ψ = (1/√2) at sites 10 and 50, 0 elsewhere.
      IPR = 1 / (2 · (1/2)²) = 2. Exact.

  - 'IPR of Gaussian wavepacket matches analytical formula'
    → ψ = exp(-x²/(4σ²)) normalized on N=256 grid.
      Continuous IPR = σ√(2π) / (σ√π) = √2 · σ_eff.
      Discrete IPR within 2% of continuous value for σ > 3 grid spacings.

  - 'normalized IPR ∈ (0, 1] for all valid wavefunctions'
    → Property test (fast-check): random ψ with random nonzero entries.
      IPR_norm = IPR/N always in (0, 1].
```

### 7.5 Property-Based Tests — Stochastic Localization Invariants

**File**: `src/tests/lib/physics/stochastic/localization.property.test.ts`

Pattern: follows `openQuantum/lindblad.property.test.ts` (fast-check, physical invariants across arbitrary inputs).

```
describe('stochastic localization physical invariants (property-based)')
  - 'norm is preserved for arbitrary ψ, γ, σ, collapse center'
    → Arbitrary: ψ (random complex, normalized), γ ∈ (0, 10],
      σ ∈ (0.5, 5), center ∈ lattice bounds, dW ~ N(0,1).
      After applyLocalizationStep: |Σ|ψ|² - 1| < 1e-6.
      Runs 200 samples.

  - 'localization is monotone in γ: higher γ → lower IPR'
    → Arbitrary: same ψ, same seed, γ₁ < γ₂.
      After 50 steps each: IPR(γ₁) ≥ IPR(γ₂) - ε (ε = 0.05 for noise).
      Runs 100 samples.

  - 'γ=0 is exact identity (bit-identical output)'
    → Arbitrary: ψ. applyLocalizationStep with γ=0 returns ψ unchanged.
      Bitwise comparison. Runs 100 samples.

  - 'real-valued ψ stays real under localization'
    → Arbitrary: ψ with all imaginary parts = 0.
      After localization: all imaginary parts remain 0.
      (The localization operator is real-valued.)
```

### 7.6 E2E Tests — Stochastic Localization GPU Pipeline

**File**: `scripts/playwright/stochastic-decoherence.spec.ts`

Pattern: follows `measurement.spec.ts` and `anderson-localization.spec.ts` (store-driven GPU pipeline, diagnostics readback, norm conservation).

```
describe('Stochastic Decoherence GPU Pipeline')

  beforeEach:
    → Navigate to tdseDynamics 3D, diagnostics enabled, double-well potential
    → waitForRendererReady, waitForShaderCompilation

  test('stochastic localization preserves norm (γ > 0, no absorber)')
    → Set γ=1.0, σ=2.0, N_loc=4, absorber=off, seed=42.
    → Evolve 300 frames.
    → Read diagnostics: |normDrift| < 0.5%.
    → Chain of trust: WGSL shader → GPU compute → renormalization →
      diagnostics readback → store assertion.
    → This verifies the WGSL localization shader preserves unitarity,
      because the renormalization step only corrects small f32 drift —
      if the shader destroyed norm by > 1%, renorm cannot hide it because
      the renorm-before/renorm-after diagnostic would show divergence.

  test('γ=0 produces identical evolution to standard TDSE')
    → Run 100 frames with γ=0, read diagnostics snapshot A.
    → Reset, run 100 frames without stochastic system loaded at all,
      read snapshot B.
    → totalNorm, maxDensity, simTime match to < 0.1%.
    → Pixel snapshot comparison: expectSnapshotsMatch.

  test('same seed produces identical diagnostics (determinism)')
    → Run 200 frames with γ=1.0, seed=42, record (totalNorm, ipr, simTime).
    → Reset, run 200 frames with same params.
    → All three values match to < 0.01%.
    → This verifies the GPU-side PRNG is deterministic (no race conditions
      in parallel shader execution affect the noise sequence).

  test('different seeds produce different IPR trajectories')
    → Run 200 frames with seed=42, record IPR.
    → Reset, run 200 frames with seed=99999.
    → IPR values differ (not identical).

  test('higher γ produces lower IPR (stronger localization)')
    → Run 200 frames with γ=0.5, record IPR_low.
    → Reset, run 200 frames with γ=5.0, same seed.
    → IPR(γ=5.0) < IPR(γ=0.5).
    → This is the core physics claim: stronger monitoring = more localized.

  test('localization concentrates wavefunction (maxDensity increases)')
    → Run 300 frames with γ=2.0 in free potential.
    → maxDensity should increase over time (localization concentrates ψ).
    → Compare maxDensity at frame 50 vs frame 250.

  test('simulation remains stable after 1000 frames with localization')
    → Run 1000 frames with γ=1.0, double-well, no absorber.
    → No NaN/Inf in diagnostics (totalNorm finite, maxDensity finite).
    → simTime advances monotonically.
    → This is a stability soak test — stochastic multiplications accumulate
      f32 error; renormalization must keep it bounded.
```

### 7.7 E2E Tests — Decoherent Branching (Feature A)

**File**: `scripts/playwright/decoherent-branching.spec.ts`

Pattern: follows `measurement.spec.ts` physics accuracy section and `anderson-localization.spec.ts` visual comparison.

```
describe('Decoherent Branching Visualization')

  beforeEach:
    → Navigate to tdseDynamics 3D, double-well potential, diagnostics on
    → Enable stochastic localization with γ=1.0
    → Enable branch visualization

  test('branch populations sum to total norm')
    → Read diagnostics: normLeft + normRight = totalNorm ± 0.1%.
    → This is the partition of unity constraint — tests the GPU reduction
      shader computes partial norms correctly with stochastic noise.

  test('coherence decays exponentially under decoherence')
    → Run 500 frames with γ=2.0, record branchCoherence every 20 frames.
    → Fit exponential C(t) = C₀·exp(-Γ·t) to the time series.
    → Γ > 0 (coherence decays, not grows).
    → R² of exponential fit > 0.8 (reasonable fit quality).
    → Γ scales approximately linearly with γ: run again with γ=4.0,
      fitted Γ₂ > Γ₁ · 1.5 (at least 50% faster decay).

  test('γ=0 produces zero branch separation (no color difference)')
    → Run 100 frames with γ=0 and branch visualization on.
    → Both branch populations ≈ 0.5 (symmetric initial state).
    → Coherence ≈ 1.0 (no decoherence).
    → Pixel snapshot: identical to standard TDSE rendering (no color encoding).

  test('asymmetric initial state produces unequal branch populations')
    → Set initial Gaussian wavepacket displaced to x < 0 (left well).
    → branchA population > 0.8 (most density in left branch).
    → branchB population < 0.2.

  test('branch plane position affects reported populations')
    → Symmetric wavefunction. Set branch plane at x = +L/4 (not center).
    → branchA (larger region) > branchB (smaller region).
    → Populations still sum to totalNorm.

  test('different potentials produce different branching dynamics')
    → Run with double-well: coherence decays to < 0.1 in 500 frames.
    → Run with free potential (no barrier): coherence stays > 0.5.
    → The potential barrier enhances branch separation — this confirms
      the localization operator interacts correctly with the potential.
```

### 7.8 E2E Tests — Continuous Monitoring Transition (Feature B)

**File**: `scripts/playwright/monitoring-transition.spec.ts`

Pattern: follows `anderson-localization.spec.ts` disorder sweep (parameter sweep, IPR readback, monotonicity).

```
describe('Continuous Monitoring Transition')

  beforeEach:
    → Navigate to tdseDynamics 3D, harmonic potential, diagnostics on

  test('IPR diagnostics produce valid values with monitoring')
    → Set γ=1.0, evolve 200 frames.
    → Read IPR from diagnostics store.
    → IPR > 0 and IPR ≤ 1 (normalized).

  test('IPR decreases with increasing γ (3-point sweep)')
    → Run 3 values: γ = 0.5, 2.0, 8.0 (same seed=42, 300 frames each).
    → Record time-averaged IPR for each.
    → IPR(0.5) > IPR(2.0) > IPR(8.0).
    → This follows from the localization operator: stronger monitoring
      concentrates the wavefunction, lowering IPR.

  test('sweep produces results across γ values (5-point manual sweep)')
    → Run γ = [0.1, 0.5, 1.0, 3.0, 10.0], 200 frames each.
    → All IPR values are distinct (not identical).
    → All IPR values are valid (> 0, ≤ 1).
    → IPR trend is monotonically decreasing (with tolerance ±0.03
      for stochastic noise at adjacent γ values).

  test('γ=0 IPR matches standard TDSE IPR (no monitoring effect)')
    → Run 200 frames with γ=0, record IPR_monitored.
    → Reset, run 200 frames standard TDSE (no stochastic system), record IPR_standard.
    → |IPR_monitored - IPR_standard| < 0.01.

  test('different potentials produce different IPR(γ) curves')
    → Harmonic potential: run γ = [0.1, 1.0, 5.0], record IPR.
    → Box potential: run same γ values, record IPR.
    → The IPR curves differ — confirming that the dynamics depend
      on the confining potential (not a numerical artifact).
    → Note: this does NOT assert a sharp transition exists. It asserts
      that the potential shape affects the monitored dynamics, which
      is expected regardless of whether a transition or crossover occurs.

  test('norm is conserved throughout the sweep')
    → Run 5-point sweep as above.
    → At each point: |normDrift| < 1%.
    → No NaN or Inf in any diagnostic value.
```

### 7.9 Test File Placement Summary

| Test File | Type | What it validates |
|-----------|------|-------------------|
| `src/tests/lib/physics/stochastic/localizationKernel.test.ts` | Unit | PRNG determinism, uniformity, collapse center generation |
| `src/tests/lib/physics/stochastic/localizationOperator.test.ts` | Unit | CPU reference: norm preservation, localization strength, phase preservation |
| `src/tests/lib/physics/stochastic/branchDecomposition.test.ts` | Unit | Spatial partition correctness, coherence calculation |
| `src/tests/lib/physics/stochastic/ipr.test.ts` | Unit | IPR against analytical values (uniform=N, delta=1, Gaussian=√2·σ) |
| `src/tests/lib/physics/stochastic/localization.property.test.ts` | Property | fast-check: norm invariance, monotonicity, identity at γ=0 |
| `scripts/playwright/stochastic-decoherence.spec.ts` | E2E | GPU pipeline: norm, determinism, localization strength, stability |
| `scripts/playwright/decoherent-branching.spec.ts` | E2E | Branching: partition of unity, coherence decay rate, visual output |
| `scripts/playwright/monitoring-transition.spec.ts` | E2E | Monitoring sweep: IPR monotonicity, potential dependence, norm conservation |

### 7.10 Chain of Trust

Each physical claim is tested at two levels:

1. **CPU reference** (unit test): The TypeScript implementation of the localization operator is verified against analytical formulas with exact tolerances. This establishes the math is correct.

2. **GPU pipeline** (e2e test): The WGSL shader produces diagnostics (via GPU readback → store) that match the CPU reference's predictions. This establishes the shader implements the math correctly.

The chain: **analytical formula → CPU unit test → WGSL shader → GPU compute → readback buffer → mapAsync → Zustand store → Playwright assertion**.

If the CPU test passes but the E2E test fails: the WGSL shader has a bug.
If both fail: the formula or the CPU implementation is wrong.
If the E2E passes but the CPU test fails: impossible (CPU test is simpler; investigate test setup).

---

## Part 8: Success Criteria

### Feature A (Branching)
- [ ] Double-well wavefunction with γ > 0 produces visually distinct colored branches within 200 timesteps
- [ ] Branch coherence metric decays exponentially with rate proportional to γ
- [ ] At γ = 0, visualization is identical to standard TDSE (no color separation)
- [ ] Runs at 60 FPS on GTX 1060 at 64³ grid

### Feature B (Monitoring Transition)
- [ ] IPR(γ) sweep produces monotonically decreasing curve (IPR decreases as γ increases)
- [ ] Sweep of 20 points completes in < 30 seconds on M1
- [ ] IPR for γ = 0 matches value from standard TDSE (no monitoring effect)
- [ ] Different potentials produce different IPR(γ) curves (confirming potential-dependence)
- [ ] The shape of the IPR(γ) curve is faithfully rendered regardless of whether it shows a sharp transition or smooth crossover

### Shared Infrastructure
- [ ] Wavefunction norm preserved to < 0.1% error over 10,000 steps with stochastic localization
- [ ] γ = 0 produces zero computational overhead (dispatch skipped entirely)
- [ ] Deterministic results with same seed
- [ ] All existing TDSE tests pass unchanged

### Test Coverage
- [ ] All 5 unit test files pass (PRNG, operator, branch decomposition, IPR, property-based)
- [ ] All 3 e2e test files pass (GPU pipeline, branching, MIPT)
- [ ] CPU reference and GPU pipeline agree on norm conservation (< 0.5% drift)
- [ ] CPU reference and GPU pipeline agree on IPR monotonicity direction
- [ ] Property-based tests run 200+ samples without violation
