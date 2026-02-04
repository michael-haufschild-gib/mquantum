# Julia Distance Field Gallery

## Status: Future Feature (Deferred)

This document describes a planned optimization for preset Julia set viewing. It is **not** part of the current implementation scope.

---

## Overview

The Julia Distance Field Gallery is a precomputation strategy that eliminates runtime raymarching for viewing preset Quaternion Julia sets. Instead of iterating the fractal formula at every ray step, the renderer samples from a precomputed 3D distance field texture.

## Problem Statement

Current Julia rendering performs expensive per-pixel computation:

```
For each pixel:
  For each raymarch step (50-200 iterations):
    Evaluate Julia SDF:
      For each fractal iteration (8-16):
        quatPow(q, power)  // ~20 FLOPs
        quatMul(q, q) + c  // ~16 FLOPs
      Compute escape distance
```

This results in **~50,000+ FLOPs per pixel** for a typical configuration, making real-time rendering challenging on mobile devices and integrated GPUs.

## Proposed Solution

### Precomputation Phase (Build Time)

For each preset Julia constant `c`:

1. Define a 3D bounding volume (typically `[-2, 2]^3`)
2. Generate a 3D grid at resolution 256³ or 512³
3. At each grid point, compute the exact distance to the Julia set surface
4. Store as a compressed binary blob (~32-128 MB per preset)

### Runtime Phase

Replace the iterative SDF with a texture lookup:

```glsl
// Before: ~50,000 FLOPs
float julia_sdf(vec3 p) {
  vec4 z = vec4(p, 0.0);
  for (int i = 0; i < MAX_ITER; i++) {
    z = quatPow(z, uPower) + uC;
    if (dot(z, z) > BAILOUT) break;
  }
  return 0.5 * length(z) * log(length(z)) / length(gradient);
}

// After: ~10 FLOPs
float julia_sdf_lut(vec3 p) {
  vec3 uv = (p - uBoundsMin) / (uBoundsMax - uBoundsMin);
  return texture(uDistanceFieldLUT, uv).r * uDistanceScale;
}
```

### Expected Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| FLOPs per pixel | ~50,000 | ~10 | 5000x |
| Frame time (1080p) | 16-33ms | 2-4ms | 4-8x |
| Mobile feasibility | Limited | Full | Enabled |

## Trade-offs

### Advantages

- **Massive speedup**: Near-instant rendering for preset viewing
- **Consistent performance**: Independent of fractal complexity
- **Mobile-friendly**: Enables smooth 60fps on phones/tablets

### Limitations

- **Preset-only**: Only works for precomputed constants
- **Storage cost**: ~32-128 MB per preset (8 presets = 256MB-1GB)
- **Resolution limit**: Grid resolution caps detail level
- **No animation**: Changing `c` requires different LUT
- **No exploration**: Interactive parameter changes not supported

## Use Cases

This optimization is ideal for:

1. **Preset gallery browsing** - Users selecting from curated Julia sets
2. **Mobile app versions** - Where compute is limited
3. **Thumbnail generation** - Quick previews of many presets
4. **Educational displays** - Fixed demonstrations

Not suitable for:

1. **Interactive exploration** - Tweaking `c` in real-time
2. **Animation** - Morphing between Julia sets
3. **High-zoom exploration** - LUT resolution limits zoom depth

## Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Build Pipeline                        │
├─────────────────────────────────────────────────────────┤
│  scripts/tools/generate-julia-luts.mjs                  │
│    ├── Iterate preset constants                          │
│    ├── Generate 256³ distance field per constant         │
│    ├── Compress with LZ4 or zstd                         │
│    └── Output to public/cache/julia/*.bin               │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   Runtime Loading                        │
├─────────────────────────────────────────────────────────┤
│  JuliaLUTManager                                         │
│    ├── Load blob on preset selection                     │
│    ├── Decompress to Float32Array                        │
│    ├── Upload to WebGL Data3DTexture                     │
│    └── Cache in IndexedDB for future sessions           │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Shader Integration                    │
├─────────────────────────────────────────────────────────┤
│  julia-lut.glsl.ts                                       │
│    ├── uniform sampler3D uJuliaDistanceField             │
│    ├── uniform bool uUseLUT                              │
│    └── Trilinear texture sampling with scale/offset      │
└─────────────────────────────────────────────────────────┘
```

## File Size Estimates

| Resolution | Raw Size | Compressed | Notes |
|------------|----------|------------|-------|
| 128³ | 8 MB | 2-4 MB | Low detail, mobile |
| 256³ | 64 MB | 16-32 MB | Standard quality |
| 512³ | 512 MB | 128-256 MB | High detail |

Recommendation: Start with 256³ for balance of quality and download size.

## Implementation Checklist (Future)

- [ ] Create `scripts/tools/generate-julia-luts.mjs` generator
- [ ] Define preset Julia constants in `src/lib/geometry/julia/presets.ts`
- [ ] Implement `JuliaLUTManager` with texture lifecycle
- [ ] Add `julia-lut.glsl.ts` shader module
- [ ] Integrate with existing `QuaternionJuliaMesh.tsx`
- [ ] Add UI toggle for LUT vs. realtime mode
- [ ] Create preset gallery component
- [ ] Add compression/decompression utilities
- [ ] Update manifest and cache infrastructure

## References

- [Distance Field Textures for Font Rendering](https://steamcdn-a.akamaihd.net/apps/valve/2007/SIGGRAPH2007_AlphaTestedMagnification.pdf) - Valve, 2007
- [Precomputed Distance Fields for Games](https://www.gamedev.net/tutorials/programming/graphics/precomputed-distance-fields-for-games-r5007/) - GameDev.net
- [3D Distance Field Generation](https://shaderbits.com/blog/distance-field-generation) - ShaderBits

---

*Document created: 2025-12-18*
*Status: Deferred - not included in current performance optimization sprint*
