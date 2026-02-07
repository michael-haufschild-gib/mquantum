# Momentum-Space Eigenfunction Cache (2026-02-07)

## What Was Done
Enabled the existing eigenfunction cache infrastructure for HO momentum rendering.

### Key Physics Insight
Momentum-space HO eigenfunctions: `φ(k) = ho1D(n, k, 1/ω)` — identical function, reciprocal width.
The domain formula automatically produces k-space bounds when ω → 1/ω:
- `k_tp = sqrt(2n+1) * sqrt(ω)`, `margin = 4 * sqrt(ω)`

### Files Modified
1. **EigenfunctionCacheComputePass.ts**: Added `representation` to config, `isMomentum` flag. `deduplicateFromUniforms()` uses `effectiveOmega = 1/omega` for momentum.
2. **WebGPUSchrodingerRenderer.ts**: `useDensityGrid = enableCache && isHydrogen` (not isMomentum). `useEigenfunctionCache = enableCache && !(isMomentum && isHydrogen)`. Passes representation to cache config. Removed momentum guard in execute().
3. **psi.wgsl.ts**: `generatePsiBlockHarmonic()` and `generatePsiBlockDynamic()` accept `{ cachedMomentum?: boolean }`. When true, momentum inner loops use `ho1DCached(getEigenFuncIdx(termIdx, j), kCoord)` instead of `ho1D(n, kCoord, reciprocalOmega)`. Backward-compatible const aliases preserved.
4. **compose.ts**: `useCachedMomentum = useCache && isMomentumMode` passed to psi block generators.

### Unchanged Files
- Compute shader (`eigenfunctionCache.wgsl.ts`): `computeHo1D(n, x, omega)` is generic
- Fragment shader cache lookup (`eigenfunctionCache.wgsl.ts`): `ho1DCached()` is coordinate-agnostic
- Cached ND variants (`hoNDVariants.wgsl.ts`): work unchanged
- Density grid compute: uses inline evaluation, unaffected
- Hydrogen momentum: still uses density grid (separate task)
