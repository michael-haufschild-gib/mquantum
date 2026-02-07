# Volumetric Blur Investigation (2026-02-07)

## Bug Description
In harmonic oscillator volumetric raymarching, complex states (more lobes/nodes) show a **smearing/blur effect** with unclean edges and blurry artifacts. The "Nodal Structure" preset (|6,2,2⟩) makes it very obvious. Disabling eigencache and/or temporal reprojection does NOT fix it.

## Root Cause Analysis (3 identified)

### Root Cause 1: canonicalDensityCompensation creates extreme opacity saturation
- `computeCanonicalCompensation()` in `WebGPUSchrodingerRenderer.ts` computes ratio between old "visual damping" and canonical normalization
- For |6,2,2⟩: compensation was ~61,000×, effective densityGain ~122,000
- Entire volume becomes opaque blob, hiding internal structure

### Root Cause 2: HQ path tetrahedral stencil averages density (spatial lowpass)
- `sampleWithTetrahedralGradient()` in `integration.wgsl.ts:48-65` averages 4 off-center samples
- Acts as blur filter at nodal zero-crossings
- **RULED OUT**: User confirmed no visual difference between eigencache on/off. With eigencache ON, analytical gradient path is used (no tetrahedral averaging). Since both paths look identical, tetrahedral blur is NOT the dominant issue.

### Root Cause 3: HO-specific early ray termination cuts off outer lobes
- 5 consecutive samples < 1e-8 → terminates entire ray
- With adaptive 4× stepping near nodes, spans ~5 units, larger than lobe spacing

## Fixes Implemented

### Fix 1: Replace ratio-based compensation with peak-density auto-normalization
**File**: `WebGPUSchrodingerRenderer.ts` method `computeCanonicalCompensation()`
- Old: ratio product of damp/(alphaNorm*norm) per dimension → exponential blowup
- New: Numerically computes peak |ψ|² using Hermite polynomial evaluation, then sets compensation = -ln(1-TARGET_ALPHA) / (peakRho × estimatedStepLen) / DEFAULT_DENSITY_GAIN
- TARGET_ALPHA = 0.7 (was 0.3 initially, raised because lobes looked like translucent clouds)
- TYPICAL_SAMPLES = 64, estimatedStepLen = 2*boundingRadius/64

### Fix 3: Removed HO-specific early ray termination
**File**: `integration.wgsl.ts` fast path `volumeRaymarch()`
- Removed `lowDensityCount`, `allowEarlyExit` variables and the early exit block (lines 692-694, 729-737)
- Gaussian envelope skip already handles the tail region

## What We Tried That Did NOT Help (DO NOT RETRY THESE)
1. **Reducing skip/adaptive-step aggressiveness** (pre-existing attempt) → no change
2. **Raising sample budget caps** (pre-existing attempt) → no change
3. **Making nodal-density floor opt-in / disabling it** (pre-existing attempt, AND retried in this session across all 3 paths: fast/HQ/grid) → no change
4. **Raising TARGET_ALPHA from 0.3 to 0.7** → no change (peaks already opaque)
5. **Disabling adaptive stepping entirely** (both fast + HQ paths) → no change
6. **Moving compensation after bounding radius update** → fixed stale boundR but no visual change
7. **Reducing GAUSSIAN_MARGIN from 4.0 to 2.5** (tighter bounding sphere) → no visual change
8. **Fixing TYPICAL_SAMPLES from 64 to 32** → corrected compensation math but no visual change
9. **Disabling nodal plane softening floor** (all 3 paths) → no change (user explicitly stated this was already tried before)

## Key Confirmed Facts
- Actual shader sampleCount: 96 (base=32, scaled by radiusScale=3.4, capped at 96)
- Actual stepLen: 0.142 units (fine enough for H₆ lobes ~1.0 unit wide)
- Peaks ARE properly opaque regardless of compensation tuning
- No visual difference between eigencache on/off → tetrahedral averaging NOT the cause
- No visual difference from ANY opacity/stepping/floor change → blur is NOT from opacity, stepping, or density floor
- The blur must come from something entirely different: emission/coloring, temporal cloud pass, post-processing, or the wavefunction evaluation itself

