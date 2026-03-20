# Shader & Compute Optimization Plan — Evidence-Based

**Audience**: Senior shader engineer performing GPU performance optimization.
**Prerequisite**: Density oracle e2e tests pass (`npx playwright test physics-density-oracle.spec.ts --workers=1`).

Every change must pass the density oracle AND the benchmark must show measurable improvement. No speculative optimization.

---

## 0. Measured Baseline (2026-03-19, Apple Silicon, Metal, 960x600 dev server)

### Analytic Modes — Uncapped FPS

GPU timestamps are per-pass deltas (cumulative timestamps differenced). Frame time includes JS/browser overhead.

| Mode | FPS | Frame (ms) | `schroedinger` (ms) | Post-proc (ms) | GPU total (ms) |
|-|-|-|-|-|-|
| HO 3D | 70 | 13.0 | 0.82 | 0.19 | 1.01 |
| HO 5D | 68 | 13.4 | 3.19 | 0.32 | 3.51 |
| HO 7D | 67 | 13.5 | 3.40 | 0.30 | 3.69 |
| HO 9D | 66 | 13.6 | 1.95 | 0.18 | 2.14 |
| HO 11D | 67 | 13.5 | 2.22 | 0.14 | 2.36 |
| Hydrogen 3D | 66 | 13.4 | 1.15 | 0.18 | 1.33 |
| Hydrogen 5D | 65 | 13.9 | 1.77 | 0.23 | 2.00 |
| Hydrogen 7D | 68 | 13.4 | 1.74 | 0.20 | 1.94 |
| Hydrogen 9D | 66 | 13.8 | 1.78 | 0.23 | 2.01 |
| Hydrogen 11D | 66 | 13.8 | 2.16 | 0.23 | 2.39 |

### Compute Modes — Uncapped FPS, Per-Preset

| Scenario | FPS | `schroedinger` (ms) | Post (ms) | CPU (ms) |
|-|-|-|-|-|
| **TDSE: false vacuum decay** (6 steps/frame) | **63** | **4.18** | 0.09 | 0.18 |
| TDSE: periodic lattice (4 steps) | 67 | 3.27 | 0.07 | 0.17 |
| BEC: single vortex | 69 | 3.23 | 0.03 | 0.18 |
| FSF: gaussian packet (default) | 65 | 3.22 | 0.20 | 0.14 |
| FSF: Mexican hat (lambda=1.0) | 72 | 2.93 | 0.20 | 0.12 |
| BEC: vortex dipole | 68 | 2.84 | 0.03 | 0.19 |
| BEC: quantum turbulence (8 steps) | 66 | 2.77 | 0.02 | 0.22 |
| TDSE: double slit (8 steps) | 70 | 2.62 | 0.41 | 0.18 |
| BEC: attractive (collapse) | 67 | 2.54 | 0.08 | 0.19 |
| BEC: ground state (default) | 64 | 2.43 | 0.04 | 0.19 |
| TDSE: classic tunneling (4 steps) | 70 | 1.97 | 0.03 | 0.16 |
| Dirac: zitterbewegung (8 steps) | 63 | 1.96 | 0.07 | **0.37** |
| TDSE: bubble nucleation (6 steps) | 67 | 1.92 | 0.03 | 0.17 |
| Dirac: Klein paradox (4 steps) | 64 | 1.79 | 0.02 | 0.22 |
| Dirac: relativistic hydrogen | 62 | 1.77 | 0.03 | 0.21 |
| Dirac: barrier tunneling | 62 | 1.65 | 0.02 | 0.18 |
| FSF: vacuum noise | 70 | 1.38 | 0.09 | 0.13 |
| FSF: vacuum + Mexican hat + 8 steps | 71 | 1.30 | 0.09 | 0.12 |

### What the Numbers Say

1. **All modes run 62-72 FPS uncapped.** GPU total is 1-4ms against a 16ms frame budget. The GPU has 4-12x headroom. **We are not GPU-bound on this hardware.**

2. **The 11ms gap** (14ms frame - 3ms GPU = 11ms overhead) is consistent across ALL modes. This is JS frame loop + browser compositor + Vite dev server HMR. A production build would narrow this gap significantly.

3. **`schroedinger` pass is 80-94% of GPU time** in every mode. Post-processing is < 0.4ms everywhere. Optimizing bloom/tonemapping/SMAA is pointless.

4. **TDSE false vacuum decay is the heaviest** at 4.18ms — 6 split-step FFT cycles per frame on a 64^3 grid. This is the most interesting compute optimization target.

5. **Dimension scaling is non-monotonic** for analytic modes. HO 5D (3.19ms) > HO 11D (2.22ms). Likely caused by different default quantum states and bounding radii, not dimension cost per se.

6. **Dirac zitterbewegung has the highest CPU cost** (0.37ms) — 4-component spinor setup overhead on the JS side.

7. **FSF with 8 steps + Mexican hat is paradoxically the lightest** (1.30ms). The 32^3 default grid means FFT dispatch overhead dominates over compute — the GPU is underutilized.

