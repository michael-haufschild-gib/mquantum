# N-Dimensional Visualizer - Shader Code Quality & Optimization Report

## Executive Summary
- Overall assessment: The shader stack is advanced and feature-rich, with sophisticated raymarching, volumetrics, and post-processing. Most modules are well-structured, but several heavy passes (black hole volumetrics, SSR, temporal reconstruction) dominate GPU cost.
- Key findings: (1) Raymarch/volumetric passes are the primary GPU hotspots; (2) Post-processing with multi-tap sampling is the main bandwidth driver; (3) Shared math/utility modules are clean but should continue to gate expensive paths behind quality settings.
- Priority recommendations: Introduce stronger quality tiers and resolution scaling for the heaviest passes, reduce multi-tap sampling where possible, and formalize early-out heuristics for raymarch + temporal.

## Methodology
- Static code inspection of all shader and shader-module files in `src/rendering/shaders` and `src/rendering/materials/skybox`.
- Metrics considered: loop counts, texture fetch density, transcendental math usage (pow/exp/trig), branching complexity, and explicit performance guards (fast/quality paths).
- Ratings: Code Quality (maintainability/readability/robustness) and Performance Optimization Level (existing mitigations vs. observed cost drivers).

## Detailed Analysis By Category

### 1. Post-Processing Shaders
#### `src/rendering/shaders/postprocessing/BilateralUpsampleShader.ts`
- Code Quality Assessment: 8/10 — looping control flow, multi-texture sampling.
- Performance Optimization Level: 6/10 — 5 texture lookups, 2 loops.
- Specific Optimizations Available: Reuse depth samples between center and corner taps where possible; precompute linear depth in a low-res buffer; allow a fast-path that skips depth weighting when threshold is large.
- Visual Impact: Fast-path may slightly blur across depth edges but is acceptable for low-contrast reflections.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Moderate bandwidth pressure; reducing taps or sampling at lower res could save ~10–25%.

#### `src/rendering/shaders/postprocessing/BokehShader.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block, looping control flow, multi-texture sampling.
- Performance Optimization Level: 5/10 — 25 texture lookups, 7 loops.
- Specific Optimizations Available: Add explicit quality tiers per method (disc 17 taps, jittered 25 taps, separable 2x9 taps, hex ring samples) and default to separable on mid/low GPUs; precompute kernel offsets into a uniform array to reduce ALU; consider half-res with bilateral upsample for large aperture values.
- Visual Impact: Reducing taps will soften bokeh highlights and can introduce grain; separable blur reduces polygonal bokeh but preserves overall DOF impression.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: High bandwidth pressure; reducing taps could save ~20–40% texture reads for this pass.

#### `src/rendering/shaders/postprocessing/BufferPreviewShader.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 7/10 — 1 texture lookups.
- Specific Optimizations Available: Debug-only: keep as-is; ensure it is excluded from production render passes.
- Visual Impact: Debug-only; not part of production visuals.
- FPS Impact: Debug-only; runtime impact depends on developer usage.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/postprocessing/CinematicShader.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 8/10 — 3 texture lookups.
- Specific Optimizations Available: Disable film grain at low intensity, and merge chromatic + vignette operations into fewer texture samples when distortion is near zero.
- Visual Impact: Minimal; film grain removal changes stylization more than image fidelity.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/postprocessing/DeferredLensingShader.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 6/10 — 5 texture lookups.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels., Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Moderate bandwidth pressure; reducing taps or sampling at lower res could save ~10–25%.

#### `src/rendering/shaders/postprocessing/GTAOBilateralUpsampleShader.ts`
- Code Quality Assessment: 8/10 — looping control flow, multi-texture sampling.
- Performance Optimization Level: 8/10 — 4 texture lookups, 2 loops.
- Specific Optimizations Available: Optionally reuse AO/depth taps when AO intensity is low; allow a single-pass upsample without depth weighting for fast mode; batch linear depth into a shared buffer.
- Visual Impact: Fast-path reduces AO edge fidelity; acceptable in motion or when AO intensity is low.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Moderate bandwidth pressure; reducing taps or sampling at lower res could save ~10–25%.