## NOT YET INVESTIGATED
- Temporal cloud pass (runs before schroedinger pass in render graph)
- Emission computation (`computeEmissionLit`) — could introduce spatial smoothing
- Post-processing (bloom, tonemap) — could blur fine structure
- The actual wavefunction evaluation quality at high quantum numbers
- Screen-space effects / resolution
- Whether the "blur" is actually correct physics (volumetric rendering of a smooth wavefunction)
- Compare fast path vs HQ path directly (force one or the other)

## Current Debug State (TEMPORARY CODE IN PLACE)

### Debug logs (MUST REMOVE when done):
1. `WebGPUSchrodingerRenderer.ts` line ~920: `[DEBUG density]` log before dirty-flag check — shows compensation/effective values every ~200 frames
2. `WebGPUSchrodingerRenderer.ts` inside `computeCanonicalCompensation()`: `[DEBUG compensation]` log — shows peakDensity, boundR, stepLen, neededGain (fires once on preset change)

### Adaptive stepping disabled (MUST RESTORE when done):
- `integration.wgsl.ts` fast path (~line 740): replaced adaptive step block with `let adaptiveStep = min(stepLen, tFar - t);`
- `integration.wgsl.ts` HQ path (~line 1008): same replacement
- Original code: `stepMultiplier = 4.0 if sCenter < -12, 2.0 if sCenter < -8`

## Key Discovery: Stale Bounding Radius
- `computeCanonicalCompensation` was originally called at line 1049 BEFORE bounding radius update (lines 1058+)
- Fixed by moving compensation to AFTER bounding radius update, gated on `needsPresetRegen`
- But compensation value (426) is STILL higher than expected (~145 by hand calculation)
- **Awaiting**: `[DEBUG compensation]` console output to see actual peakDensity/boundR/stepLen values

## Key Observation
User says "no change" to BOTH target alpha increase (0.3→0.7) AND adaptive step disable. This suggests either:
- The compensation is still producing massive effective densityGain that saturates opacity regardless of target
- OR the blur source is something entirely different from opacity/stepping

## Diagnostic Output from User
- `sampleCount: 32` (not 64 as assumed in TYPICAL_SAMPLES)
- `[DEBUG density] compensation: 426.2980 userGain: 2 effective: 852.5959`
- Awaiting `[DEBUG compensation]` output with peakDensity breakdown

## File Locations
- Renderer: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- Raymarching shader: `src/rendering/webgpu/shaders/schroedinger/volume/integration.wgsl.ts`
- Density computation: `src/rendering/webgpu/shaders/schroedinger/quantum/density.wgsl.ts`
- Hermite polynomials: `src/rendering/webgpu/shaders/schroedinger/quantum/hermite.wgsl.ts`
- 1D HO eigenfunction: `src/rendering/webgpu/shaders/schroedinger/quantum/ho1d.wgsl.ts`
- Eigencache: `src/rendering/webgpu/shaders/schroedinger/quantum/eigenfunctionCache.wgsl.ts`
- Absorption: `src/rendering/webgpu/shaders/schroedinger/volume/absorption.wgsl.ts`
- Density grid sampling: `src/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl.ts`
- Presets: `src/lib/geometry/extended/schroedinger/presets.ts`

## Nodal Plane Softening (unconditional, both paths)
- Fast path line ~812: `effectiveRho = max(effectiveRho, 5e-4 * cloudDepth * cloudDepth)`
- HQ path line ~1084: `nodalFloorHQ = 5e-4 * cloudDepthHQ * cloudDepthHQ; softRhoRGB = max(rhoRGB, vec3f(nodalFloorHQ))`
- NO toggle — always active in both paths
