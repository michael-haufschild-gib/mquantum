# 2D Rendering Mode (Implemented 2026-02-11)

## Architecture
- **Trigger**: `dimension === 2` (natural extension of dimension system)
- **Geometry**: Fullscreen triangle via `@builtin(vertex_index)` — no vertex buffer
- **Camera**: Top-down view (pos=[0,0,8], target=[0,0,0]), orbit→pan, zoom via distance
- **Model matrix**: For 2D, derived from camera state (target→pan, distance→zoom) instead of transform store

## Shader Pipeline (2D)
- **Vertex**: `composeSchroedingerVertexShader2D()` — 3 hardcoded vertices, outputs UV
- **Fragment entry**: `fragmentMain` (same as 3D)
- **Main blocks**: `generateMainBlock2D()` (heatmap), `generateMainBlock2DIsolines()` (contour lines)
- **VertexOutput**: `{ clipPosition: vec4f, uv: vec2f }` — NOT vPosition like 3D
- **No raymarching**: UV → physical coords → `mapPosToND()` → `evalPsi()` directly
- **Time**: Uses `schroedinger.time * schroedinger.timeScale` inline (no `getVolumeTime()`)

## HO in 2D
- `hoND2dBlock = generateHoNDBlock(2)` — genuine 2D system ψ(x,y,t)
- `generateMapPosToND` supports dim=2 (clamp 2-11)
- `ACTUAL_DIM = 2` for HO, `ACTUAL_DIM = 3` for hydrogen (z=0 cross-section)

## 2D-Specific Blocks
- `nodalLines2D.wgsl.ts` — anti-aliased zero-crossing lines (gradient SDF)
- `isolines2D.wgsl.ts` — contour lines at log-spaced density thresholds
- Both have stub blocks for when not in 2D mode (WGSL resolves all symbols)

## Renderer (WebGPUSchrodingerRenderer)
- Constructor: 2D outputs only `object-color` (no depth, no normal, no temporal)
- `createPipeline()`: 2D uses empty vertex buffers, single target+alpha blend, cullMode='none', no depthStencil
- `execute()`: 2D path uses `draw(3)` instead of `drawIndexed()`, no compute passes
- `updateCameraUniforms()`: 2D model matrix from camera target (pan) + distance (zoom)

## Disabled in 2D
- Volumetric raymarching, PBR/GGX, SSS, fog, powder, temporal, density grid, eigencache, cross-section
- All gated via `!is2D` in compose.ts block conditions

## UI Gating (dimension > 2 checks)
- FacesSection: isosurface toggle, Material tab
- SharedAdvancedControls: SSS
- SchroedingerAdvanced: powder, anisotropy
- SchroedingerCrossSectionSection: entire section (early return)
- TemporalReprojectionControls: entire component (early return)

## Files Modified/Created
New: `main2D.wgsl.ts`, `isolines2D.wgsl.ts`, `nodalLines2D.wgsl.ts`
Modified: `compose.ts`, `WebGPUSchrodingerRenderer.ts`, `WebGPUScene.tsx`, `geometryStore.ts`, `registry.ts`, `schroedingerSlice.ts`, `hoNDVariants.wgsl.ts`, `density.wgsl.ts`, + 5 UI components
