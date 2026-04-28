# Quantum Discovery WebGPU Session

- started_unix: 1777408790
- deadline_unix: 1777437590
- started_local: 2026-04-28 22:39:50 CEST
- deadline_local: 2026-04-29 06:39:50 CEST
- budget_hours: 8

## Init

- Read `docs/architecture.md`, `docs/testing.md`, and `quantum-discovery-webgpu` skill.
- Read Serena memories: project overview, codebase structure, suggested commands, task completion checklist, WebGPU bind group architecture, camera data flow, WebGPU coding guide, WGSL comment feedback.
- Initial git status: clean.

## Round PRD: Spectral-Dimension Flow Lens

### Scientific Goal

Render quantum-gravity dimensional reduction as an actual optical/volumetric deformation of the wavefunction, not a palette. The instrument should show regions where the rendered quantum state behaves as if the effective spectral dimension flows from macroscopic 3D/4D geometry toward UV two-dimensional geometry, motivated by CDT/asymptotic-safety spectral-dimension arguments.

References used:
- Coumbe/Jurkiewicz, arXiv:1411.7712: CDT spectral dimension decreases from large-scale approximately 4 to small-scale approximately 3/2.
- Reuter/Saueressig Living Reviews spectral-dimension section: spectral dimension is derived from heat-kernel return probability and asymptotic-safety UV behavior can produce `d_s = d/2`, notably 2 in 4D.

### Physics / Math

- Add controls on `SchroedingerConfig`:
  - `spectralDimensionFlowEnabled: boolean`
  - `spectralDimensionFlowStrength: number` in `[0, 2]`
  - `spectralDimensionFlowUvDimension: number` in `[1.2, 3.5]`, default `2.0`
  - `spectralDimensionFlowDiffusionScale: number` in `[0.05, 3.0]`, default `0.7`
- In WGSL, define a local heat-kernel proxy:
  - `gradientCurvature = log(1 + |∇logρ| * diffusionScale)`
  - `densityGate = smoothstep(-14, -2, logρ) * (1 - smoothstep(1.5, 8, ρ / peakρ))`
  - `uvGate = clamp(densityGate * gradientCurvature * strength, 0, 1)`
  - `D_IR = 4` for compute/cosmology modes (`quantumMode >= 2`) and `3` for analytic position-space modes.
  - `D_s = mix(D_IR, D_UV, uvGate)`
- Use `D_s` to change rendered physics:
  - Coordinate compression: contract sample coordinates along the local gradient by a bounded factor proportional to `(D_IR - D_s) / D_IR`, producing horizon/singularity membrane flattening.
  - Caustic gain: multiply emission/opacity by a bounded gain when `D_s` drops.
  - Opacity response: density should become visually thinner near UV-reduced regions, while caustic sheets brighten so user sees both dimensional loss and boundary accumulation.
- Must work in:
  - Analytic volume raymarch path.
  - HQ volume raymarch path.
  - Density-grid raymarch path.
  - Simple density-grid raymarch path.
- Disabled state must be exact no-op by writing all fields as zero or guards returning identity.

### User Sees

- Quantum Effects section gains a "Spectral Dimension Flow" switch with sliders for strength, UV dimension, diffusion scale.
- When enabled, wavefunction lobes and compute-grid cosmology fields develop flattened, luminous, horizon-like sheets in high-gradient/high-density regions; these are geometric deformations, not only color changes.

### Acceptance Bar

- TypeScript compiles.
- Unit tests cover:
  - Disabled uniforms zero.
  - Enabled uniforms clamp to ranges.
  - WGSL contains uniforms, active guard, spectral dimension helper, and all raymarch paths resample after deformation.
- `pnpm exec vitest run src/tests/rendering/webgpu/uniformPacking.test.ts src/tests/rendering/webgpu/structLayout.test.ts src/tests/rendering/webgpu/schroedingerSpectralDimensionFlowWgsl.test.ts`
- `pnpm run lint`
- If shader validation command is practical, run `pnpm test:shaders:fast`; otherwise record why skipped.

### Outcome

- Commit: `c02384ef` (`Add spectral-dimension flow lens`)
- Reviewer result: PASS after one fix cycle.
- What renderer now draws: a spectral-dimension flow lens that contracts sample coordinates along local probability-gradient directions, thins opacity, and boosts caustic emission where a heat-kernel proxy drives `D_s` from the IR dimension toward the configured UV dimension.
- Paths affected: analytic volume raymarch, HQ analytic raymarch, full density-grid raymarch, and simple density-grid raymarch.
- Fix cycle note: initial `D_IR` guard used `quantumMode >= 2`, which misclassified analytic `hydrogenNDCoupled` (`7`) as compute. Replaced with explicit analytic mode set `0`, `1`, `7` and added regression coverage.
- Verification:
  - `pnpm exec vitest run src/tests/rendering/webgpu/uniformPacking.test.ts src/tests/rendering/webgpu/structLayout.test.ts src/tests/rendering/webgpu/schroedingerSpectralDimensionFlowWgsl.test.ts` — PASS, 96 tests.
  - `pnpm exec tsc --noEmit` — PASS.
  - `pnpm run lint` — PASS.
  - `pnpm test:shaders:fast` — PASS.