### Implication for Optimization

**On this hardware at this viewport, no shader change will produce visible FPS improvement.** The entire optimization plan below applies when:
- Running a **production build** (eliminates ~8ms JS/HMR overhead)
- At **higher resolution** (1920x1080+ where GPU fill rate becomes the bottleneck)
- On **weaker GPUs** (integrated graphics, mobile, older discrete)
- With **larger grid sizes** (128^3+ for compute modes)

The optimizations are still valid engineering — they just won't show in the benchmark until the JS overhead is removed.

---

## 0.1 Profiling Commands

```bash
# Analytic modes (HO, hydrogen) — uncapped FPS, writes test-results/benchmark.json
npx playwright test scripts/playwright/benchmark.spec.ts --workers=1

# Compute modes per-preset — uncapped FPS, JSON to stdout
npx playwright test scripts/playwright/compute-mode-profiling.spec.ts --workers=1

# Save baseline for comparison
cp test-results/benchmark.json test-results/benchmark-baseline.json
```

### Per-Optimization Verification Loop

For every change:

1. Run density oracle: `npx playwright test scripts/playwright/physics-density-oracle.spec.ts --workers=1`
2. Run benchmark: `npx playwright test scripts/playwright/benchmark.spec.ts --workers=1`
3. Compare `test-results/benchmark.json` against baseline
4. If oracle fails: revert. If benchmark regresses: understand why before reverting.
5. If both pass and improve: commit, update baseline.

---

## 1. Compute Mode FFT Dispatch Optimization

**Target**: TDSE, BEC (the heaviest modes at 2.5-4.2ms)
**Impact**: Depends on FFT implementation — could be 20-50% if dispatch overhead dominates.
**Effort**: Medium.

### Why This First

TDSE false vacuum (4.18ms) and BEC vortex (3.23ms) are the measured GPU-heaviest configurations. Both use split-step FFT on a 64^3 grid. Each "step per frame" dispatches: forward FFT → potential/nonlinear half-step → inverse FFT → density grid write. At 6 steps/frame, that's 12 FFT dispatches + 6 potential dispatches + 1 density write = 19 compute dispatches per frame.

### What to Investigate

1. **FFT workgroup size**: Is it tuned for the target grid (64^3)? Suboptimal workgroup size wastes lanes.
2. **FFT dispatch count**: 3D FFT on 64^3 requires multiple passes (x, y, z). How many dispatches per FFT? Can axes be fused?
3. **Barrier overhead**: Each `dispatchWorkgroups` has ~5-10us dispatch overhead on Metal. At 19 dispatches, that's ~0.1-0.2ms of pure overhead.
4. **Can multiple simulation steps share a single density grid write?** Currently each step may trigger a grid write. If only the final step's density matters for rendering, skip intermediate writes.

### Files to Read

| File | What to look for |
|-|-|
| `src/rendering/webgpu/passes/TDSEComputePass.ts` | FFT dispatch structure, steps-per-frame loop |
| `src/rendering/webgpu/passes/FreeScalarFieldComputePass.ts` | Same for FSF |
| `src/rendering/webgpu/passes/DensityGridComputePass.ts` | Is density written every step or once per frame? |
| WGSL FFT shaders | Workgroup size, shared memory usage |

---

## 2. FSF Grid Size vs Dispatch Overhead

**Target**: Free Scalar Field (paradoxically light at 1.3ms with 8 steps)
**Impact**: Either expose the problem (increase grid) or confirm it's fine.

### The Anomaly

FSF with vacuum noise + Mexican hat + 8 steps/frame (1.30ms) is lighter than FSF gaussian packet default (3.22ms). This is backwards — more work should cost more GPU time.

Hypothesis: FSF defaults to 32^3 grid. At 32^3, each FFT axis pass processes 32^2 = 1024 workgroups. The GPU is under-occupied — dispatch overhead and pipeline bubbles dominate over actual compute. The "heavier" config might use a different grid size or the initial condition changes the compute path.

### What to Investigate

1. Read `src/lib/geometry/extended/freeScalar.ts` default `gridSize`
2. Check if different initial conditions change the grid size
3. Profile FSF at 64^3 and 128^3 explicitly to see if GPU time scales as N^3 or has a fixed floor

---

## 3. Fused Gaussian Envelope for HO Density Grid

**Target**: HO modes (0.8-3.4ms in `schroedinger` pass)
**Measured context**: HO 5D at 3.19ms is the heaviest analytic mode.

### The Optimization

`ho1D()` computes `exp(-0.5 * u^2)` independently per dimension. For D-dimensional product wavefunctions, D `exp()` calls can be fused into 1.

**File**: `src/rendering/webgpu/shaders/schroedinger/quantum/ho1d.wgsl.ts`

```
Current:  hoND loop → D × ho1D() → D × exp()
Proposed: hoND loop → D × (hermite + norm) → 1 × exp(sum)
```

### Caveat (from adversarial review)