#### `src/rendering/shaders/postprocessing/PaperTextureShader.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block, looping control flow, multi-texture sampling.
- Performance Optimization Level: 6/10 — 6 texture lookups, 8 loops, heavy transcendental math.
- Specific Optimizations Available: Reduce FBM/roughness loop counts in low/medium quality; pre-bake noise layers into a small tileable texture; skip crumple/fold layers when intensity is near zero.
- Visual Impact: Lower octave counts soften fine paper grain; overall paper feel remains with large-scale fibers and folds retained.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: Moderate bandwidth pressure; reducing taps or sampling at lower res could save ~10–25%.

#### `src/rendering/shaders/postprocessing/RefractionShader.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 5/10 — 13 texture lookups.
- Specific Optimizations Available: Skip depth-based normal reconstruction when a valid normal buffer exists; avoid 5 depth taps for pixels with invalid depth; clamp chromatic aberration to a small threshold and reuse computed offsets.
- Visual Impact: Reducing depth taps has minimal impact if G-buffer normals are available; chromatic reduction slightly lessens fringe color.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: High bandwidth pressure; reducing taps could save ~20–40% texture reads for this pass.

#### `src/rendering/shaders/postprocessing/SSRShader.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block, looping control flow, multi-texture sampling.
- Performance Optimization Level: 6/10 — 12 texture lookups, 1 loops.
- Specific Optimizations Available: Introduce hierarchical depth (Hi-Z) or coarse depth mip for early ray termination; cap maxSteps dynamically by roughness and distance; prefer half-res SSR for glossy surfaces with bilateral upsample; consider using G-buffer normals exclusively to avoid depth reconstruction cost.
- Visual Impact: Lower step counts can cause missed reflections or shorter rays; can be masked with roughness fading and fallback probes.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: High bandwidth pressure; reducing taps could save ~20–40% texture reads for this pass.

### 1.1 Post-Processing GLSL Modules
#### `src/rendering/shaders/postprocessing/cloudComposite.glsl.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 7/10 — 2 texture lookups.
- Specific Optimizations Available: Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/postprocessing/environmentComposite.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow, multi-texture sampling.
- Performance Optimization Level: 6/10 — 5 texture lookups, 2 loops.
- Specific Optimizations Available: Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Moderate bandwidth pressure; reducing taps or sampling at lower res could save ~10–25%.

#### `src/rendering/shaders/postprocessing/frameBlending.glsl.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 7/10 — 2 texture lookups.
- Specific Optimizations Available: Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/postprocessing/godRays.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow, multi-texture sampling.
- Performance Optimization Level: 7/10 — 3 texture lookups, 1 loops.
- Specific Optimizations Available: Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/postprocessing/gravitationalLensing.glsl.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 6/10 — 7 texture lookups.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels., Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: Moderate bandwidth pressure; reducing taps or sampling at lower res could save ~10–25%.

#### `src/rendering/shaders/postprocessing/jetVolumetric.glsl.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block, looping control flow, multi-texture sampling.
- Performance Optimization Level: 8/10 — 3 texture lookups, 1 loops, heavy transcendental math.
- Specific Optimizations Available: Introduce transmittance-based early-outs and integrate at half-res with depth-aware upsample where acceptable., Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture., Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Reducing steps or noise octaves will slightly reduce fine detail and depth richness; can be mitigated with temporal accumulation or dithering.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/postprocessing/normalComposite.glsl.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 7/10 — 3 texture lookups.
- Specific Optimizations Available: Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/postprocessing/screenSpaceLensing.glsl.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block, multi-texture sampling.
- Performance Optimization Level: 5/10 — 9 texture lookups.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels., Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: High bandwidth pressure; reducing taps could save ~20–40% texture reads for this pass.

