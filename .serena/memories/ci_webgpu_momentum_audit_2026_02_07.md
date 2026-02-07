# CI-WebGPU Audit: Momentum Representation (2026-02-07)

## Fixes Applied

### 1. Bounding Radius for Momentum Space (CRITICAL)
- **Problem**: Position-space bounding radius was used for momentum rendering → terrible visual quality (e.g., hydrogen n=4: R=48 in position vs ~1.5 in momentum)
- **Fix**: Added `computeHOMomentumBoundingRadius()` and `computeHydrogenMomentumBoundingRadius()` in `boundingRadius.ts`
- **HO momentum**: R_k = (sqrt(2n+1) + margin) * sqrt(ω) / kScale (reciprocal of position formula)
- **H momentum**: R_k = 6.0 / (n * a₀ * kScale)
- Updated `computeBoundingRadius()` dispatch to accept `representation` and `momentumScale` params
- Updated renderer call site and tests (22 tests pass)

### 2. Single-Pass Momentum Evaluation (PERFORMANCE)
- **Problem**: `evalPsiWithSpatialPhase` called `evalHarmonicOscillatorPsiMomentum` twice (once with t, once with t=0)
- **Fix**: Single-pass loop in both `psiBlockHarmonic` and `psiBlockDynamicHarmonic` that accumulates spatial-only and time-dependent sums simultaneously
- Saves ~50% of per-sample compute cost for superposition states

### 3. Skip Eigenfunction Cache in Momentum Mode (PERFORMANCE)
- **Problem**: Cache compute pass dispatched GPU work even though momentum path never reads the cache
- **Fix**: Added `representation !== 'momentum'` check before `cachePass.execute(ctx)` in renderer
- `updateFromUniforms()` still called to keep version tracking fresh

### 4. Remove Unnecessary Momentum Sample Budget (QUALITY)
- **Problem**: 0.65x sample scale and cap=64 for momentum mode (was compensating for double evaluation and wrong bounding radius)
- **Fix**: Removed momentum-specific reduction. Both modes now use same budget (baseSampleCount * radiusScale, cap=96)
- Probability current overlay limits (line density 3, step size 0.02, steps 8) kept — those are independently justified

### 5. Eigenfunction Cache Coordinate Fix
- **Problem**: Compute shader stored at sample-center positions (+0.5 offset), fragment shader expected regular grid (no offset)
- **Fix**: Changed compute shader from `(sampleIdx + 0.5) / SAMPLES` to `sampleIdx / (SAMPLES - 1)`

## Audited (No Changes Needed)
- Density grid compute pass: correctly handles momentum (uniform buffer includes representationMode)
- Probability current: correct ∇_k computation via finite differences, 4x subsampling for momentum
- Hydrogen ND momentum: correct Fock form, Gegenbauer polynomials, extra dimension HO dual
- Nodal surfaces: transparent dispatch via evalPsi
- Isosurface ray march: adaptive stepping works with momentum density
- Phase materiality: clean data flow, correct alignment
- Interference fringing: consistent spatial phase usage
- Uncertainty boundary: proper async readback, double-precision CDF, graceful fallbacks
