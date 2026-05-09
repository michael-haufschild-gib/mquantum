# Wheeler-DeWitt worldline pulse performance

2026-05-09: Semiclassical Worldline animation performance was fixed by avoiding per-frame full 3D texture repacks/uploads. Key files:
- `src/rendering/webgpu/renderers/strategies/WheelerDeWittStrategy.ts`: caches pulse overlay scratch, caps pulse texture updates to 20 Hz, uses row-delta texture uploads on animation-only frames, resets row scratch after full baseline repacks.
- `src/lib/physics/wheelerDeWitt/wkbStreamlines.ts`: caches Gaussian splat kernels and optionally tracks active solver cells while building pulse overlays.
- `src/lib/physics/wheelerDeWitt/worldlinePulseAlpha.ts`: owns row-delta alpha update helpers and scratch state.
- `src/lib/physics/wheelerDeWitt/densityGrid.ts`: re-exports pulse alpha helpers for existing imports.

Measured live Chromium/WebGPU on existing localhost:3000 with `qm=wheelerDeWitt`, `worldlineEnabled=true`, `worldlineSpeed=1`, `pulseWidth=0.08`, `inferno`: 240 frames / 5.0109s = 47.9 FPS after fix. User reported ~4 FPS before, so target 10x+ was met in live measurement.

Verification run: `pnpm exec vitest run src/tests/lib/physics/wheelerDeWitt/worldlinePulseFastPath.test.ts src/tests/rendering/webgpu/renderers/strategies/WheelerDeWittStrategy.test.ts src/tests/lib/physics/wheelerDeWitt/wkbStreamlines.test.ts`; `pnpm exec tsc -b --pretty false`; targeted ESLint on touched files.