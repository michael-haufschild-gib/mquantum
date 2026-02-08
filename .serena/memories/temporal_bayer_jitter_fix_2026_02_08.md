# Temporal Accumulation Jitter Fix (2026-02-08)

## Root Cause
The temporal reconstruction shader (`reconstruction.wgsl.ts`) treated pixels differently
based on Bayer offset position: "rendered" pixels (1/4, matching current Bayer offset)
got 15% current + 85% history blend, while "non-rendered" pixels (3/4) used pure history
or spatial interpolation. This binary distinction created a visible 4-frame pattern
(Bayer shimmer/jitter) because:

1. Each frame, different 1/4 of pixels update - visible checkerboard pattern shifts
2. During animation, history is stale (reprojection only has camera motion vectors,
   not time-evolution motion vectors) - 3/4 of pixels show old wavefunction state
3. At 60fps, the 4-frame Bayer cycle creates ~15Hz flicker

Affects BOTH volumetric AND isosurface modes (both use temporal when enabled by default).
Visible with animations on OR off.

## Fixes Applied

### Fix 1: Reconstruction shader - eliminate Bayer shimmer (CORE FIX)
Changed `reconstruction.wgsl.ts` so ALL pixels use spatial interpolation from
current quarter-res as primary source, then blend uniformly with clamped history.
No more binary "rendered vs not-rendered" distinction.

### Fix 2: Static scene freeze (WebGPUTemporalCloudPass + Renderer)
Freezes frameIndex/bayerOffset cycling after one 4-frame cycle when scene is static.

### Fix 3: Film grain time source (ToneMappingCinematicPass)
Uses animation.accumulatedTime instead of wall-clock time for grain noise seed.

## Files Modified
- `src/rendering/webgpu/shaders/temporal/reconstruction.wgsl.ts`
- `src/rendering/webgpu/passes/WebGPUTemporalCloudPass.ts`
- `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`
- `src/rendering/webgpu/passes/ToneMappingCinematicPass.ts`