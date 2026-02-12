# mquantum — N-Dimensional Quantum Physics Simulator

## Identity

Scientific research project (PhD thesis). Students study quantum physics simulations in N dimensions: Schroedinger wavefunctions including harmonic oscillators (1D-11D) and hydrogen orbitals (3D + N-dimensional extensions).

## Constraints (Immutable)

| Constraint | Rule |
|-----------|------|
| Single object type | `ObjectType = 'schroedinger'` only. No polytopes, fractals, black holes. |
| Renderer | Custom WebGPU on raw `GPUDevice` / `GPUCommandEncoder`. No WebGL, no Three.js. |
| Shaders | WGSL only. Files: `.wgsl.ts` composed via `assembleShaderBlocks()`. |
| Approach | Research before coding. Understand code purpose before changing it. No reactive patches. |

## Required Reading

These docs are auto-loaded via `@import` — refer to them for details:
- @docs/architecture.md
- @docs/meta/styleguide.md
- @docs/testing.md
- @docs/frontend.md
- @package.json

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (already running — do NOT start) |
| `npm run build` | Full build: wasm:build -> tsc -b -> vite build |
| `npx vitest run` | Unit tests |
| `npx vite build` | Vite-only build (skips tsc) |

## Code Style (Quick Reference)

- Follow `docs/meta/styleguide.md` — no exceptions
- Zustand selectors: use `useShallow` from `zustand/react/shallow` for multi-value selectors
- Tailwind CSS 4: config in CSS via `@theme` directive, not `tailwind.config.js`
- Path-specific rules: `.claude/rules/` (shaders, stores, rendering, physics, testing)
