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

- Commit: `7dbc4b49` (`Add spectral-dimension flow lens`)
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

## Round PRD: Quantum-Walk Coin Entropy Field View

### Scientific Goal

Render local internal-state entropy in the N-D discrete quantum walk. The view should reveal where a walker is not merely present, but locally spread across its coin-direction Hilbert space, exposing information scrambling that position probability and chirality hide.

### Physics / Math

- Add `coinEntropy` to `QuantumWalkFieldView`.
- Map `coinEntropy` to write-grid shader `fieldView = 3`.
- In `qwWriteGrid`:
  - For each lattice site and coin state, compute `p_j = |c_j|^2`.
  - Trilinearly blend each coin-state probability into renderer-local `p_j`.
  - Accumulate renderer-local total probability `P = Σ p_j`.
  - Compute normalized Shannon entropy:
    - `H = clamp((-Σ q_j log(max(q_j, eps))) / log(numCoinStates), 0, 1)` where `q_j = p_j / max(P, eps)`.
  - Gate display by local density so empty volume remains transparent.
  - Keep alpha as raw normalized probability, preserving quantum-carpet readback behavior.
- Existing probability, phase, and coin-state views must remain unchanged.

### User Sees

- Quantum Walk controls gain an `Entropy` field-view option.
- Selecting it renders bright regions where probability at a site is distributed across multiple coin directions, and dark regions where one direction dominates or density is absent.

### Acceptance Bar

- TypeScript compiles.
- Unit/source tests cover:
  - `coinEntropy` packs to write-grid enum `3`.
  - `qwWriteGrid` blends each coin probability before entropy normalization, normalizes by `log(numCoinStates)`, and branches on `fieldView == 3u`.
  - A regression case treats two interpolated pure coin corners as high entropy rather than zero.
  - Quantum Walk UI exposes the entropy field view.
- `pnpm exec vitest run src/tests/rendering/webgpu/quantumWalkCoinEntropy.test.ts src/tests/components/sections/Geometry/SchroedingerControls/QuantumWalkControls.test.tsx`
- `pnpm exec tsc --noEmit`
- `pnpm run lint`
- `pnpm test:shaders:fast`

### Outcome

- Commit: `Add quantum-walk coin entropy view` (amended with this outcome).
- Reviewer result: FAIL on first pass, PASS after fix.
- What renderer now draws: Quantum Walk has a new `Entropy` field view that raymarches normalized local Shannon entropy of the interpolated coin-direction probability distribution.
- Critical fix: entropy now blends each coin probability at the renderer voxel before computing `q_j = p_j / P`, so interpolated pure orthogonal coin corners render as high local entropy instead of zero.
- Paths affected: QW type/config packing, QW write-grid shader, QW controls, and focused tests.
- Verification:
  - `pnpm exec vitest run src/tests/rendering/webgpu/quantumWalkCoinEntropy.test.ts src/tests/components/sections/Geometry/SchroedingerControls/QuantumWalkControls.test.tsx` — PASS, 17 tests.
  - `pnpm exec tsc --noEmit` — PASS.
  - `pnpm run lint` — PASS.
  - `pnpm test:shaders:fast` — PASS.
  - `git diff --check` — PASS.
- Follow-up threads: use entropy as a decoherence-candidate isosurface; compare Grover localization entropy against DFT spreading; expose a combined entropy/chirality bivariate view.

## Round PRD: Dirac Axial Charge Field View

### Scientific Goal

Render local axial/chiral charge in the Dirac spinor solver. The view should expose where relativistic wavefunctions carry `ψ†γ5ψ` imbalance, making anomaly-adjacent left/right coherence visible during Klein, Zitterbewegung, and supercritical-potential scenarios.

### Physics / Math

