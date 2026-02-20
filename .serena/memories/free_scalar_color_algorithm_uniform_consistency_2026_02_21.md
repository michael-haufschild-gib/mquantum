## Free scalar / Schrödinger color algorithm consistency fix (2026-02-21)

### Problem
`WebGPUScene.createObjectRenderer()` normalizes color algorithms by quantum mode, but `WebGPUSchrodingerRenderer.updateSchroedingerUniforms()` previously wrote uniform `colorAlgorithm` from `appearance.colorAlgorithm` directly.

This allowed runtime uniform drift from compiled renderer specialization (and mode gating), especially during warm-swap windows and persisted invalid state loads.

### Fix
In `src/rendering/webgpu/renderers/WebGPUSchrodingerRenderer.ts`, prefer `this.rendererConfig.colorAlgorithm` and only fallback to appearance mapping when it is undefined.

### Regression tests
Added tests in `src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`:
1. Compile-time diverging (9) remains even if appearance requests kSpaceOccupation.
2. Compile-time free-scalar kSpaceOccupation (15) remains even if appearance requests relativePhase.

### Verification
- `npx vitest run --maxWorkers=4 src/tests/rendering/webgpu/WebGPUSchrodingerRenderer.materialDirty.test.ts`
- Existing free-scalar regression pack remains green.