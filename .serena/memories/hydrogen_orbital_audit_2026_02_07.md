# Hydrogen Orbital Audit - 2026-02-07

## Changes Made

### 1. Condon-Shortley Phase Fix (hydrogenNDCommon.wgsl.ts)
- **Bug**: `fastRealSphericalHarmonic` (l≤2) uses chemistry convention (no CS phase), but `realSphericalHarmonic` (l>2) uses physics convention (with CS phase via `legendre()`). This caused a sign discontinuity at l=3 boundary.
- **Fix**: In `evalHydrogenNDAngular` and new `evalHydrogenNDAngularDirect`, undo CS phase for l>2: `if ((abs(m) & 1) == 1) { Y = -Y; }`
- **Convention**: Chemistry convention (no CS phase) used throughout for visualization consistency.

### 2. acos+cos Round-Trip Elimination (Performance)
- **Files**: sphericalHarmonics.wgsl.ts, hydrogenNDCommon.wgsl.ts, hydrogenNDVariants.wgsl.ts
- **Optimization**: Pre-compute `cosTheta = z/r` and `sinTheta = sqrt(x²+y²)/r` from Cartesian coordinates. Pass directly to angular functions, eliminating the `acos(z/r)` → `cos(acos(z/r))` round-trip.
- **New functions**: `fastRealSphericalHarmonicDirect(l, m, ct, st, phi)`, `evalHydrogenNDAngularDirect(l, m, cosTheta, sinTheta, phi, useReal)`
- **Savings**: ~50 GPU cycles per ray sample (acos + cos = two transcendentals)
- **Coverage**: Both `generateHydrogenNDBlock` and `generateHydrogenNDCachedBlock` updated.

## Verified Correct (No Changes Needed)
- Hydrogen radial R_nl(r): normalization, Laguerre recurrence, exponential decay
- Laguerre polynomials: three-term recurrence, numerically stable
- Legendre polynomials: upward recurrence with CS phase
- Spherical harmonics normalization: factorial LUT for l≤6
- hydrogenRadialEarlyExit: simple threshold check (conservative but free)
- Bounding radius: 3n²a₀ (≈1.5× classical turning point, reasonable)
- Uniform buffer wiring: all hydrogen fields correctly written (principalN, azimuthalL, magneticM, bohrRadius, useRealOrbitals, etc.)
- Shader composition: correct block ordering, all dependencies satisfied
- HO consistency: extra-dimension HO functions use same ho1D() as standalone mode
- Phase coloring: spatial phase at t=0 prevents animation flicker
- Origin handling: ρ^l→0 for l>0, denominator guards for r=0

## Future Optimization Opportunities
- Precompute `hydrogenRadialNorm(n,l,a0)` on CPU (saves ~30 cycles/sample but requires uniform buffer layout change)
- hydrogenRadialEarlyExit never fires for n≤8 (bounding cube is smaller than threshold) - harmless dead branch
- Vestigial `phaseEnabled`/`phaseTheta`/`phasePhi` fields in uniform struct: declared but never read by any WGSL shader
