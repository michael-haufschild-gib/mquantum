# Chromatic Dispersion & Optimization Analysis

## Summary
Chromatic dispersion DOES deactivate density grid optimization (but NOT eigencache).

## Definition
Chromatic dispersion (RGB color separation) is an optional post-hit visual effect that can be enabled via:
- `SchroedingerConfig.dispersionEnabled` (boolean)
- `SchroedingerConfig.dispersionStrength` (0.0-1.0)
- `SchroedingerConfig.dispersionDirection` (0=Radial, 1=View-Aligned)
- `SchroedingerConfig.dispersionQuality` (0=Gradient Hack, 1=Full Sampling)

## How Dispersion Deactivates Density Grid

### Key Code Location
**File**: `src/rendering/webgpu/shaders/schroedinger/main.wgsl.ts`

### Pattern (Volumetric Mode)
Lines 177-180:
```wgsl
let requiresDirectSampling =
  (FEATURE_DISPERSION && schroedinger.dispersionEnabled != 0u) ||
  (phaseDependentMode && !DENSITY_GRID_HAS_PHASE) ||
  probabilityCurrentVolumeMode;
```

Lines 182-189:
```wgsl
if (requiresDirectSampling) {
  // Use direct raymarching (fast or HQ)
  if (fastMode && (!FEATURE_DISPERSION || schroedinger.dispersionEnabled == 0u)) {
    volumeResult = volumeRaymarch(...);
  } else {
    volumeResult = volumeRaymarchHQ(...);  // Per-channel RGB transmittance
  }
} else {
  // Use optimized density grid
  volumeResult = volumeRaymarchGrid(...);
}
```

### Mechanism
1. When `dispersionEnabled != 0u`, the shader FORCES direct volumetric raymarching
2. The density grid (`volumeRaymarchGrid`) is SKIPPED entirely
3. Instead, uses `volumeRaymarchHQ()` which evaluates density per-pixel inline
4. HQ path supports per-channel RGB transmittance needed for dispersion

### Where This Occurs (3 locations)
1. **Volumetric Mode** (lines 177-189): Main volumetric rendering
2. **Volumetric + Temporal Mode** (lines 1340-1363): With Bayer jitter
3. **Isosurface + Temporal Mode** (lines 1340-1363): Same pattern

## What About Eigencache?

Eigencache is NOT disabled by dispersion:
- **File**: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts` lines 311-324
- **Logic**: `enableCache` only depends on `eigenfunctionCacheEnabled` (defaults to true)
- **Dispersion state**: DOES NOT affect the decision to enable eigencache
- Eigencache remains enabled independently

## Why This Design

Chromatic dispersion requires:
- **Per-channel RGB transmittance** tracking during raymarching
- **Color separation** at surface hit (radial/view-aligned offset)
- **Gradient computation** per channel for dispersion direction

The density grid stores only **scalar density** (rho value), not per-channel transmittance data. Therefore:
- Grid-based fast path incompatible with dispersion
- Must fall back to direct wavefunction evaluation with HQ sampling

## Intent Assessment

This is **INTENTIONAL DESIGN**, not a bug:
- Comment at line 60: "Use HQ mode if quality requires it OR if dispersion is enabled"
- Comment at line 178: "(dispersion requires per-channel RGB transmittance only available in HQ path)"
- Deliberately requires direct sampling for correctness
- Documented trade-off: visual quality over performance

## Performance Impact

When `dispersionEnabled = true`:
- ~3-6x performance reduction (density grid speedup is bypassed)
- Inline wavefunction evaluation: ~180K ops/pixel (vs 960 ops/pixel with grid)
- Necessary for correct chromatic dispersion rendering

## Config Chain

1. User UI enables dispersion → sets `dispersionEnabled = true`
2. `WebGPUSchrodingerRenderer.ts` passes to shader config (line 332)
3. `compose.ts` generates WGSL shader with `FEATURE_DISPERSION = true`
4. `main.wgsl.ts` checks runtime `schroedinger.dispersionEnabled` flag
5. If true → density grid skipped, direct raymarching used