- Add `axialCharge` to `DiracFieldView`.
- Map `axialCharge` to Dirac write-grid `fieldView = 7`.
- In `diracWriteGrid`:
  - For `latticeDim >= 3`, compute the Hermitian 3+1D chirality operator from existing Clifford matrices:
    - `γ5 = -i α0 α1 α2`
    - `α_i = γ0 γ_i` are the existing Dirac alpha matrices.
  - Evaluate nearest-neighbor local axial charge:
    - `A5 = ψ† γ5 ψ`
    - `ρ = ψ†ψ`
    - display scalar `abs(A5) / max(ρ, eps)`, density-gated by the existing normalized density gate.
  - For `latticeDim < 3`, render zero for this view.
  - Preserve alpha as raw normalized density and preserve potential overlay behavior.
- Existing field-view enum values and rendering must remain unchanged.

### User Sees

- Dirac controls gain an `Axial |ψ†γ5ψ|` field-view option.
- Selecting it renders bright regions where the spinor has strong local chiral/axial imbalance and dark regions where left/right contributions cancel or density is absent.

### Acceptance Bar

- TypeScript compiles.
- Unit/source tests cover:
  - `axialCharge` is a valid Dirac field view and packs to uniform enum `7`.
  - Dirac controls expose `Axial |ψ†γ5ψ|`.
  - `diracWriteGrid` has a `fieldView == 7u` branch using `-i α0 α1 α2`, `DIRAC_USE_SPARSE_GAMMA`, `gammaMatrices`, density gating, and raw-density alpha preservation.
  - A CPU algebra regression confirms `-i α0 α1 α2` matches the expected 3D gamma5 action for the project’s standard Dirac form.
- `pnpm exec vitest run src/tests/rendering/webgpu/diracAxialChargeShader.test.ts src/tests/components/sections/Geometry/SchroedingerControls/DiracControls.test.tsx src/tests/stores/extendedObjectStore.dirac.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm run lint`
- `pnpm test:shaders:fast`

### Outcome

- Commit: `353352ea` (`Add Coleman-De Luccia bubble lens`)
- Reviewer result: PASS.
- What renderer now draws: an oscillating Coleman-De Luccia false-vacuum bubble lens with radial wall refraction, true-vacuum interior opacity thinning, and tunneling-wall emission gain.
- Paths affected: analytic volume raymarch, HQ analytic raymarch, full density-grid raymarch, and simple density-grid raymarch.
- Verification:
  - `pnpm exec vitest run src/tests/rendering/webgpu/uniformPacking.test.ts src/tests/rendering/webgpu/structLayout.test.ts src/tests/rendering/webgpu/schroedingerVacuumBubbleLensWgsl.test.ts` — PASS, 97 tests.
  - `pnpm exec tsc --noEmit` — PASS.
  - `pnpm run lint` — PASS.
  - `pnpm test:shaders:fast` — PASS.
- Follow-up threads: make bubble center follow a Bohmian current streamline; couple bubble nucleation to FSF self-interaction potential minima; add two-bubble collision interference.

## Round PRD: Causal Horizon Memory Echo

### Scientific Goal

Render gravitational memory as a time-nonlocal postprocess over the WebGPU quantum scene. The existing frame-history buffer should become a causal horizon field: prior-frame luminance gradients lens the current image, while radial echo shells expose where older light would remain trapped near a horizon-like screen.

### Physics / Math

- Add post-processing controls:
  - `horizonMemoryEnabled: boolean`
  - `horizonMemoryStrength: number` in `[0, 1.5]`, default `0.45`
  - `horizonMemoryRadius: number` in `[0.05, 1.5]`, default `0.62`
  - `horizonMemoryEchoes: number` in `[1, 6]`, default `3`
- Extend `FrameBlendingPass` uniforms from one scalar to a 16-byte vector:
  - `blendFactor`
  - `horizonStrength`
  - `horizonRadius`
  - `horizonEchoes`
- In WGSL:
  - Compute previous-frame luminance around the current UV with finite differences.
  - Convert the previous luminance gradient into a bounded screen-space refraction vector.
  - Build echo shells around `uv = vec2(0.5, 0.5)` with radii separated by an inverse echo count.
  - Gate echoes by current-vs-previous change so rapidly changing events leave shorter-lived memory.
  - Sample current frame at the refracted UV, then blend current, history, echo emission, and alpha consistently.
