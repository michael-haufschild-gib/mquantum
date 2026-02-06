# Schroedinger Renderer Audit - 2026-02-06

## Problem Statement
Schroedinger renderer produces "almost invisible, monochrome shadow" only visible when using a skybox.
User confirmed there are SEVERAL fundamental bugs. Must find ALL before attempting fixes.

## STATUS: INVESTIGATION COMPLETE → READY TO FIX ALL BUGS
User approved proceeding with fixes after compaction.

## USER CONSTRAINTS
- Do NOT use subagents - investigate yourself
- Be thorough

## ALL BUGS TO FIX (in priority order)

### Bug 3: Depth texture type mismatch in EnvironmentCompositePass (CRITICAL)
- **File**: `src/rendering/webgpu/passes/EnvironmentCompositePass.ts`
- **What's wrong**: 'depth-buffer' resource has format `depth24plus`. But:
  - Inline shader declares: `var tMainObjectDepth: texture_2d<f32>` → MUST be `texture_depth_2d`
  - Bind group layout: `sampleType: 'unfilterable-float'` → MUST be `sampleType: 'depth'`
  - `textureLoad` on `texture_depth_2d` returns `f32` directly, but code does `.r` on result (treating as vec4f)
- **Fix**: 
  1. Change WGSL: `texture_2d<f32>` → `texture_depth_2d`
  2. Change bind group layout: `sampleType: 'unfilterable-float'` → `sampleType: 'depth'`
  3. Change all `.r` accessors on depth textureLoad results: `textureLoad(...).r` → `textureLoad(...)` (returns f32 directly for depth textures)
  4. Note: `textureDimensions(tMainObjectDepth)` still works the same for texture_depth_2d

### Bug 8: fract(1.0)=0 makes peak density get DARKEST color (HIGH)
- **File**: `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`, function `computeBaseColor`
- **What's wrong**: `applyDistributionS` uses `fract(curved * cycles + offset)`. With defaults (power=1, cycles=1, offset=0), at peak density normalized=1.0 → `fract(1.0) = 0.0` → distributedT=0 → lightness=0.3 (minimum). Peak density gets darkest color.
- **Fix**: In `applyDistributionS`, clamp output to avoid the fract(1.0)=0 discontinuity. Use `fract(curved * cycles + offset)` but clamp the input to `curved` to [0, 0.9999] before the fract, OR change to `clamp(curved * cycles + offset, 0.0, 1.0)` instead of `fract()`. The `fract` approach is for cyclic palettes; for monochromatic/analogous, a clamp is more appropriate. Best fix: change `fract` to `clamp` for non-cyclic algorithms, or clamp `normalized` to [0, 0.999] before distribution.
- **Simplest fix**: In `applyDistributionS`, change `return fract(curved * cycles + offset);` to `return clamp(fract(curved * cycles + offset + 0.001), 0.0, 1.0);` — or better, `let clamped = clamp(t, 0.0, 0.999);` to avoid the boundary.

### Bug 9: Gradient=0 at wavefunction peak → no directional lighting (HIGH)
- **File**: `src/rendering/webgpu/shaders/schroedinger/volume/emission.wgsl.ts`, function `computeEmissionLit` line 268
- **What's wrong**: `if (gradLen < 0.0001) { return col; }` where col = ambient-only (baseColor × 0.15). At the wavefunction peak, gradient of log(ρ) is exactly zero, so ALL directional lighting is skipped for the densest voxels.
- **Fix**: Instead of early-returning with ambient-only, use a fallback pseudo-normal (e.g., the view direction or a sphere normal) when gradient is near-zero. This allows the lighting to still contribute. Example: `let n = select(gradient / gradLen, viewDir, gradLen < 0.0001);`

### Bug 7: faceEmission=0 and emissionIntensity=0 → HDR glow entirely disabled (HIGH)
- **File**: `src/stores/slices/visual/materialSlice.ts` line 28, `src/lib/geometry/extended/types.ts` line 427
- **What's wrong**: `faceEmission: 0.0` and `emissionIntensity: 0.0` by default. The HDR emission glow in `computeEmissionLit` is gated by `uniforms.emissionIntensity > 0.0` and always skipped.
- **Fix**: Change default `emissionIntensity` to a sensible nonzero value (e.g., 0.5) in `DEFAULT_SCHROEDINGER_CONFIG`. Also consider changing `faceEmission` default to match. The HDR emission adds significant visual impact.

### Bug 5: DEFAULT_COLOR_ALGORITHM = 'monochromatic' (MEDIUM)
- **File**: `src/rendering/shaders/palette/types.ts` line 232
- **What's wrong**: Default is 'monochromatic' which produces single-hue output. For a quantum physics simulator, 'mixed' (algorithm 9, phase+density) is more appropriate.
- **Fix**: Change `DEFAULT_COLOR_ALGORITHM` from `'monochromatic'` to `'mixed'`. The 'mixed' algorithm uses wavefunction phase for hue variation and density for lightness, which is scientifically meaningful.

### Bug 1: Double-alpha compositing (ALREADY FIXED in previous session)
- **File**: `src/rendering/webgpu/passes/EnvironmentCompositePass.ts` line 136
- **Status**: Already changed from `objColor.rgb * objColor.a` to `objColor.rgb`
- No further action needed.

### Bug 4: Two copies of environment composite shader out of sync (LOW)
- **Files**: EnvironmentCompositePass.ts (inline, actually used) vs environment-composite.wgsl.ts (separate, NOT used)
- **Fix**: Delete the unused `environment-composite.wgsl.ts` file, or refactor to import the shader from the .wgsl.ts file.

### Bug 2: frameNumber u32 written as float (LOW)
- **File**: `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`, `updateCameraUniforms()`
- **What's wrong**: `data[123] = ctx.frame?.frameNumber || 0` writes to Float32Array but WGSL has `frameNumber: u32`
- **Fix**: Use DataView to write as Uint32: `new DataView(data.buffer).setUint32(123 * 4, frameNumber, true)`
- **Impact**: Minor - frameNumber not used in main shader path

## VERIFIED CORRECT (no changes needed)
- All uniform buffer alignments (Schroedinger 1040B, Material 160B, Lighting 576B, Camera 512B, Quality 64B)
- Bind group layouts match WGSL declarations (G0/G1/G2)
- Store getters all registered in WebGPUScene.tsx
- Volume integration math (Beer-Lambert compositing)
- Shader composition order (compose.ts)
- Bounding geometry (4×4×4 box, BOUND_R=2.0)
- Premultiplied alpha blend → composite pipeline (after Bug 1 fix)
- setupRenderPasses resource wiring
- Pipeline config: depthWrite=true, depthCompare=less, cullMode=front

## RENDER PIPELINE RESOURCE FLOW
```
Schroedinger → 'object-color' (rgba16float) + 'depth-buffer' (depth24plus)
Skybox → 'scene-render' (rgba16float)
EnvironmentComposite: 'scene-render' + 'object-color' + 'depth-buffer' → 'hdr-color'
Tonemapping: 'hdr-color' → 'ldr-color' (ACES, exposure=0.7)
ToScreen: 'ldr-color' → canvas (sRGB)
```

## KEY DEFAULT VALUES
- DEFAULT_COLOR_ALGORITHM = 'monochromatic' (→ change to 'mixed')
- DEFAULT_FACE_COLOR = '#33cc9e' (teal)
- DEFAULT_AMBIENT_INTENSITY = 0.15
- DEFAULT_EXPOSURE = 0.7
- emissionIntensity = 0.0 (→ change to 0.5)
- fieldScale = 1.0, densityGain = 2.0, sampleCount = 32
