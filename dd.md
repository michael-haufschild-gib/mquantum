  Root Cause 1: canonicalDensityCompensation creates extreme opacity saturation (MOST
  LIKELY)

  Evidence chain:

  The computeCanonicalCompensation() method (WebGPUSchrodingerRenderer.ts:819-866)
  computes a per-state density gain multiplier based on the ratio between old "visual
  damping" and new canonical normalization. For the Nodal Structure preset |6,2,2⟩:

  - n=6 dimension: damp=0.156, alphaNorm*norm=0.0035 → ratio=44.6, density ratio=1,990
  - n=2 dimensions (×2): ratio=2.35, density ratio=5.54 each
  - 3D product: 1,990 × 5.54 × 5.54 ≈ 61,000×

  At WebGPUSchrodingerRenderer.ts:1153:
  floatView[684 / 4] = (schroedinger?.densityGain ?? 2.0) *
  this.canonicalDensityCompensation

  Effective densityGain = 2.0 × 61,000 = 122,000. Even at the minimum user slider (0.1):
  0.1 × 61,000 = 6,100.

  Beer-Lambert consequences with densityGain=122,000, stepLen≈0.25:
  - At peak ρ=0.006: α = 1−exp(−122000×0.006×0.25) = 1.0 (fully opaque)
  - At ρ=6e-5 (100× below peak): α = 1−exp(−1.84) = 0.84 (still highly opaque)
  - At ρ=6e-7 (10,000× below peak): α = 1−exp(−0.018) = 0.018 (still visible)

  Visual result: The entire volume becomes a solid opaque mass within 1-2 ray steps. All
  internal density variations (lobes, nodes) are invisible because transmittance drops to
  ~0 immediately. The object looks like a uniform blob with diffuse edges where the
  Gaussian tail gradually crosses the visibility threshold. More complex states have
  higher compensation → worse saturation.

  Why the 3 previous fixes didn't help: None of them addressed the densityGain scaling.
  More samples of a fully-saturated field don't add detail. Removing the nodal floor
  doesn't matter when surrounding density is 10,000× the floor value.

  Fix: Replace the ratio-based compensation with an auto-normalization that targets a
  specific peak alpha per step (e.g., 0.3). Compute the expected peak density
  analytically, then set densityGain = −ln(1 − target_alpha) / (peak_ρ ×
  estimated_step_len). This ensures the full density dynamic range maps to a useful
  opacity range regardless of quantum numbers.

  ---




  Root Cause 2: HQ path tetrahedral stencil replaces point-sampled density with spatial
  average

  Evidence chain:

  In the default quality path (volumeRaymarchHQ, used when quality.qualityMultiplier ≥
  0.75), when the eigenfunction cache is disabled (USE_ANALYTICAL_GRADIENT = false),
  density for compositing comes from sampleWithTetrahedralGradient()
  (integration.wgsl.ts:48-65):

  // Lines 50-58: samples at 4 offset positions, AVERAGES for center density
  let d0 = sampleDensityWithPhase(pos + TETRA_V0 * delta, t, uniforms);  // delta=0.05
  let d1 = sampleDensityWithPhase(pos + TETRA_V1 * delta, t, uniforms);
  let d2 = sampleDensityWithPhase(pos + TETRA_V2 * delta, t, uniforms);
  let d3 = sampleDensityWithPhase(pos + TETRA_V3 * delta, t, uniforms);
  let rho = (d0.x + d1.x + d2.x + d3.x) * 0.25;  // ← spatial average!

  This averaged rho is then used for alpha compositing at integration.wgsl.ts:1000. The
  stencil radius is 0.05 × 0.577 ≈ 0.029 units. Near a nodal plane (where ρ should be
  exactly 0), one or more stencil vertices sample the adjacent lobes, lifting the "zero"
  to a nonzero average. This is a built-in spatial lowpass filter.

  Contrast with the fast path (volumeRaymarch): it uses sampleDensityWithPhaseAndFlow()
  which evaluates density at the exact center point, then computes gradient separately
  only for lit samples. The fast path has no density averaging.

  Why the user sees it regardless of eigencache setting: With eigencache ON, the HQ path
  uses sampleDensityWithAnalyticalGradient (bypassing tetrahedral averaging). With
  eigencache OFF, it uses tetrahedral averaging. Both paths can have smearing but from
  different mechanisms — the eigencache-off path has this additional spatial blur.

  Fix: Decouple gradient from density in the HQ path. Use the quickCheck point-sampled
  density (integration.wgsl.ts:962-963) for alpha compositing, and only use the
  tetrahedral stencil for the gradient vector (lighting normals). This is already how the
  fast path works — apply the same pattern to HQ.

  ---
  Root Cause 3: HO-specific early ray termination cuts off outer lobes

  Evidence chain:

  At integration.wgsl.ts:694,729-737:
  let allowEarlyExit = (uniforms.quantumMode == QUANTUM_MODE_HARMONIC);
  ...
  if (allowEarlyExit && rho < MIN_DENSITY) {  // MIN_DENSITY = 1e-8
    lowDensityCount++;
    if (lowDensityCount > 5) { break; }  // ← terminates ENTIRE ray

  For |6,2,2⟩, the wavefunction has nodal planes where ρ drops to zero. After 5
  consecutive near-zero samples, the ray terminates entirely — all lobes beyond the
  current position are invisible.

  With adaptive step size (4× at sCenter < -12, line 755), each step near a node can be
  0.25 × 4 = 1.0 unit. Five such steps span 5 units, which is larger than the typical lobe
   spacing (~1.0 unit for H₆). The ray can terminate midway through the object, cutting
  off outer lobes and creating a "melted" or truncated appearance.

  This was NOT targeted by fix #1: Fix #1 reduced the skip multipliers (2×/4×/8×) but did
  NOT change the termination threshold of 5 consecutive samples. The termination is a
  separate mechanism from the skip acceleration.

  Fix: remove the HO-specific early termination entirely (it saves negligible
  GPU time since the Gaussian envelope skip already handles the tail)


interrupting here: the tonemapping was initially part of the cinematic pass as you can also see that its ui controls are in the cinematic tab in
  the right editor. somehow this got messed up. originally also this was supposed to be a 1:1 port of the threejs tonemapping algos/shaders as this
  project originally used threejs. continue and plan accordingly. we may have now correct implementations but in the tonemapping implementation
  outside of the cinematic pass. needs some thoughts and cleanup

also: debugoverlaypass dead code? are the debug overlays working at all? light gizmos are not working right now. are the debug previews for depth/normal/temporal depth buffer from the performance monitor working?


  Hydrogen momentum — the one exception

  Hydrogen momentum space has a genuinely different functional form (Fock transform, rational functions of k). This WOULD need a separate shader path.
  But it could be deferred — HO covers the entire 1D-11D range which is the primary use case.

  Options to Improve Isosurface FPS

  Roughly ordered by impact/effort ratio:
  Option: Temporal reprojection for iso
  Expected Gain: ~2-4x
  Effort: Medium
  Description: Depth-based reprojection is actually easier for opaque surfaces than volumetric. Render quarter-res, reproject using depth + motion
    vectors.
  ────────────────────────────────────────
  Option: Density grid for iso march
  Expected Gain: ~2-3x per step
  Effort: Medium
  Description: Use the cached 3D texture for marching steps; only evaluate inline wavefunction for the final 5 bisection refinements + gradient.
  ────────────────────────────────────────
  Option: Occupancy/empty-space grid
  Expected Gain: ~1.5-3x
  Effort: Medium
  Description: Low-res 3D grid marking empty vs occupied cells. March can skip entire empty cells in one step, avoiding wasted evalPsi in inter-lobe
  gaps.
  ────────────────────────────────────────
  Option: Analytical gradient
  Expected Gain: ~1.3x post-hit
  Effort: Low
  Description: Already partially supported. Expanding coverage avoids 4 tetrahedral samples for the normal.
  ────────────────────────────────────────
  Option: Distance-adaptive max steps
  Expected Gain: ~1.2-1.5x
  Effort: Low
  Description: Reduce max steps for distant pixels based on screen-space pixel footprint.
  ────────────────────────────────────────
  Option: Simpler lighting option
  Expected Gain: ~1.1x
  Effort: Low
  Description: A Lambert-only fast path (skip GGX specular) when quality < 0.75.
  The two highest-impact improvements are temporal reprojection (since it's a multiplier on total pixel count) and density grid support (since it's a
  multiplier on per-step cost). Combined they could bring iso FPS much closer to volumetric.

  Want me to investigate implementing any of these?


 Out of Scope
 Item: Type system alignment (3 parallel type systems)
 Why deferred: Structural change, needs production team input
 ────────────────────────────────────────
 Item: Visual feedback for non-technical users
 Why deferred: UX redesign, not an enforcement gap
 ────────────────────────────────────────
 Item: Context rot mitigation
 Why deferred: Already partially addressed by per-game CLAUDE.md; further work needs research
 ────────────────────────────────────────
 Item: Additional docs consolidation/deprecation
 Why deferred: Can be done incrementally as docs are touched
  1. Bloom blur compute — largest single-pass FPS improvement, well-understood technique
  2. FXAA compute — good bandwidth reduction, straightforward tiling
  3. Pass fusion (tonemapping + paper) — eliminates intermediate texture, moderate effort