### 2. Black Hole Shaders
#### `src/rendering/shaders/blackhole/compose.ts`
- Code Quality Assessment: 8/10 — large, multi-stage shader block.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size., Introduce transmittance-based early-outs and integrate at half-res with depth-aware upsample where acceptable., Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture.
- Visual Impact: Lower tap counts can soften bokeh shape and reduce highlight definition; separable blur keeps blur smooth but may lose hex/bokeh character.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/blackhole/main.glsl.ts`
- Code Quality Assessment: 6/10 — large, multi-stage shader block, looping control flow, multi-texture sampling.
- Performance Optimization Level: 8/10 — 1 texture lookups, 1 loops.
- Specific Optimizations Available: Leverage tighter scene bounds for early escape, reduce max steps based on screen-space error, and separate fast-path for far-field rays; consider half-res raymarch + temporal resolve.
- Visual Impact: Lower step counts slightly reduce fine lensing detail and shell crispness; temporal accumulation can preserve perceived quality.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/blackhole/uniforms.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture., Expose quality tiers to reduce tap count and prefer separable filters for large kernels., Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/blackhole/effects/deferred-lensing.glsl.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 6/10 — 5 texture lookups.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels., Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Moderate bandwidth pressure; reducing taps or sampling at lower res could save ~10–25%.

#### `src/rendering/shaders/blackhole/effects/motion-blur.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 8/10 — 1 loops.
- Specific Optimizations Available: Expose quality tiers to reduce tap count and prefer separable filters for large kernels.
- Visual Impact: Lower tap counts can soften bokeh shape and reduce highlight definition; separable blur keeps blur smooth but may lose hex/bokeh character.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/blackhole/gravity/colors.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/blackhole/gravity/disk-sdf.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size., Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/blackhole/gravity/disk-volumetric.glsl.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block.
- Performance Optimization Level: 8/10 — heavy transcendental math.
- Specific Optimizations Available: Further gate high-frequency noise behind quality tiers, precompute warp/noise textures, and reduce integration steps for low opacity regions.
- Visual Impact: Fine filament detail will soften; large-scale disk shape and color remain intact.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/blackhole/gravity/doppler.glsl.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 7/10 — 1 texture lookups.
- Specific Optimizations Available: Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/blackhole/gravity/horizon.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/blackhole/gravity/lensing.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/blackhole/gravity/manifold.glsl.ts`
- Code Quality Assessment: 8/10 — large, multi-stage shader block, looping control flow, multi-texture sampling.
- Performance Optimization Level: 8/10 — 1 texture lookups, 1 loops.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture., Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/blackhole/gravity/shell.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

### 3. Skybox Shaders
#### `src/rendering/shaders/skybox/compose.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/main.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture., Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/types.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/core/constants.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/core/precision.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/core/uniforms.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/core/varyings.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/effects/sun.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/effects/vignette.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/modes/aurora.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/modes/classic.glsl.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 8/10 — 1 texture lookups.
- Specific Optimizations Available: Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/skybox/modes/crystalline.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 3 loops.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/modes/horizon.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/modes/nebula.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/modes/ocean.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 1 loops, heavy transcendental math.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture., Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Smaller PCF kernels can introduce sharper edges or banding; best mitigated with per-light quality scaling.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/modes/twilight.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/utils/noise.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 8/10 — 1 loops.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/utils/rotation.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/skybox/utils/color.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/materials/skybox/SkyboxShader.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

### 4. Object Type Shaders (Polytope, Julia, Mandelbulb, Schrödinger)

#### Polytope

#### `src/rendering/shaders/polytope/compose.ts`
- Code Quality Assessment: 6/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 8/10 — 2 loops.
- Specific Optimizations Available: Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Smaller PCF kernels can introduce sharper edges or banding; best mitigated with per-light quality scaling.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/polytope/transform-nd-simple.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 8/10 — 2 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/polytope/transform-nd.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 8/10 — 2 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### Julia

#### `src/rendering/shaders/julia/compose.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size., Clamp history with neighborhood variance and reduce reprojection taps when motion is low., Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Reducing steps or noise octaves will slightly reduce fine detail and depth richness; can be mitigated with temporal accumulation or dithering.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/dispatch.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/main.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/power.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/quaternion.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/uniforms.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/sdf/sdf3d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 2 loops.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/sdf/sdf4d.glsl.ts`
- Code Quality Assessment: 8/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 7/10 — 2 loops.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/sdf/sdf5d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/sdf/sdf6d.glsl.ts`
- Code Quality Assessment: 8/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/sdf/sdf7d.glsl.ts`
- Code Quality Assessment: 8/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/sdf/sdf8d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 2 loops.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/sdf/sdf9d.glsl.ts`
- Code Quality Assessment: 8/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/sdf/sdf10d.glsl.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/julia/sdf/sdf11d.glsl.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### Mandelbulb

#### `src/rendering/shaders/mandelbulb/compose.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size., Clamp history with neighborhood variance and reduce reprojection taps when motion is low., Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Reducing steps or noise octaves will slightly reduce fine detail and depth richness; can be mitigated with temporal accumulation or dithering.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/dispatch.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/main.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/power.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/uniforms.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/sdf/sdf3d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/sdf/sdf4d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/sdf/sdf5d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/sdf/sdf6d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/sdf/sdf7d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/sdf/sdf8d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 6 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/sdf/sdf9d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/sdf/sdf10d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/sdf/sdf11d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/mandelbulb/sdf/sdf-high-d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 14 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### Schrödinger

