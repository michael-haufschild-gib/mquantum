# Momentum Mode Performance Fix (2026-02-07)

## Problem
Momentum representation mode (`representation: 'momentum'`) ran at 1-3 FPS while position mode ran at 60+ FPS.

## Root Cause
Momentum mode was doing full inline wavefunction evaluation (`ho1D()` with Hermite polynomial computation) for EVERY sample point during raymarching. Position mode used the eigenfunction cache (pre-computed 1D values stored in a storage buffer), making lookups O(1) instead of O(Hermite polynomial degree).

The eigenfunction cache compute pass was skipped for momentum mode since the momentum shader calls `ho1D()` directly (not `ho1DCached()`).

## Fix
Enabled the **density grid** (3D pre-computed texture, 64³) for momentum mode. The density grid compute pass already evaluates the correct psi (position vs momentum) based on `uniforms.representationMode` — it calls `sampleDensityWithPhase()` → `evalPsiWithSpatialPhase()` → dispatches to momentum variant.

### Changes
1. **`WebGPUSchrodingerRenderer.ts`**: Added `representation` to `SchrodingerRendererConfig`; `useDensityGrid` now enabled when `isHydrogen || isMomentum`
2. **`WebGPUScene.tsx`**: Added `representation` to `schroedingerCompileSelector` (triggers pipeline rebuild on representation change), `PassConfig`, and renderer creation
3. **Test fix**: Updated `WebGPUScene.temporal.test.ts` `ScenePassConfig` interface

### Key architectural insight
- `representation` is a **compile-time** shader config (not just runtime uniform) because it changes whether the shader uses density grid texture lookups or inline evaluation
- Switching representation triggers a full pipeline rebuild (acceptable since it's an infrequent user action)
- The density grid compute shader already handles momentum mode via the runtime uniform `representationMode`

## What NOT to try
- Making eigenfunction cache work for momentum mode (complex, eigencache stores 1D values, not well suited for k-space mapping)
- Disabling nodal floor/softening — does not affect FPS in momentum mode (tested previously, no effect)