- Disabled state must preserve the current frame-blending output exactly.
- First frame still copies current frame directly; memory starts only when history exists.

### User Sees

- FX controls gain a "Horizon Memory" switch and sliders for memory strength, horizon radius, and echo count.
- With frame blending enabled, bright historical structures bend the current frame and form subtle echo rings around the center. The output changes geometry through UV refraction, not just color.

### Acceptance Bar

- TypeScript compiles.
- Unit tests cover:
  - Store defaults, clamping, and non-finite guard.
  - WGSL exposes the memory uniforms and disabled no-op gate.
  - Shader contract includes previous-frame gradient sampling, UV refraction, echo shell accumulation, and change-gated decay.
- `pnpm exec vitest run src/tests/stores/postProcessingStore.test.ts src/tests/rendering/webgpu/passes/FrameBlendingPass.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm run lint`
- `pnpm test:shaders:fast`

### Outcome

- Commit: `Add Pauli spin helicity view` (amended with this outcome)
- Reviewer result: PASS after fixing renderer integration issues.
- What renderer now draws: a new Pauli `Spin Helicity` field view that writes `|S · curl(S)|` into the density grid from the normalized local Bloch spin vector. The raymarcher colors from the helicity scalar while using preserved total density for opacity, empty-skip, and adaptive stepping.
- Paths affected: Pauli field-view type/UI/packing, Pauli write-grid WGSL, Pauli field-view/color synchronization, simple and full grid raymarch opacity helpers, and focused tests.
- Review fixes:
  - Added Pauli non-dual alpha-density marching in both grid raymarch paths so helicity is not treated as opacity density.
  - Added adaptive-step log-density helper so dense low-helicity regions do not get skipped with large empty-space steps.
- Verification:
  - `pnpm exec vitest run src/tests/rendering/webgpu/pauliSpinHelicityShader.test.ts src/tests/lib/geometry/extended/pauliTypes.test.ts src/tests/stores/pauliSpinorSlice.test.ts src/tests/components/sections/Geometry/PauliSpinorControls/PauliVisualizationControls.test.tsx src/tests/rendering/webgpu/scenePassSetup.test.ts src/tests/lib/physics/pauli/presets.test.ts` — PASS, 102 tests.
  - `pnpm exec tsc --noEmit` — PASS.
  - `pnpm run lint` — PASS.
  - `pnpm test:shaders:fast` — PASS.
  - `git diff --check` — PASS.
- Follow-up threads: numeric CPU reference for uniform and analytic helical spin textures; Pauli-specific color algorithm for signed helicity; skyrmion-density view for `S · (∂xS × ∂yS)`.

### Outcome

- Commit: `Add BEC Hawking flux view` (amended with this outcome)
- Reviewer result: PASS after fixing reviewer-blocking issues.
- What renderer now draws: a new BEC `Hawking Flux κ/2π` field view that writes a bounded, density-gated, horizon-local scalar into the TDSE/BEC density grid. The scalar is tied to the evolved Mach crossing and the same detrended/periodized waterfall surface-gravity profile used by initialization.
- Paths affected: BEC/TDSE field-view types, TDSE uniform packing, TDSE write-grid WGSL, BEC controls, and BEC store guardrails.
- Review fixes:
  - Replaced stale undetrended tanh κ estimate with `L_box`, `edgeT`, detrended `v_s`, periodized density coordinate, and `0.5 * |d(c_s² - v_s²)/dx| / c_s`.
  - Added shader guard so non-`blackHoleAnalog` states render zero for `hawkingFlux`.
  - Hid the UI option outside `blackHoleAnalog` and made the store reject/reset invalid `hawkingFlux` selections.
- Verification:
  - `pnpm exec vitest run src/tests/lib/geometry/extended/becConfig.test.ts src/tests/stores/extendedObjectStore.bec.test.ts src/tests/rendering/webgpu/passes/TDSEComputePassUniforms.test.ts src/tests/rendering/webgpu/tdseWriteGridHawkingFlux.test.ts src/tests/components/sections/Geometry/SchroedingerControls/BECControls.test.tsx` — PASS, 98 tests.
  - `pnpm exec tsc --noEmit` — PASS.
  - `pnpm run lint` — PASS.
  - `pnpm test:shaders:fast` — PASS.
  - `git diff --check` — PASS.
