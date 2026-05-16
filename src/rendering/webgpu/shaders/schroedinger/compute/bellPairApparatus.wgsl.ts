/**
 * Bell-pair apparatus density-write shader.
 *
 * Writes a static "apparatus" pattern into the density grid: a central
 * Gaussian source sphere plus two analyzer regions offset along ±x.
 * The R channel encodes Alice-side intensity (spin-up convention) and the
 * B channel encodes Bob-side intensity. The G channel modulates the
 * apparatus by the live CHSH violation strength so the canvas pulses
 * brighter as the empirical |S| grows past the classical bound.
 *
 * Bindings (group 0):
 *   0: uniform `BellApparatusUniforms`
 *   1: storage texture<write> 3D rgba16float (the density grid)
 *
 * Dispatch: 3D, ceil(N/4) per axis with @workgroup_size(4, 4, 4) over the
 * cubic density grid (N×N×N).
 *
 * @module
 */

/**
 * WGSL source for the Bell-pair apparatus density-write kernel.
 * Composed verbatim into the strategy's compute pipeline.
 */
export const bellPairApparatusWgsl = /* wgsl */ `
struct BellApparatusUniforms {
  /** Density-grid resolution (uniform N for an N×N×N cube). */
  gridSize: u32,
  /** Live |S| from the QM accumulator; drives green-channel pulse. */
  liveSAbs: f32,
  /** Live |S| from the LHV accumulator; drives the dim secondary pulse. */
  liveLhvAbs: f32,
  /** Total trial count (used to ramp the apparatus from cold → warm). */
  trialCount: f32,
  /** Analyzer-arm offset along x in normalized [-1, 1] grid coords. */
  armOffset: f32,
  /** Source Gaussian sigma (in normalized grid coords). */
  sourceSigma: f32,
  /** Analyzer Gaussian sigma. */
  analyzerSigma: f32,
  /** Bounding-radius scale to map normalized coords to world units. */
  worldScale: f32,
}

@group(0) @binding(0) var<uniform> bell: BellApparatusUniforms;
@group(0) @binding(1) var densityGrid: texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let N = bell.gridSize;
  if (gid.x >= N || gid.y >= N || gid.z >= N) { return; }

  // Map voxel index to normalized [-1, 1] coordinates.
  let nf = f32(N);
  let p = (vec3f(f32(gid.x), f32(gid.y), f32(gid.z)) + vec3f(0.5)) / nf * 2.0 - vec3f(1.0);

  // Source Gaussian at origin: equal up/down (singlet visualization).
  let r2_source = dot(p, p);
  let inv2s2_source = 1.0 / (2.0 * bell.sourceSigma * bell.sourceSigma);
  let source = exp(-r2_source * inv2s2_source);

  // Alice analyzer at (-arm, 0, 0) — biased to up (R) channel.
  let pA = p - vec3f(-bell.armOffset, 0.0, 0.0);
  let r2_A = dot(pA, pA);
  let inv2s2_arm = 1.0 / (2.0 * bell.analyzerSigma * bell.analyzerSigma);
  let alice = exp(-r2_A * inv2s2_arm);

  // Bob analyzer at (+arm, 0, 0) — biased to down (B) channel.
  let pB = p - vec3f(bell.armOffset, 0.0, 0.0);
  let r2_B = dot(pB, pB);
  let bob = exp(-r2_B * inv2s2_arm);

  // Cold → warm ramp: opacity grows with trial count, saturating around 5k.
  let warmth = clamp(bell.trialCount / 5000.0, 0.0, 1.0);

  // Tsirelson glow: green channel intensity is the empirical CHSH overage
  // past the classical bound, normalised to the Tsirelson distance (0.828).
  let chsh_glow = clamp((bell.liveSAbs - 2.0) / 0.828, 0.0, 1.0);
  let lhv_glow = clamp((bell.liveLhvAbs - 2.0) / 0.828, 0.0, 1.0);

  // R = Alice intensity (source + Alice arm), B = Bob intensity.
  let r = (0.5 * source + alice) * (0.4 + 0.6 * warmth);
  let b = (0.5 * source + bob) * (0.4 + 0.6 * warmth);
  // G encodes the CHSH glow; the renderer's color algorithm picks it up.
  let g = source * chsh_glow + (alice + bob) * 0.4 * lhv_glow;
  // A = combined magnitude (used by some color algos as the absolute density).
  let a = source + 0.5 * (alice + bob);

  textureStore(densityGrid, vec3i(i32(gid.x), i32(gid.y), i32(gid.z)), vec4f(r, g, b, a));
}
`