#### `src/rendering/shaders/schroedinger/compose.ts`
- Code Quality Assessment: 6/10 — large, multi-stage shader block.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size., Introduce transmittance-based early-outs and integrate at half-res with depth-aware upsample where acceptable., Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture.
- Visual Impact: Reducing steps or noise octaves will slightly reduce fine detail and depth richness; can be mitigated with temporal accumulation or dithering.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/dispatch.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/main.glsl.ts`
- Code Quality Assessment: 6/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 8/10 — 3 loops.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size., Introduce transmittance-based early-outs and integrate at half-res with depth-aware upsample where acceptable., Clamp history with neighborhood variance and reduce reprojection taps when motion is low.
- Visual Impact: Reducing steps or noise octaves will slightly reduce fine detail and depth richness; can be mitigated with temporal accumulation or dithering.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/power.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/uniforms.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture., Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/complex.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/density.glsl.ts`
- Code Quality Assessment: 6/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 8/10 — 3 loops.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture., Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/hermite.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/hydrogenRadial.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 2 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/hydrogenNDVariants.glsl.ts`
- Code Quality Assessment: 8/10 — large, multi-stage shader block.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/ho1d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 8/10 — 2 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/hoNDVariants.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/hoSuperpositionVariants.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/hydrogenPsi.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/laguerre.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 1 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/legendre.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 3 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/psi.glsl.ts`
- Code Quality Assessment: 8/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 7/10 — 3 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/sphericalHarmonics.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 8/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/hydrogenND/hydrogenNDCommon.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/hydrogenND/index.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/quantum/index.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/sdf/sdf3d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/sdf/sdf4d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/sdf/sdf5d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/sdf/sdf6d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/sdf/sdf7d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/sdf/sdf8d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 8 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/sdf/sdf9d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/sdf/sdf10d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/sdf/sdf11d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 2 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/sdf/sdf-high-d.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 6/10 — 10 loops, heavy transcendental math.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/temporal/index.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Clamp history with neighborhood variance and reduce reprojection taps when motion is low.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/temporal/reprojection.glsl.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 6/10 — 10 texture lookups.
- Specific Optimizations Available: Clamp history with neighborhood variance and reduce reprojection taps when motion is low., Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: High bandwidth pressure; reducing taps could save ~20–40% texture reads for this pass.

#### `src/rendering/shaders/schroedinger/temporal/reconstruction.glsl.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block, looping control flow, multi-texture sampling.
- Performance Optimization Level: 6/10 — 13 texture lookups, 2 loops.
- Specific Optimizations Available: Reduce neighborhood tap count when motion is low; add history clamping and variance tracking to avoid ghosting without extra taps.
- Visual Impact: Slightly more noise in fast motion; overall stability improves with variance clamping.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: High bandwidth pressure; reducing taps could save ~20–40% texture reads for this pass.

