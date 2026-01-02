# Black Hole Optimization & Feature Report

**Date:** 2025-12-21
**Author:** Codex (CLI)
**Status:** Implemented

## 20 Interstellar-Style Features Implemented

1.  **Volumetric Accretion Disk:** Replaced thin surface with full volumetric raymarching.
2.  **Ridged Multifractal Noise:** Used for the "electric filigree" and plasma look.
3.  **Domain Warping:** Fluid-like distortion for the accretion flow.
4.  **Blackbody Temperature Gradient:** Physically based color shift from blue-white (hot inner) to red-orange (cool outer).
5.  **Relativistic Doppler Beaming:** Intensity boost for approaching material ($I \propto D^3$).
6.  **Gravitational Redshift:** Spectral shift and dimming near the event horizon.
7.  **N-Dimensional Lensing:** Gravity scales correctly with dimension ($N^\alpha$).
8.  **Kerr Frame Dragging:** Azimuthal spacetime drag for rotating black holes.
9.  **Photon Shell Glow:** Volumetric emission accumulation near the photon sphere.
10. **Interleaved Gradient Noise Dithering:** High-quality dithering to remove banding.
11. **Dust Lanes:** Sine-wave modulated dark bands in the accretion disk.
12. **Soft Edges:** Gaussian vertical falloff and smooth radial fade.
13. **Streak Texture:** Coordinate mapping with high radial / low angular frequency.
14. **Differential Rotation:** Inner parts of the noise texture rotate faster (Keplerian).
15. **Bloom Boost:** Uniform control to overdrive brightness for HDR glow.
16. **Edge Glow:** Post-process style glow integrated into the raymarcher.
17. **Adaptive Step Sizing:** Steps scale with distance from hole and density.
18. **Early Exit Optimization:** Raymarching stops when transmittance drops to zero.
19. **Fast Mode Octave Reduction:** Noise complexity scales with performance settings.
20. **Isosurface/Volumetric Hybrid:** Code supports both (via defines), currently optimized for volumetric.

## 10 Performance Optimizations Implemented

1.  **Interleaved Gradient Noise:** Replaced expensive sin-hash dithering with fast texture-free noise.
2.  **Early Transmittance Exit:** Loop breaks immediately when `accum.transmittance < 0.01`.
3.  **Height-Based Early Exit:** `getDiskDensity` returns 0.0 immediately if far from the disk plane.
4.  **Bounds Check Early Exit:** `getDiskDensity` skips noise calculation if outside radial bounds.
5.  **Fast Mode Step Relaxation:** `stepSize` limit in disk increased from 0.05 to 0.1 in Fast Mode.
6.  **Fast Mode Octaves:** FBM noise reduces from 5 to 2 octaves in Fast Mode.
7.  **Optimized Power Function:** `lensing.glsl` avoids `pow()` when `uDistanceFalloff` is standard (2.0).
8.  **Cached Uniforms:** `useBlackHoleUniformUpdates` caches color conversions to avoid per-frame work.
9.  **Pre-calculated Dimension Power:** `uDimPower` ($N^\alpha$) calculated on CPU, not per-pixel.
10. **Pre-calculated Origin Offset:** `uOriginOffsetLengthSq` calculated on CPU for N-D distance.

## Architecture Notes

- **Shader Composition:** Modular blocks in `src/rendering/shaders/blackhole/` allow easy toggling of features.
- **State Management:** `blackholeSlice.ts` clamps values to safe ranges to prevent shader explosions.
- **Testing:** Playwright tests verified application load and uniform syncing, though software rendering limitations prevented full screenshot validation.
