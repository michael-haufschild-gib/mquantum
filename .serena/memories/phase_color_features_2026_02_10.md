## Phase color feature integration (2026-02-10)

Implemented 3 low-refactor visualization upgrades in branch/worktree `codex/quutip-color-features`:
1. New color algorithms in palette + WGSL:
   - `phaseWheel` -> id `11`
   - `phaseDiverging` -> id `12`
2. New appearance control:
   - `phaseMagnitudeSuppression` (clamped 0..0.5, default 0.08)
3. Temporal safety:
   - `WebGPUTemporalCloudPass` now invalidates history when `appearance.appearanceVersion` changes.

### Critical plumbing details
- String->int mapping updated in `src/rendering/shaders/palette/types.ts` and `WebGPUSchrodingerRenderer.ts`.
- WGSL compile-time color type union updated in `src/rendering/webgpu/shaders/types.ts`.
- Phase-dependent density-grid fallback in `main.wgsl.ts` must include ids 11/12, or r16 grid mode can miss required phase sampling.
- Suppression uniform reused legacy reserved slot at offset `760` in `SchroedingerUniforms`:
  - WGSL field renamed to `phaseColorSuppression`.
  - CPU packer writes `appearance.phaseMagnitudeSuppression` to `floatView[760/4]`.

### Shader behavior
- `phaseWheel`: direct hue mapping from full complex phase (2π).
- `phaseDiverging`: signed diverging map using `cos(phase)` as Re(ψ) sign proxy (red/blue wings, neutral at sign transitions).
- Suppression applies to phase-family algorithms (`phase`, `mixed`, `phaseWheel`, `phaseDiverging`) by blending toward neutral color at low normalized magnitude.

### Verification run
- `npx vitest run` on targeted suites: color availability, WGSL compilation, appearance store, temporal pass caching, WebGPU scene temporal wiring (all pass).
- `npm run build:web` passes (tsc + vite build).

### Risk note
- Eigencache unaffected (color-only path; no wavefunction/eigen cache key changes).
- Temporal reprojection ghosting reduced for color control edits via appearance-version history invalidation.