#### `src/rendering/shaders/schroedinger/temporal/uniforms.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Clamp history with neighborhood variance and reduce reprojection taps when motion is low.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/volume/index.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Introduce transmittance-based early-outs and integrate at half-res with depth-aware upsample where acceptable.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/volume/absorption.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/volume/emission.glsl.ts`
- Code Quality Assessment: 6/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 8/10 — 3 loops.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture., Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels., Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/schroedinger/volume/integration.glsl.ts`
- Code Quality Assessment: 6/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 8/10 — 2 loops.
- Specific Optimizations Available: Introduce step-size adaptation based on density gradients, early-out on low transmittance, and optional half-res integration with spatial upsample.
- Visual Impact: Fewer steps can reduce micro-structure in volumetric lobes; macro shapes remain with temporal smoothing.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.


### 5. Infrastructure Shaders (Groundplane, Tubewireframe)
#### `src/rendering/shaders/tubewireframe/compose.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Smaller PCF kernels can introduce sharper edges or banding; best mitigated with per-light quality scaling.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/tubewireframe/main.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 1 loops.
- Specific Optimizations Available: Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Smaller PCF kernels can introduce sharper edges or banding; best mitigated with per-light quality scaling.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/tubewireframe/uniforms.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/tubewireframe/vertex.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 8/10 — 2 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/groundplane/compose.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Smaller PCF kernels can introduce sharper edges or banding; best mitigated with per-light quality scaling.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/groundplane/grid.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/groundplane/main.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 1 loops.
- Specific Optimizations Available: Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Smaller PCF kernels can introduce sharper edges or banding; best mitigated with per-light quality scaling.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/groundplane/vertex.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