- Follow-up threads: expose measured `D_s` as optional diagnostic overlay; couple `D_s` to Wheeler-DeWitt WKB streamlines; derive diffusion scale from local lattice spacing in compute modes.

## Round PRD: Coleman-De Luccia Vacuum Bubble Lens

### Scientific Goal

Render false-vacuum decay as a semiclassical tunneling geometry inside the existing WebGPU quantum volume renderer. The feature should show a true-vacuum bubble nucleating inside the quantum state: the instanton wall refracts samples, thins opacity inside the bubble, and emits a bright wall where a Euclidean action proxy favors tunneling.

### Physics / Math

- Add controls on `SchroedingerConfig`:
  - `vacuumBubbleLensEnabled: boolean`
  - `vacuumBubbleLensStrength: number` in `[0, 2]`, default `0.75`
  - `vacuumBubbleWallRadius: number` in `[0.05, 1.5]`, default `0.55`
  - `vacuumBubbleWallThickness: number` in `[0.02, 0.5]`, default `0.12`
  - `vacuumBubbleTension: number` in `[0, 3]`, default `0.9`
  - `vacuumBubbleBias: number` in `[0, 3]`, default `0.8`
- In WGSL, define a Coleman-De Luccia bounce proxy:
  - `r = length(worldPosition)`
  - `R(t) = wallRadius * boundingRadius * (1 + 0.12 * sin(time * timeScale * (0.35 + bias)))`
  - `wall = exp(-((r - R) / thickness)^2)`
  - `inside = 1 - smoothstep(R - thickness, R + thickness, r)`
  - `S_proxy = tension * R^2 - bias * R^3` clamped into a tunneling gate, with lower action producing brighter shell.
- Use the proxy to alter rendered physics:
  - Coordinate refraction across the wall: displace sample coordinates along radial normal by a bounded amount proportional to `wall * strength * tunnelingGate`.
  - Opacity response: thin true-vacuum interior by multiplying density/effective alpha by `mix(1, 0.55, inside * strengthBound)`.
  - Emission response: boost emission on the wall by `1 + wall * tunnelingGate * strength`.
- Must work in:
  - Analytic volume raymarch path.
  - HQ volume raymarch path.
  - Density-grid raymarch path.
  - Simple density-grid raymarch path.
- Disabled state must be exact no-op by writing all fields as zero or guards returning identity.

### User Sees

- Quantum Effects section gains "Vacuum Bubble Lens" switch with sliders for strength, radius, wall thickness, tension, and vacuum bias.
- When enabled, the wavefunction develops a luminous instanton shell. The interior becomes visually thinner and the wall bends nearby structures, making vacuum decay visible as geometry rather than only color.

### Acceptance Bar

- TypeScript compiles.
- Unit tests cover:
  - Disabled uniforms zero.
  - Enabled uniforms clamp to ranges.
  - WGSL contains uniforms, active guard, CDL helper, and all raymarch paths resample after wall refraction and apply opacity/emission response.
- `pnpm exec vitest run src/tests/rendering/webgpu/uniformPacking.test.ts src/tests/rendering/webgpu/structLayout.test.ts src/tests/rendering/webgpu/schroedingerVacuumBubbleLensWgsl.test.ts`
- `pnpm run lint`
- `pnpm test:shaders:fast`

### Outcome

- Commit: `7587d11e` (`Add Coleman-De Luccia bubble lens`)
- Reviewer result: PASS.
- What renderer now draws: an oscillating Coleman-De Luccia false-vacuum bubble lens with radial wall refraction, true-vacuum interior opacity thinning, and tunneling-wall emission gain.
- Paths affected: analytic volume raymarch, HQ analytic raymarch, full density-grid raymarch, and simple density-grid raymarch.
- Verification:
  - `pnpm exec vitest run src/tests/rendering/webgpu/uniformPacking.test.ts src/tests/rendering/webgpu/structLayout.test.ts src/tests/rendering/webgpu/schroedingerVacuumBubbleLensWgsl.test.ts` — PASS, 97 tests.
  - `pnpm exec tsc --noEmit` — PASS.
  - `pnpm run lint` — PASS.
  - `pnpm test:shaders:fast` — PASS.
- Follow-up threads: make bubble center follow a Bohmian current streamline; couple bubble nucleation to FSF self-interaction potential minima; add two-bubble collision interference.