- Follow-up threads: numeric CPU/WGSL parity for κ proxy; combine flux view with Page-curve island overlay; add a preset that starts directly in Hawking-flux view.

## Round PRD: Pauli Spin-Texture Helicity View

### Scientific Goal

Render local twisting of the Pauli spinor's Bloch-vector texture as a first-class volume observable. The Pauli mode already shows spin density, spin expectation, and coherence; it does not show whether the spin field forms chiral/knotted/twisted domains. A helicity view exposes where the normalized spin vector locally aligns with its curl.

### Physics / Math

- Add `spinHelicity` to `PauliFieldView`.
- Map `spinHelicity` to Pauli shader `fieldView = 4`.
- In `pauliWriteGrid`:
  - Compute normalized local spin vector:
    - `Sx = 2 Re(psi_up* psi_down) / rho`
    - `Sy = 2 Im(psi_up* psi_down) / rho`
    - `Sz = (|psi_up|² - |psi_down|²) / rho`
  - Use nearest-neighbor central differences along visible x/y/z axes, with existing absorber-aware edge handling.
  - Compute `curl(S)` and helicity `H = S · curl(S)`.
  - Render `abs(tanh(0.15 * H))` as the display scalar, density-gated by total probability.
  - Preserve total density in alpha for raymarch opacity.
- Keep existing Pauli views unchanged.
- Keep PauliStrategy from collapsing `spinHelicity` back to `totalDensity` when the paired generic color algorithm is active.

### User Sees

- Pauli visualization controls gain `Spin Helicity`.
- Selecting it renders chiral spin-texture regions as bright volume structure. Stern-Gerlach/default states stay mostly dark unless spin precession or quadrupole fields twist the local Bloch texture.

### Acceptance Bar

- TypeScript compiles.
- Unit/source tests cover:
  - `spinHelicity` is a valid Pauli field view.
  - Uniform packing maps `spinHelicity` to `fieldView = 4`.
  - Pauli write-grid has helper math for normalized spin, central differences, curl, and `dot(spin, curl)`.
  - UI exposes `Spin Helicity`.
  - Pauli field-view/color-algorithm normalization preserves `spinHelicity` under its paired generic algorithm.
- `pnpm exec vitest run src/tests/lib/geometry/extended/pauliTypes.test.ts src/tests/stores/pauliSpinorSlice.test.ts src/tests/rendering/webgpu/pauliSpinHelicityShader.test.ts src/tests/rendering/webgpu/scenePassSetup.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm run lint`
- `pnpm test:shaders:fast`

### Outcome

- Commit: `faa88031` (`Add free-scalar freeze-out strain view`)
- Reviewer result: PASS.
- What renderer now draws: a new Free Scalar Field `Freeze` view that writes a bounded cosmological freeze-out strain scalar into the 3D density grid, using proper-frame kinetic, gradient, potential, preheating, and self-interaction terms already present in the compute shader.
- Paths affected: Free Scalar Field write-grid compute shader and field-view UI/packing.
- Verification:
  - `pnpm exec vitest run src/tests/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms.test.ts src/tests/rendering/webgpu/freeScalarCosmologyShaders.test.ts src/tests/components/sections/Geometry/SchroedingerControls/FreeScalarFieldControls.test.tsx` — PASS, 67 tests.
  - `pnpm exec tsc --noEmit` — PASS.
  - `pnpm run lint` — PASS.
  - `pnpm test:shaders:fast` — PASS.
  - `git diff --check` — PASS.
- Follow-up threads: add freeze-out preset scenes; expose strain as analysis texture channel; compare local proxy against k-space occupation growth during preheating.

### Outcome

