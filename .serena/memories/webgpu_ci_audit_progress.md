# WebGPU CI Audit Progress

## Session Date: 2026-02-05

### Bugs Found and Fixed

1. **Post-processing pass ordering** (WebGPUScene.tsx)
   - WebGPU had: Refraction→Bokeh→GodRays→Bloom
   - WebGL has: GodRays→Bloom→Bokeh→Refraction
   - FIXED: Reordered to match WebGL

2. **Tonemapping store wiring** (TonemappingPass.ts)
   - Read `postProcessing.tonemappingMode` (doesn't exist)
   - Should read `lighting.toneMappingAlgorithm` (string) + `lighting.toneMappingEnabled` (boolean)
   - FIXED: Changed to read from lighting store with string→enum mapping

3. **Missing Cineon tonemapping** (tonemapping.wgsl.ts)
   - WebGL supports Cineon but WebGPU shader had no case
   - FIXED: Added cineonTonemap() and case 4

4. **Missing AgX and Neutral tonemapping** (TonemappingPass.ts + tonemapping.wgsl.ts)
   - UI offers 6 algorithms but WebGPU only had 4
   - AgX and Neutral silently fell back to ACES
   - FIXED: Added AgX (mode 5) and Neutral (mode 6) with full WGSL implementations

5. **GroundPlane store key bug** (WebGPUGroundPlaneRenderer.ts)
   - Read `ctx.frame.stores['ground']` - no such key registered
   - Ground data lives in `useEnvironmentStore` registered as `'environment'`
   - Result: Ground plane NEVER rendered (activeWalls always undefined)
   - FIXED: Changed all 4 occurrences from 'ground' to 'environment'

6. **GroundPlane section color hardcoded** (WebGPUGroundPlaneRenderer.ts)
   - Section color hardcoded to '#808080'
   - WebGL derives it from grid color (lighten by 15%)
   - FIXED: Now computes section color from grid color

7. **BlackHole color store key bug** (WebGPUBlackHoleRenderer.ts)
   - Read `ctx.frame.stores['color']` - no such key
   - Color data lives in `useAppearanceStore` registered as `'appearance'`
   - Also had wrong field structure: `cosineA.r` instead of `cosineCoefficients.a[0]`
   - FIXED: Changed to use existing `appearance` variable with correct field access

### Audited and Verified Correct

- **CinematicPass** - Store wiring correct (cinematicVignette, cinematicAberration, cinematicGrain from postProcessing)
- **BloomPass** - All 5 bloom params wired correctly, 3.0x composite multiplier, lerpBloomFactor all correct
- **Polytope model matrix** - Correctly applied in vertex shader
- **MandelbulbRenderer** - All store keys and fields correct, no critical bugs
- **QuaternionJuliaRenderer** - Store keys correct, ior/transmission/thickness are dead code with safe defaults
- **TubeWireframeRenderer** - All store keys and fields correct, no bugs
- **PolytopeRenderer** - Material uniforms correct, quality buffer bound but unused (polytope is mesh-based)
- **JetsRenderPass** - Store wiring correct, time is in seconds (no ms conversion needed), physics correct

8. **Schrodinger aoColor/nodalColor NaN bug** (WebGPUSchrodingerRenderer.ts)
   - Read hex strings as arrays: `aoColor?.[0]` on '#000000' → NaN
   - FIXED: Use `this.parseColor()`

9. **Schrodinger aoSteps→aoQuality** (WebGPUSchrodingerRenderer.ts) - FIXED

10. **Schrodinger phaseEnabled→phaseAnimationEnabled** (WebGPUSchrodingerRenderer.ts) - FIXED

11. **Schrodinger distPower→distribution.power** (WebGPUSchrodingerRenderer.ts) - FIXED

12. **Schrodinger transform.scale→uniformScale** (WebGPUSchrodingerRenderer.ts) - FIXED

13. **PaperTexturePass missing store reads** (PaperTexturePass.ts)
   - Missing: paperSeed, paperColorFront, paperColorBack, paperQuality
   - FIXED: Added all 4 store reads with proper hexToRGBA and qualityToNumber conversions

### Known Issues (Not Yet Fixed - Require Larger Refactors)

#### SSR Pass
- Uses simplified inline shader instead of complete ssr.wgsl.ts
- Missing store reads: ssrThickness, ssrFadeStart, ssrFadeEnd, ssrQuality
- Missing shader features: Fresnel, thickness-based hit detection, smoothstep fading, edge fade, half-res, quality presets, output modes
- Complete WGSL port exists at ssr.wgsl.ts but is NOT imported

#### GTAO Pass
- Custom simplified AO instead of Three.js GTAOPass algorithm
- No Poisson denoising (output will be noisier)
- No half-resolution pipeline
- Missing ssaoEnabled dynamic check (only at graph build time)

#### GroundPlane (Structural)
- Only renders single floor quad (no back/left/right/top walls)
- No IBL (image-based lighting)
- No shadow maps
- No MRT output (invisible to SSAO/SSR)
- No polygon offset (potential z-fighting)
- groundPlaneSizeScale not dynamically updated

### Unregistered Store Keys Found
All fixed except:
- `'bufferPreview'` in BufferPreviewPass.ts (debug-only, low impact, gracefully degrades)
- `'mandelbulb'` in MandelbulbSDFGridPass.ts (compute pass not active in pipeline)
- `'julia'` in JuliaSDFGridPass.ts (compute pass not active in pipeline)