The fused version changes the early exit behavior. Currently `polyProduct` includes the Gaussian damping, so it shrinks fast and the `abs(polyProduct) < 1e-10` check exits early for voxels in the Gaussian tail. The fused version accumulates the polynomial product WITHOUT the Gaussian, making it larger — the early exit triggers later.

For high dimensions where most voxels are in the tail, the early exit may save more than the exp() fusion gains. **Profile both versions** — don't assume the fusion helps.

### Estimated Gain

Based on measured HO 5D at 3.19ms: if the density grid compute is ~2ms of that (rest is raymarch), and exp() fusion saves ~15% of compute, the gain is ~0.3ms. At 67 FPS, that moves to ~68 FPS. **Not visible on this hardware**, but relevant at higher resolution.

---

## 4. Temporal Caching Gap: Basis Uniform Recompute

**Status**: Mostly already implemented. The gap is narrower than originally planned.

`DensityGridComputePass.needsUpdate()` already skips recomputation for static states. But `updateBasisUniforms()` (line 462-473) sets `needsRecompute = true` whenever the N-dimensional rotation basis changes — which happens every frame during auto-rotation or camera drag.

**The actual optimization**: determine whether the density grid needs recomputation when only the basis changes. If the density is evaluated in basis-space (rotated coordinates), the basis change requires recomputation. If the raymarch handles the rotation via view matrix, it doesn't.

**File**: `src/rendering/webgpu/passes/DensityGridComputePass.ts` — read `updateBasisUniforms()` and trace how basis vectors affect the density compute shader.

---

## 5. Gradient Precomputation (Revised Estimate)

**Target**: `schroedinger` pass (raymarch portion)
**Revised impact**: ~0.1ms savings (was overstated as 15-25% in original plan)

### Corrected Numbers

- Not all pixels hit the sphere (~30% screen coverage at 960x600 = ~173K pixels)
- Gradient only computed for visible samples (alpha > 0.001, ~15% of ray samples)
- Actual gradient calls: ~1.7M, not 53M as originally estimated
- At 6 texture fetches × ~5 cycles each: ~50M cycles = ~0.03ms

**This is not worth the complexity** of a new compute pass at current resolution. Re-evaluate at 4K.

---

## 6. Macro-Cell Occupancy Skip (Revised)

**Revised impact**: Marginal over existing `EMPTY_SKIP_FACTOR = 4.0`.

The existing empty-skip already jumps 4 step lengths through empty regions with 2 probe fetches. A macro-cell bitmask would skip ~6 voxel-widths per cell. Net improvement over current skip: ~10-15%, on the raymarch portion which is itself only 30-50% of the `schroedinger` pass.

**At current measured GPU times**: saving 10% of 1ms = 0.1ms. Not worth the infrastructure (new texture, new compute pass, new bind group).

**Revisit when**: rendering at 4K or on a GPU where the raymarch exceeds 5ms.

---

## 7. Micro-Optimizations

These are quick, low-risk, but individually < 0.05ms savings.

| ID | Optimization | File | Est. Savings |
|-|-|-|-|
| 7a | Hoist `f32(ll)` in Legendre loop | `legendre.wgsl.ts:90` | 0.006ms |
| 7b | Conditional `atan2` when phase unused | `psi.wgsl.ts:144` + `compose.ts` | 0.02ms |
| 7c | Strength-reduce `pow()` in blackbody | `emission.wgsl.ts` | ~0 (only algo 5) |

Do these only as cleanup during other shader work. Not worth standalone commits.

---

## Priority Matrix (Evidence-Based)

| Priority | What | Why | When |
|-|-|-|-|
| **1** | Profile production build at 1080p | Current dev server bottleneck is JS, not GPU | Before any shader work |
| **2** | Investigate FFT dispatch structure for TDSE/BEC | Heaviest measured pass (4.18ms) | If production build shows GPU-bound |
| **3** | Investigate FSF grid size anomaly | 32^3 may be under-utilizing GPU | Quick investigation |
| **4** | Fused Gaussian for HO (with early-exit benchmark) | Largest analytic mode cost (3.19ms) | If HO at 1080p is GPU-bound |
| **5** | Basis uniform recompute gap | Free win for interactive rotation | Always |
| Defer | Gradient precompute, macro-cell skip, micro-opts | < 0.1ms each at current resolution | At 4K or on weak GPU |

---

## Safety Net

Before starting, verify the safety net works:

```bash
# 1. Density oracle — all tests pass
npx playwright test scripts/playwright/physics-density-oracle.spec.ts --workers=1

# 2. Physics coverage — all pixel tests pass
npx playwright test scripts/playwright/physics-coverage.spec.ts --workers=1

# 3. Unit tests — all polynomial/normalization tests pass
npx vitest run src/tests/lib/physics/analyticalBenchmarks.test.ts

# 4. Mutation test: change HO_NORM[0] in ho1d.wgsl.ts from 1.0 to 1.5
#    Verify density oracle FAILS. Revert after confirming.
```

If step 4 does not fail, the safety net has a hole. Do not proceed until the oracle catches the intentional mutation.
