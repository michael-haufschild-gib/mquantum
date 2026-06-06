# Quantum Discovery WebGPU Session - 2026-06-06 22:42:47 CEST

- started_unix: 1780778567
- deadline_unix: 1780807367
- started_human: 2026-06-06 22:42:47 CEST
- deadline_human: 2026-06-07 06:42:47 CEST
- budget_hours: 8
- skill: quantum-discovery-webgpu
- branch: dev

## Project Purpose

mquantum is an N-dimensional WebGPU quantum simulator for rendering and interrogating wavefunctions beyond ordinary 3D intuition.

## Session Scientific Mission

Add renderer-visible, preset-tested quantum-cosmology instruments that expose speculative but physically disciplined 3D/4D+ structure while preserving 45+ fps in default and new presets.

## Constraints

- Every new round targets a random mode or object type, never same target consecutively.
- Every new round uses a completely new topic.
- Every renderer-visible addition requires scenario preset coverage, numerical physics tests, Playwright WebGPU render proof, shader validation when shaders change, type/lint checks, and 45+ fps evidence for default plus new presets.
- Implementation effort is not a reason to reject a hypothesis.
- Performance strategy must be considered before implementation and optimized after each round.

## Round PRD - Hermite Triple-Cocycle Inflation

Target: `harmonicOscillator` selected by random draw after excluding recent targets (`freeScalarField`, `antiDeSitter`, `diracEquation`, `pauliSpinor`, `hydrogenND`, `hydrogenNDCoupled`).

Literature boundary: rejected initial "Galois Inflation Lens" after finding adjacent finite-field/Fourier-oscillator/cosmology material. Exact searches for Hermite parity horizon, chronon/nodal ledger, no-cloning horizons, Busy Beaver inflation, and Hermite 3-cocycle oscillator cosmology did not find a matching framework. Adjacent group-cohomology and harmonic-oscillator mathematics exist; this round is only acceptable if it changes local oscillator branch interference through a coordinate-dependent triple-cocycle obstruction, not by renaming known phase coloring.

Hypothesis: a high-dimensional harmonic oscillator superposition can act as a toy inflaton chart if each Fock branch carries a local 3-cocycle phase obstruction. The obstruction couples three projected coordinates, branch quantum numbers, and the fourth coordinate when present. Around a finite shell radius this prevents a single global phase assignment, inflating interference into braided shells and filament chambers. The renderer should reveal shell-bounded branch frustration in 3D and a distinct 4D bulk braid.

Antagonistic review: this is not 1926 oscillator physics, and not a 2026 visualization of ordinary coherent states. It earns the 2126 bar only by making a speculative obstruction term operational inside the wavefunction itself. If it becomes color-only, noise-only, or a preset-only rearrangement, the round fails.

Performance plan before implementation:
- Append four uniforms only: enable, strength, shell radius, twist.
- Enable only when `quantumMode == harmonicOscillator` and preset/config toggle is true.
- Apply one bounded local phase rotation per HO term inside existing dynamic and unrolled HO accumulators; no new render pass, no extra raymarch samples, no gradient/tetrahedral evaluations.
- Use curated 5-term presets and `balanced` raymarch quality to preserve headroom.
- After implementation, measure default HO plus every new preset in Playwright; each must be at least 45 FPS.

Requirements:
- Add `hermiteCocycleInflationEnabled`, `hermiteCocycleInflationStrength`, `hermiteCocycleShellRadius`, `hermiteCocycleInflationTwist` to Schrodinger config/defaults, named preset overrides, store reset, uniform layout, uniform packing, and WGSL uniforms.
- Add CPU reference math for cocycle gate/phase with numerical tests: disabled identity, finite bounded phase, shell peak behavior, quantum-number sensitivity, and 4D coordinate sensitivity.
- Modify both dynamic and unrolled HO shader paths so the cocycle rotates spatial and time-dependent term coefficients consistently.
- Add two scenario selector presets:
  - `hermiteCocycleInflation3D`: shell-bounded 3D braided chamber.
  - `hermiteCocycleBulk4D`: 4D bulk braid using the fourth coordinate.
- Add unit/store/uniform/WGSL tests and Playwright e2e that selects each new preset through the real scenario selector, verifies nonblank clean WebGPU output, proves visual distinctness from ground state and from each other, and measures default/new-preset FPS >= 45.

## Round Outcome - Hermite Triple-Cocycle Inflation

Status: merged locally after reviewer PASS.

What renderer can draw now: harmonic-oscillator branches can carry a shell-bounded Hermite triple-cocycle phase obstruction. The obstruction rotates actual Fock-term amplitudes in both dynamic and unrolled shader paths, producing braided 3D shell chambers and a distinct fourth-coordinate bulk braid, not a color-only overlay.

Presets added:
- `hermiteCocycleInflation3D`
- `hermiteCocycleBulk4D`

Validation:
- `pnpm exec vitest run src/tests/lib/physics/harmonicOscillator/hermiteCocycleInflation.test.ts src/tests/stores/slices/geometry/schroedingerPresets.test.ts src/tests/lib/geometry/extended/configDefaults.test.ts src/tests/rendering/webgpu/uniformPacking.test/uniformPacking.test.ts src/tests/rendering/webgpu/schroedingerHermiteCocycleInflationWgsl.test/schroedingerHermiteCocycleInflationWgsl.test.ts` -> 5 files, 133 tests passed.
- `pnpm test:shaders:fast` -> passed.
- `PLAYWRIGHT_DEV_SERVER_PORT=3000 pnpm exec playwright test scripts/playwright/harmonic-cocycle-inflation.spec.ts --workers=1` -> passed, 0 skipped; FPS: default 60.2, 3D cocycle 60.0, 4D bulk 59.9.
- `pnpm run build:web && pnpm run bundle:check` -> passed; `rendering` 83.19/83.20 kB gzip.
- `git diff --check` -> passed.
- Reviewer recheck -> PASS.

Performance optimization after implementation: kept effect analytic and per-term inside existing HO loops, clamped all new uniforms, used balanced raymarch presets, and trimmed nonfunctional renderer diagnostics/debug labels plus dead WGSL comment bytes to keep all chunks inside budget.

Follow-up threads:
- Try a non-oscillator compute-mode hypothesis next; target cannot repeat `harmonicOscillator`.
- The cocycle gate could later be generalized to learned obstruction fields, but repeating cocycles next round is forbidden by session constraints.