- Commit: `6441ff4f` (`Add causal horizon memory echo`)
- Reviewer result: PASS.
- What renderer now draws: a frame-history causal horizon memory pass where previous-frame luminance gradients refract the current frame, center-origin radial echo shells sample historical light, and rapid current-vs-history changes suppress memory persistence.
- Paths affected: WebGPU frame-blending postprocess output when frame blending and horizon memory are enabled.
- Local fix before review: inverted the current-vs-history change gate so fast changes shorten memory instead of amplifying it, and locked the WGSL contract with a regression assertion.
- Verification:
  - `pnpm exec vitest run src/tests/stores/postProcessingStore.test.ts src/tests/rendering/webgpu/passes/FrameBlendingPass.test.ts src/tests/stores/utils/presetNormalizationVisual.test.ts src/tests/stores/utils/presetNormalizationShared.test.ts` — PASS, 49 tests.
  - `pnpm exec tsc --noEmit` — PASS.
  - `pnpm run lint` — PASS.
  - `pnpm test:shaders:fast` — PASS.
  - `git diff --check` — PASS.
- Follow-up threads: make horizon center follow brightest gravitational caustic; feed temporal reprojection velocity into echo decay; expose echo field as diagnostic overlay.

## Round PRD: Free-Scalar Cosmological Freeze-Out Strain

### Scientific Goal

Render horizon-scale freeze-out in the free scalar field compute mode as a new density-grid field view. The observable should expose where local gradient stress has redshifted away while the field remains phase-space squeezed between kinetic and potential energy, giving a visual proxy for cosmological mode freeze-out and particle production.

### Physics / Math

- Add `freezeOutStrain` to `FreeScalarFieldView`.
- Map `freezeOutStrain` to shader `fieldView = 4`.
- In `freeScalarWriteGrid`:
  - Reuse nearest-neighbor `φ`, `π`, and axis-weighted gradient energy already computed for energy/analysis paths.
  - Compute proper-frame components:
    - `K = 0.5 * aKinetic * π² / aFull`
    - `G = 0.5 * gradEnergy / aFull`
    - `V = 0.5 * m² * aFull * massSquaredScale * φ² / aFull + V_self`
  - Define freeze-out gate `F = 1 - G / (K + G + V + eps)` so low-gradient, super-horizon-like regions activate.
  - Define phase-space balance `B = 1 - |K - V| / (K + V + eps)` so pure kinetic or pure potential regions do not dominate.
  - Define flux strain from `|π| * sqrt(gradEnergy)` normalized by local total energy so active fronts remain visible.
  - Output `clamp(0.7 * F * B + 0.3 * fluxStrain, 0, 1)`.
- Normalize this view with maxFieldValue `1.0`.
- Keep existing field views bit-identical.

### User Sees

- Free Scalar Field controls gain a `Freeze` field-view option alongside `φ`, `π`, and `ε`.
- Selecting it renders a bounded scalar field showing cosmological freeze-out strain. Under de Sitter, preheating, or Bianchi/Kasner runs, frozen domains and active fronts become visible in the 3D raymarched volume instead of requiring diagnostics.

### Acceptance Bar

- TypeScript compiles.
- Unit/source tests cover:
  - `freezeOutStrain` packs to fieldView enum `4`.
  - Its max-field estimator returns `1.0`.
  - `freeScalarWriteGrid` branch uses `aKinetic`, `aFull`, `gradEnergy`, `massSquaredScale`, `freezeOutGate`, `phaseSpaceBalance`, and `fluxStrain`.
  - UI exposes the `freezeOutStrain` option.
- `pnpm exec vitest run src/tests/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms.test.ts src/tests/rendering/webgpu/freeScalarCosmologyShaders.test.ts src/tests/components/sections/Geometry/SchroedingerControls/FreeScalarFieldControls.test.tsx`
- `pnpm exec tsc --noEmit`
- `pnpm run lint`
- `pnpm test:shaders:fast`

## Round PRD: BEC Analog-Horizon Hawking Flux View

### Scientific Goal

