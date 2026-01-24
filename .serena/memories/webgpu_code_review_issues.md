# WebGPU Code Review Issues

_Last updated: 2026-01-24 (ALL CRITICAL ISSUES FIXED)_

## Critical Issues (All Fixed ✅)

### Issue 1: WebGPUScene.tsx - Store property name mismatches ✅ FIXED
- **Location**: `src/rendering/webgpu/WebGPUScene.tsx`
- **Fixed**: Updated PassConfig interface and setupRenderPasses to use correct store property names
  - `aoEnabled` → `ssaoEnabled`
  - `paperTextureEnabled` → `paperEnabled`
  - `paperTextureIntensity` → `paperIntensity`
  - `frameBlendingStrength` → `frameBlendingFactor`
  - `gravitationalLensingEnabled` → `gravityEnabled`
  - `screenSpaceLensingEnabled` → REMOVED

### Issue 2: Polytope - Bind groups not properly wired ✅ FIXED
- **Location**: `WebGPUPolytopeRenderer.ts`
- **Fixed**: Updated createPipeline to use proper bind group layouts and execute() to use correct bind groups (lightingBindGroup, materialBindGroup, qualityBindGroup)

### Issue 3: TubeWireframe - Bind groups not properly wired ✅ FIXED
- **Location**: `WebGPUTubeWireframeRenderer.ts`
- **Fixed**: Same fix as Polytope - proper bind group layouts and usage in execute()

### Issue 4: Mandelbulb - Missing quality bind group ✅ FIXED
- **Location**: `WebGPUMandelbulbRenderer.ts`
- **Fixed**: Created qualityBindGroup in createPipeline and use it in execute()

### Issue 5: BlackHole - updateMaterialUniforms was no-op ✅ FIXED
- **Location**: `WebGPUBlackHoleRenderer.ts`
- **Fixed**: Created dedicated materialUniformBuffer and qualityUniformBuffer, and updateMaterialUniforms now writes to the buffer

### Issue 6: Schrodinger - Material/lighting buffer collision ✅ FIXED
- **Location**: `WebGPUSchrodingerRenderer.ts`
- **Fixed**: updateLightingUniforms now writes starting at byte offset 128 to preserve material data at offsets 0-127

## Warnings (Fixed)

### Warning 1: main.wgsl.ts - Divide-by-zero risk ✅ FIXED
- **Fixed**: Added `max(blackhole.effectiveThickness * 0.5, 0.001)` guard in both shader blocks

### Warning 2: main.wgsl.ts - Unused variable ✅ FIXED
- **Fixed**: Removed `let rs = blackhole.horizonRadius;` from both shader blocks

## Remaining Minor Warnings (Low Priority)

### Warning 3: parseColor doesn't handle #RGB format
- **Locations**: Mandelbulb, Julia, Schrodinger
- **Status**: Low priority - NaN handling already exists in BlackHole

### Warning 4: Type-unsafe bind group storage
- **Locations**: Various renderers use `(this as any).materialBindGroup` pattern
- **Status**: Low priority - works but not type-safe. Could add proper class properties in future cleanup.
