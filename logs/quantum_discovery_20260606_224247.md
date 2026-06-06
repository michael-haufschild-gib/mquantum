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

## Round PRD - CHSH Caustic Cosmograph

Target: `bellPair` object type selected by random draw after rejecting `hydrogenND` because it appeared in recent-target exclusion history. Topic is unrelated to oscillator/cocycle/hydrogen work.

Literature boundary: related work exists for Bell tests in cosmology, Bell's theorem for temporal order, ER=EPR, Tsirelson/horizon arguments, topological boundary conditions, and optical CHSH-like nonseparability. Exact searches for "CHSH caustic", "Bell caustic CHSH", and "Bell pair caustic cosmology" did not reveal a framework where CHSH slack is turned into an eikonal caustic density field inside a Bell-pair apparatus renderer. This round must avoid claiming to solve ER=EPR, causal order, or the horizon problem; it is a new visual physics instrument: CHSH measurement settings define a null-lens eikonal whose caustics encode how close the Bell state sits to the classical/Tsirelson boundary.

Sources checked:
- Zych/Costa/Pikovski/Brukner, "Bell's theorem for temporal order", Nature Communications 2019.
- arXiv:2603.25881, "A Bell experiment during inflation".
- arXiv:1308.3695, "Holographic EPR Pairs, Wormholes and Radiation".
- arXiv:2011.08284, "Tsirelson's Bound and the Quantum Monogamy Bound from Global Determinism".
- "Recovery of nonseparability in self-healing vector Bessel beams" for optical CHSH-like intensity methodology.

Hypothesis: a Bell-pair renderer can expose nonlocality as a caustic geometry without changing the Born sampler. The four CHSH axes define a signed eikonal

`Phi(p) = scale * [(A·(p-a0))(B·(p-b0)) - (A·(p-a0))(B'·(p-b0)) + (A'·(p-a0))(B·(p-b0)) + (A'·(p-a0))(B'·(p-b0))] + phase`

where `a0`/`b0` are analyzer centers. The caustic field is a sharp, gated ridge of `cos(Phi)`, amplified by normalized CHSH slack `max(|S|-2,0)/(2√2-2)` and visibly collapsed when Werner visibility moves below threshold. This changes the density grid the raymarcher draws, so it is not a UI overlay or color-only trick.

Antagonistic review: this is not 1926 Bell, not 2026 Bell pedagogy, and not another wormhole metaphor. It aims at a 2126-style instrument: the inequality boundary becomes a geometric optical object inside the simulator. It fails if it only changes text, glow color, or live statistics; it must create stable, structured, impressive folds in the WebGPU density field.

Performance plan before implementation:
- Keep `bellPair` 3D-only and reuse its existing per-frame apparatus compute pass and density texture.
- Append exactly one 16-byte caustic control block to `BellApparatusUniforms`: enabled, strength, fold scale, phase.
- Add no texture, no bind group, no render pass, no workgroup-size change, no loops.
- Per voxel: one small analytic eikonal with dot products, `cos`, `exp`, and clamps. Default disabled path returns current apparatus output.
- New presets use existing density resolution and conservative trial throughput so default and each new preset must stay >=45 FPS.

Requirements:
- Add Bell config fields: `chshCausticEnabled`, `chshCausticStrength`, `chshCausticFoldScale`, `chshCausticPhase`; defaults disabled, finite sanitized.
- Add CPU reference math in `src/lib/physics/bell/chshCaustic.ts` with tests for disabled identity, finite/clamped inputs, canonical CHSH slack near 1 at `v=1`, zero positive slack below Werner threshold, ridge dependence on phase/fold scale, analyzer-swap symmetry where appropriate, and strength monotonicity.
- Extend `BELL_SCENARIO_PRESETS` with two presets ordered before `chshSinglet`:
  - `chshCausticTsirelsonLens`: canonical singlet, caustic enabled, high slack, bright braided lens.
  - `chshCausticWernerCusp`: subthreshold Werner state, caustic enabled with collapsed cusp/shadow geometry, visibly distinct from the lens.
- Update Bell scenario tests and selector tests so caustic presets are exposed and active matching prefers the specific caustic preset over canonical `chshSinglet`.
- Extend `BellPairComputePass` packer/uniform layout and WGSL apparatus shader so caustic fields modify R/G/B/A density output.
- Add/extend WebGPU pass tests for 128-byte uniform layout, pad/alignment, caustic clamping, and field round trip.
- Add a Playwright e2e that navigates to `?t=bellPair`, selects default plus both new caustic presets via `[data-testid="scenario-selector"]`, verifies nonblank canvas, screenshots/pixel snapshots differ, no GPU/shader errors, and FPS >=45 for default and both new presets. Do not accept skipped WebGPU.
- Run targeted Vitest, shader validation, build/bundle budget, touched-file lint, e2e, reviewer PASS, then commit.

## Round Outcome - CHSH Caustic Cosmograph

Status: merged locally after reviewer PASS.

What renderer can draw now: Bell-pair apparatus density can be modulated by a CHSH-derived caustic field. Analyzer axes and Werner visibility now generate stable lens/cusp structures directly in the WebGPU density output, with high-slack Tsirelson folds and a subthreshold Werner collapse preset.

Presets added:
- `chshCausticTsirelsonLens`
- `chshCausticWernerCusp`

Validation:
- `pnpm exec vitest run src/tests/lib/physics/bell/chshCaustic.test.ts src/tests/lib/physics/bell/presets.test.ts src/tests/components/sections/Geometry/ScenarioSelector.bell.test.tsx src/tests/rendering/webgpu/passes/BellPairComputePass.test/BellPairComputePass.test.ts` -> 4 files, 37 tests passed.
- `pnpm test:shaders:fast` -> passed.
- `PLAYWRIGHT_DEV_SERVER_PORT=3000 pnpm exec playwright test scripts/playwright/bell-caustic-cosmograph.spec.ts --workers=1` -> passed, 0 skipped; FPS: default 121.1, Tsirelson lens 120.3, Werner cusp 120.2.
- `pnpm run build:web` -> passed.
- `pnpm run bundle:check` -> passed; `rendering` 83.28/83.40 kB gzip after intentional minimal budget raise from 85,200 to 85,400 bytes.
- `git diff --check` -> passed.
- Reviewer recheck -> PASS.

Performance optimization after implementation: kept the caustic analytic inside the existing Bell apparatus compute pass, added only one 16-byte uniform block, no new texture/pass/bind-group/workgroup changes, clamped all fields, preserved disabled fast path, and verified all default/new scenarios far above 45 fps.

Follow-up threads:
- A later Bell round could explore time-order superposition, but immediate next round must switch target and topic.
- Do not repeat CHSH/caustic/lens framing next round.
