# WebGPU Gap Analysis (2026-01-24)

## Summary
- **GLSL Shaders**: 168 files
- **WGSL Shaders**: 131 files  
- **Coverage**: ~78%
- **Critical Gaps**: ~20 files, ~10 user-visible features

---

## P0 - Visual Parity Blockers

### BlackHole Renderer
1. **doppler.wgsl** - Missing Tanner Helland blackbody algorithm, temperature profile, LUT support
2. **disk-sdf.wgsl** - Missing `getAlgorithmColor()` and lighting mode support
3. **shell.wgsl** - Missing `shellStepModifierWithMask()` and transmittance logic
4. **Jets** - Different architecture (dedicated pass vs integrated shader)
5. **God Rays** - Missing post-processing implementation

### Schrödinger Renderer
1. **sdf4d-11d.wgsl** - Missing 8 files for high-dimensional SDF
2. **volume/absorption.wgsl** - Missing volumetric absorption
3. **volume/integration.wgsl** - Missing volume integration
4. **temporal/reconstruction.wgsl** - Missing temporal reconstruction
5. **temporal/reprojection.wgsl** - Missing temporal reprojection

### TubeWireframe Renderer
1. **main.wgsl** - Missing main fragment shader

---

## P1 - Quality/Feature Differences

### Post-Processing (8 files missing)
- godRays.wgsl
- gravitationalLensing.wgsl
- jetVolumetric.wgsl
- normalComposite.wgsl
- screenSpaceLensing.wgsl
- frameBlending.wgsl
- cloudComposite.wgsl
- Bokeh/DOF shader

### Mandelbulb/Julia
- power.wgsl variant shader
- Phase shift implementation varies

### Feature Simplifications
- Temporal shader signature changed (explicit vs implicit uniforms)
- Constants removed HQ/LQ preprocessor macros

---

## P2 - Nice-to-have

- Polytope simple transform (optimization)
- Paper texture effect
- Cinematic effects shader
- GTAO bilateral upsample
- Buffer preview shader

---

## Store Parameter Consumption

| Renderer | WebGL Params | WebGPU Consumed | Gap |
|----------|--------------|-----------------|-----|
| BlackHole | 80+ | ~70 (partial) | Doppler/Jets |
| Mandelbulb | 67 | 80+ | Covered |
| Julia | 69 | 85+ | Covered |
| Schrödinger | 90+ | ~50 | High-D missing |
| Polytope | 40+ | 40+ | Covered |
| TubeWireframe | 45+ | 60+ | Main missing |

---

## Action Items for 100% Parity

1. Port BlackHole Doppler with full Tanner Helland algorithm
2. Port BlackHole disk-sdf with color algorithm selector
3. Port BlackHole shell with transmittance logic
4. Implement Jets rendering in WebGPU
5. Implement God Rays post-processing
6. Port Schrödinger SDF 4D-11D (8 files)
7. Port Schrödinger volume absorption/integration
8. Port Schrödinger temporal reprojection
9. Port TubeWireframe main shader
10. Port missing post-processing shaders (7 files)
