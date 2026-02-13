# Paper Texture Pass Parity Fix (2026-02-13)

## Problem
Paper post-processing pass existed in render graph but produced weak/non-obvious paper look.

## Root Cause
`src/rendering/webgpu/passes/PaperTexturePass.ts` WGSL compositing diverged from upstream `paper-design/shaders` algorithm:
- Missing `getUvFrame` mask flow
- Missing displaced-image relief term `image.rgb += 0.6 * pow(contrast, 0.4) * (res - 0.7)`
- Used multiply blend (`input * paperColor`) instead of frame-masked paper/image composition
- Fiber gradient used forward difference instead of upstream central difference

## Fix Applied
- Added `getUvFrame` in WGSL.
- Restored displaced image sampling and frame-masked paper/image mix.
- Restored contrast-based relief contribution.
- Switched fiber gradient back to central-difference derivative.
- Kept `paperIntensity` as global runtime blend between input and paper result.
- Exported `PAPER_TEXTURE_SHADER` for parity regression tests.
- Added test: `src/tests/rendering/webgpu/passes/PaperTexturePass.test.ts`.

## Verification
- `npx vitest run src/tests/rendering/webgpu/passes/PaperTexturePass.test.ts src/tests/rendering/webgpu/WebGPURenderGraph.compileOrder.test.ts` passed.

## Source Reference
- Upstream shader: https://raw.githubusercontent.com/paper-design/shaders/main/packages/shaders/src/shaders/paper-texture.ts