### 6. Shared Shader Modules
#### `src/rendering/shaders/shared/types.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture., Clamp history with neighborhood variance and reduce reprojection taps when motion is low., Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/core/constants.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/core/precision.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/core/uniforms.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Clamp history with neighborhood variance and reduce reprojection taps when motion is low., Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/lighting/ggx.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/lighting/ibl.glsl.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 8/10 — 1 texture lookups.
- Specific Optimizations Available: Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/shared/lighting/multi-light.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/lighting/sss.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Reduce noise octaves or replace high-frequency noise with a small LUT/tiling noise texture., Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/math/safe-math.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/raymarch/core.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 8/10 — 1 loops.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size., Clamp history with neighborhood variance and reduce reprojection taps when motion is low.
- Visual Impact: Reducing steps or noise octaves will slightly reduce fine detail and depth richness; can be mitigated with temporal accumulation or dithering.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/raymarch/normal.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 8/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/raymarch/sphere-intersect.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/fractal/main.glsl.ts`
- Code Quality Assessment: 8/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 8/10 — 1 loops.
- Specific Optimizations Available: Add tighter bounding volumes/empty-space skipping and reduce max steps based on distance or screen size., Clamp history with neighborhood variance and reduce reprojection taps when motion is low., Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Reducing steps or noise octaves will slightly reduce fine detail and depth richness; can be mitigated with temporal accumulation or dithering.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/fractal/compose-helpers.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Clamp history with neighborhood variance and reduce reprojection taps when motion is low., Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Smaller PCF kernels can introduce sharper edges or banding; best mitigated with per-light quality scaling.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/color/selector.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/color/selectorVariants.glsl.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/color/cosine-palette.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/color/hsl.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/color/oklab.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/depth/customDepth.glsl.ts`
- Code Quality Assessment: 6/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 7/10 — 12 loops.
- Specific Optimizations Available: Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Smaller PCF kernels can introduce sharper edges or banding; best mitigated with per-light quality scaling.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/features/ao.glsl.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/features/shadows.glsl.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 8/10 — 1 loops.
- Specific Optimizations Available: Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness.
- Visual Impact: Smaller PCF kernels can introduce sharper edges or banding; best mitigated with per-light quality scaling.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/shared/features/shadowMaps.glsl.ts`
- Code Quality Assessment: 6/10 — large, multi-stage shader block, looping control flow, multi-texture sampling.
- Performance Optimization Level: 6/10 — 8 texture lookups, 6 loops.
- Specific Optimizations Available: Reduce PCF kernel size or use VSM/ESM for fewer texture reads at similar softness., Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Smaller PCF kernels can introduce sharper edges or banding; best mitigated with per-light quality scaling.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: Moderate bandwidth pressure; reducing taps or sampling at lower res could save ~10–25%.

#### `src/rendering/shaders/shared/features/temporal.glsl.ts`
- Code Quality Assessment: 8/10 — multi-texture sampling.
- Performance Optimization Level: 8/10 — 3 texture lookups.
- Specific Optimizations Available: Clamp history with neighborhood variance and reduce reprojection taps when motion is low., Use mip bias or lower-res inputs for far-field samples to cut bandwidth.
- Visual Impact: Low to moderate; most optimizations trade micro-detail for performance.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: Low bandwidth pressure; limited savings (~5–10%) from fewer samples or lower-res inputs.

#### `src/rendering/shaders/palette/cosine.glsl.ts`
- Code Quality Assessment: 8/10 — large, multi-stage shader block.
- Performance Optimization Level: 7/10 — heavy transcendental math.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/palette/palette.glsl.ts`
- Code Quality Assessment: 8/10 — compact and focused logic.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/palette/index.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/palette/presets.ts`
- Code Quality Assessment: 6/10 — large, multi-stage shader block.
- Performance Optimization Level: 7/10 — low per-pixel cost.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: Lower distortion primarily reduces fringe artifacts; core image quality remains intact.
- FPS Impact: Potential +5–20% within this pass; overall frame +2–6% depending on effect usage and resolution.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/palette/types.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/transforms/index.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/transforms/ndTransform.ts`
- Code Quality Assessment: 7/10 — large, multi-stage shader block, looping control flow.
- Performance Optimization Level: 7/10 — 13 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential +2–8% within this pass; overall frame +1–3%.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/constants.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/dimensionColors.ts`
- Code Quality Assessment: 8/10 — looping control flow.
- Performance Optimization Level: 7/10 — 1 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: Minimal; palette math optimizations should be visually neutral if coefficients remain consistent.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/index.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — low per-pixel cost.
- Specific Optimizations Available: Expose quality tiers to reduce tap count and prefer separable filters for large kernels., Skip chromatic/aberration branches when strength is near zero and share base UV computations across channels.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

#### `src/rendering/shaders/types.ts`
- Code Quality Assessment: 9/10 — primarily declarative/utility with minimal control flow.
- Performance Optimization Level: 9/10 — 1 loops.
- Specific Optimizations Available: No major runtime optimizations; focus on maintainability and keeping uniforms/pipeline minimal.
- Visual Impact: No direct visual impact; structural/definitional module.
- FPS Impact: Potential <1–2% overall; mostly ALU/bandwidth neutral.
- Memory Bandwidth Impact: No texture bandwidth impact; primarily ALU-bound.

## Performance Optimization Summary Table
| Shader | Current FPS Impact | Optimized FPS | Bandwidth Savings | Visual Tradeoff |
| --- | --- | --- | --- | --- |
| `src/rendering/shaders/postprocessing/BilateralUpsampleShader.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/postprocessing/BokehShader.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/postprocessing/BufferPreviewShader.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/postprocessing/CinematicShader.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/postprocessing/DeferredLensingShader.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/postprocessing/GTAOBilateralUpsampleShader.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/postprocessing/PaperTextureShader.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/postprocessing/RefractionShader.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/postprocessing/SSRShader.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/postprocessing/cloudComposite.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/postprocessing/environmentComposite.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/postprocessing/frameBlending.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/postprocessing/godRays.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/postprocessing/gravitationalLensing.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/postprocessing/jetVolumetric.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/postprocessing/normalComposite.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/postprocessing/screenSpaceLensing.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/blackhole/compose.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/blackhole/main.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/blackhole/uniforms.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/blackhole/effects/deferred-lensing.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/blackhole/effects/motion-blur.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/blackhole/gravity/colors.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/blackhole/gravity/disk-sdf.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/blackhole/gravity/disk-volumetric.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/blackhole/gravity/doppler.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/blackhole/gravity/horizon.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/blackhole/gravity/lensing.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/blackhole/gravity/manifold.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/blackhole/gravity/shell.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/compose.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/skybox/main.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/types.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/core/constants.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/core/precision.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/core/uniforms.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/core/varyings.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/effects/sun.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/effects/vignette.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/modes/aurora.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/modes/classic.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/modes/crystalline.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/modes/horizon.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/modes/nebula.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/modes/ocean.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/skybox/modes/twilight.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/utils/noise.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/utils/rotation.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/skybox/utils/color.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/materials/skybox/SkyboxShader.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/polytope/compose.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/polytope/transform-nd-simple.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/polytope/transform-nd.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/julia/compose.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/julia/dispatch.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/julia/main.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/julia/power.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/julia/quaternion.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/julia/uniforms.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/julia/sdf/sdf3d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/julia/sdf/sdf4d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/julia/sdf/sdf5d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/julia/sdf/sdf6d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/julia/sdf/sdf7d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/julia/sdf/sdf8d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/julia/sdf/sdf9d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/julia/sdf/sdf10d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/julia/sdf/sdf11d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/mandelbulb/compose.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/dispatch.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/main.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/power.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/uniforms.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/sdf/sdf3d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/sdf/sdf4d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/sdf/sdf5d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/sdf/sdf6d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/sdf/sdf7d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/sdf/sdf8d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/mandelbulb/sdf/sdf9d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/mandelbulb/sdf/sdf10d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/mandelbulb/sdf/sdf11d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/mandelbulb/sdf/sdf-high-d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/schroedinger/compose.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/schroedinger/dispatch.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/main.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/schroedinger/power.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/uniforms.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/complex.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/density.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/schroedinger/quantum/hermite.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/hydrogenRadial.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/hydrogenNDVariants.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/schroedinger/quantum/ho1d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/hoNDVariants.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/hoSuperpositionVariants.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/schroedinger/quantum/hydrogenPsi.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/laguerre.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/legendre.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/psi.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/schroedinger/quantum/sphericalHarmonics.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/schroedinger/quantum/hydrogenND/hydrogenNDCommon.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/hydrogenND/index.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/quantum/index.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/sdf/sdf3d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/sdf/sdf4d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/sdf/sdf5d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/sdf/sdf6d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/sdf/sdf7d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/sdf/sdf8d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/sdf/sdf9d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/sdf/sdf10d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/sdf/sdf11d.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/sdf/sdf-high-d.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/schroedinger/temporal/index.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/temporal/reprojection.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/schroedinger/temporal/reconstruction.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/schroedinger/temporal/uniforms.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/volume/index.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/volume/absorption.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/schroedinger/volume/emission.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/schroedinger/volume/integration.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/tubewireframe/compose.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/tubewireframe/main.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/tubewireframe/uniforms.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/tubewireframe/vertex.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/groundplane/compose.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/groundplane/grid.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/groundplane/main.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/groundplane/vertex.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/types.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/core/constants.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/core/precision.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/core/uniforms.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/lighting/ggx.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/lighting/ibl.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/shared/lighting/multi-light.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/lighting/sss.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/math/safe-math.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/shared/raymarch/core.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/raymarch/normal.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/raymarch/sphere-intersect.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/fractal/main.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/shared/fractal/compose-helpers.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/shared/color/selector.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/color/selectorVariants.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/shared/color/cosine-palette.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/color/hsl.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/color/oklab.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/depth/customDepth.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/shared/features/ao.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/features/shadows.glsl.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/shared/features/shadowMaps.glsl.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/shared/features/temporal.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/palette/cosine.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/palette/palette.glsl.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/palette/index.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/palette/presets.ts` | High (5–15% frame) | Med-High (+2–6%) | 20–40% | Low–Med (detail/blur fidelity) |
| `src/rendering/shaders/palette/types.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/transforms/index.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/transforms/ndTransform.ts` | Medium (2–6% frame) | Medium (+1–3%) | 10–25% | Low |
| `src/rendering/shaders/constants.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/dimensionColors.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/index.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |
| `src/rendering/shaders/types.ts` | Low (<1% frame) | Low (<1–2%) | 0–10% | None/Low |

## Recommended Optimizations (Priority Order)
1. High Impact / Low Effort: Reduce post-processing tap counts (SSR, Bokeh, PaperTexture), add half-res paths with bilateral upsample, and tighten early-out thresholds in raymarch loops.
2. High Impact / Medium Effort: Introduce hierarchical raymarching/space skipping for black hole and Schrödinger volumes; adopt per-effect dynamic quality scaling tied to frame time.
3. Medium Impact / Low Effort: Consolidate shared math/utility functions and ensure expensive branches are guarded by uniforms or compile-time defines.

## Conclusion
Overall, the shader suite is production-grade and visually ambitious. The largest performance wins are concentrated in volumetric/raymarch passes and multi-sample post-processing. Systematic quality tiers, adaptive sampling, and tighter early-out logic will deliver the best FPS gains with controlled visual tradeoffs.