Render the analog black-hole sonic horizon as an emitted-flux field, not only as a Mach-number isosurface. The new view should make the local Hawking-temperature proxy visible where the condensate crosses `M = |v_s| / c_s = 1`, so the waterfall profile shows both the horizon location and the surface-gravity scale that drives phonon production.

### Physics / Math

- Add `hawkingFlux` to the BEC/TDSE field-view enum.
- Map `hawkingFlux` to shader `fieldView = 7`.
- In `tdseWriteGrid`:
  - Reuse `computeSuperfluidVelocityMagSq` to compute local `v_s`.
  - Compute local sound speed `c_s = sqrt(g |psi|^2 / m)`.
  - Gate emission to the sonic horizon with `1 - smoothstep(0, 0.25, abs(M - 1))`.
  - Estimate waterfall surface gravity from the same detrended/periodized profile used by initialization:
    - `L_box = gridSize[0] * spacing[0]`
    - `T = tanh(L_box / (2 L_h))`
    - `v_s(x) = v_max (tanh(x/L_h) - 2xT/L_box)`
    - `q_n(x) = L_box sin(pi x/L_box) / (pi L_h)`
    - `n(x) = n0 (1 - deltaN sech^2(q_n))`
    - `kappa = 0.5 * |d(c_s^2 - v_s^2)/dx| / c_s`
  - Convert to a bounded flux/temperature proxy with `1 - exp(-kappa / 2π)`.
  - Density-gate the result so empty voxels remain transparent.
- Render zero when the active initial condition is not `blackHoleAnalog`.
- Keep existing density, phase, current, potential, velocity, healing-length, and Mach views unchanged.

### User Sees

- BEC controls gain a `Hawking Flux κ/2π` field-view option.
- Selecting it renders a bright, localized shell/sheet near the sonic horizon. Steeper waterfall profiles or larger `v_max` brighten the horizon; weaker/no horizon leaves little emission.

### Acceptance Bar

- TypeScript compiles.
- Unit/source tests cover:
  - `hawkingFlux` is accepted as a BEC field view.
  - `hawkingFlux` packs to TDSE `fieldView = 7`.
  - `tdseWriteGrid` contains the fieldView-7 analog-only branch using Mach, `hawkingVmax`, `hawkingLh`, `hawkingDeltaN`, `horizonGate`, detrended `edgeT`, periodized density derivative, and `surfaceGravity`.
  - BEC UI exposes `Hawking Flux κ/2π` only for `blackHoleAnalog`.
  - BEC store rejects non-analog `hawkingFlux` selection and resets it when leaving `blackHoleAnalog`.
- `pnpm exec vitest run src/tests/lib/geometry/extended/becConfig.test.ts src/tests/stores/extendedObjectStore.bec.test.ts src/tests/rendering/webgpu/passes/TDSEComputePassUniforms.test.ts src/tests/rendering/webgpu/tdseWriteGridHawkingFlux.test.ts src/tests/components/sections/Geometry/SchroedingerControls/BECControls.test.tsx`
- `pnpm exec tsc --noEmit`
- `pnpm run lint`
- `pnpm test:shaders:fast`

### Outcome

- Commit: `Add Dirac axial charge view` (amended with this outcome).
- Reviewer result: independent reviewer stalled and was closed; local source review found no blocking issue.
- What renderer now draws: Dirac Equation has a new `Axial |ψ†γ5ψ|` field view that raymarches normalized local axial/chiral charge magnitude.
- Physics implemented: `γ5 = -i α0 α1 α2` using the existing Clifford alpha matrices, sparse monomial tables when available, dense `gammaMatrices` fallback otherwise, and zero output for `latticeDim < 3`.
- Paths affected: Dirac field-view type/UI/packing, Dirac write-grid shader composition, new axial helper WGSL block, palette sync, and focused tests.
- Verification:
  - `pnpm exec vitest run src/tests/rendering/webgpu/diracAxialChargeShader.test.ts src/tests/components/sections/Geometry/SchroedingerControls/DiracControls.test.tsx src/tests/stores/extendedObjectStore.dirac.test.ts` — PASS, 35 tests.
  - `pnpm exec tsc --noEmit` — PASS.
  - `pnpm run lint` — PASS.
  - `pnpm test:shaders:fast` — PASS.
  - `git diff --check` — PASS.
