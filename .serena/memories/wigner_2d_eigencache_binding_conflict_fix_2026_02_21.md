## Wigner/2D Eigenfunction Cache Binding Conflict Fix (2026-02-21)

### Problem
In Schroedinger fragment shader composition, enabling both:
- `isWigner=true` (or native 2D pipeline), and
- `useEigenfunctionCache=true`
caused conflicting resource declarations at `@group(2) @binding(2/3)`.

Wigner mode uses these slots for:
- `wignerCacheTexture` (binding 2)
- `wignerCacheSampler` (binding 3)

while eigencache uses:
- `eigenCache` storage buffer (binding 2)
- `eigenMeta` uniform (binding 3)

### Root Cause
`composeSchroedingerShader` treated eigencache as globally enabled when requested, without excluding 2D/Wigner composition paths.
Renderer shader config also allowed `useEigenfunctionCache=true` in 2D pipelines.

### Fix
1. In `src/rendering/webgpu/shaders/schroedinger/compose.ts`:
   - gate cache with `const useCache = useEigenfunctionCache && !is2D`
2. In `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`:
   - normalize `useEigenfunctionCache=false` when `pipelineIs2D`

### Regression Tests
Added to `src/tests/rendering/webgpu/wgslCompilation.test.ts`:
- Wigner mode suppresses eigencache bindings even if requested.
- Native 2D mode suppresses eigencache bindings even if requested.

### Verification
`npx vitest run src/tests/rendering/webgpu/wgslCompilation.test.ts -t "Wigner cache|suppresses eigenfunction cache bindings"` passed.