- Follow-up threads: color signed axial charge instead of magnitude; couple axial charge to a synthetic anomaly source; compare axial domains during Zitterbewegung versus Klein tunneling.

## Round PRD: TDSE Madelung Quantum Pressure View

### Scientific Goal

Render the Madelung quantum-pressure / Bohm quantum-potential magnitude directly from the TDSE density grid. The view should expose where wavefunction amplitude curvature is large enough to behave like an effective stress/curvature source, especially near interference nodes, vortex cores, barriers, compact ringdown potentials, and analog horizons.

### Physics / Math

- Add `quantumPressure` to `TdseFieldView`.
- Map `quantumPressure` to TDSE write-grid `fieldView = 8`.
- In `tdseWriteGrid`:
  - Compute `R = sqrt(|psi|^2)` at the nearest-neighbor voxel.
  - Estimate `∇²R` with per-axis central finite differences using existing spacing/stride/PML-aware boundary conventions.
  - Compute `Q = -(hbar^2 / 2m) * ∇²R / max(R, eps)`.
  - Normalize by `hbar^2 / (2m dx_min^2)` and render `1 - exp(-abs(Q)/scale)`, density-gated by existing `densityGate`.
  - Preserve alpha as raw normalized density and preserve potential overlay behavior.
- Existing TDSE field-view enum values and BEC Hawking enum `7` must remain unchanged.

### User Sees

- TDSE controls gain a `Quantum Pressure Q` field-view option.
- Selecting it renders bright sheets, shells, and filaments where amplitude curvature is high: interference fringes, nodal walls, vortex cores, and barrier-caustic regions.

### Acceptance Bar

- TypeScript compiles.
- Unit/source tests cover:
  - `quantumPressure` packs to TDSE fieldView enum `8` while `hawkingFlux` remains `7`.
  - TDSE UI exposes `Quantum Pressure Q` and setter accepts it.
  - `tdseWriteGrid` has a `fieldView == 8u` branch using `sqrt(max(density, ...))`, `laplacianR`, `hbar`, `mass`, `invSpacings`, `densityGate`, and `displayScalar` from a bounded pressure magnitude.
- `pnpm exec vitest run src/tests/rendering/webgpu/passes/TDSEComputePassUniforms.test.ts src/tests/rendering/webgpu/tdseWriteGridQuantumPressure.test.ts src/tests/components/sections/Geometry/SchroedingerControls/TDSEControls.test.tsx src/tests/stores/tdseUiSetters.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm run lint`
- `pnpm test:shaders:fast`

### Outcome

- Commit: `Add TDSE quantum pressure view` (amended with this outcome).
- Reviewer result: PASS.
- What renderer now draws: TDSE has a new `Quantum Pressure Q` view that raymarches bounded Madelung/Bohm quantum-potential magnitude from amplitude curvature.
- Physics implemented: `Q = -(hbar^2 / 2m) * laplacian(sqrt(rho)) / sqrt(rho)`, normalized by the lattice curvature scale and density-gated, with PML-aware boundary handling.
- Paths affected: TDSE field-view type/UI/packing, TDSE write-grid shader composition, new quantum-pressure WGSL helper, and focused tests.
- Verification:
  - `pnpm exec vitest run src/tests/rendering/webgpu/passes/TDSEComputePassUniforms.test.ts src/tests/rendering/webgpu/tdseWriteGridQuantumPressure.test.ts src/tests/components/sections/Geometry/SchroedingerControls/TDSEControls.test.tsx src/tests/stores/tdseUiSetters.test.ts` — PASS, 65 tests.
  - `pnpm exec tsc --noEmit` — PASS.
  - `pnpm run lint` — PASS.
  - `pnpm test:shaders:fast` — PASS.
  - `git diff --check` — PASS.
- Follow-up threads: signed Q colormap; pressure-gradient force vectors; compare quantum-pressure shells with Regge-Wheeler ringdown potential caustics.
