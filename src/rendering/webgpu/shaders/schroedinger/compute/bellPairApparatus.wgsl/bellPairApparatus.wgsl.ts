/**
 * Bell-pair apparatus density-write shader.
 *
 * Writes a config-aware "apparatus" pattern into the density grid:
 *   - A central source Gaussian whose brightness scales with the Werner
 *     visibility v (mixing dims the singlet).
 *   - Two analyzer cores at (±armOffset, 0, 0) whose brightness scales
 *     with detection efficiency η.
 *   - Per analyzer, two oriented lobes — one along the unprimed Bloch
 *     axis, one along the primed axis (slightly attenuated) — so the
 *     canvas reflects the four CHSH measurement settings. Dragging the
 *     θ/φ sliders rotates the lobes.
 *   - The G (green) channel pulses with the live |S| as in the previous
 *     version.
 *   - Optional CHSH caustic cosmograph: when enabled, the four analyzer
 *     axes and Werner visibility form a signed CHSH eikonal whose fold
 *     caustics add braided lens/cusp density to the actual R/G/B/A grid.
 *
 * Channel layout preserved from the previous shader so the default
 * `pauliSpinDensity` color algorithm continues to work:
 *   R = Alice-side intensity (source/2 + Alice analyzer + Alice lobes)
 *   G = CHSH-glow (QM + LHV)
 *   B = Bob-side intensity   (source/2 + Bob analyzer   + Bob lobes)
 *   A = combined apparatus density
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
  gridSize: u32,             // offset 0
  liveSAbs: f32,             // 4
  liveLhvAbs: f32,           // 8
  trialCount: f32,           // 12
  armOffset: f32,            // 16
  sourceSigma: f32,          // 20
  analyzerSigma: f32,        // 24
  worldScale: f32,           // 28
  visibility: f32,           // 32
  detectionEfficiency: f32,  // 36
  lobeOffset: f32,           // 40
  primedLobeScale: f32,      // 44
  aliceAxis: vec3<f32>,      // 48
  aliceAxisPrime: vec3<f32>, // 64
  bobAxis: vec3<f32>,        // 80
  bobAxisPrime: vec3<f32>,   // 96
  _bobAxisPrimePad: f32,     // 108
  chshCausticEnabled: u32,   // 112
  chshCausticStrength: f32,  // 116
  chshCausticFoldScale: f32, // 120
  chshCausticPhase: f32,     // 124
}

@group(0) @binding(0) var<uniform> bell: BellApparatusUniforms;
@group(0) @binding(1) var densityGrid: texture_storage_3d<rgba16float, write>;

fn gauss3(p: vec3f, center: vec3f, sigma: f32) -> f32 {
  let d = p - center;
  let inv2s2 = 1.0 / (2.0 * sigma * sigma);
  return exp(-dot(d, d) * inv2s2);
}

fn wernerCorrelation(a: vec3f, b: vec3f, visibility: f32) -> f32 {
  return -visibility * clamp(dot(a, b), -1.0, 1.0);
}

fn wernerChshSigned(visibility: f32) -> f32 {
  let eAB = wernerCorrelation(bell.aliceAxis, bell.bobAxis, visibility);
  let eABp = wernerCorrelation(bell.aliceAxis, bell.bobAxisPrime, visibility);
  let eApB = wernerCorrelation(bell.aliceAxisPrime, bell.bobAxis, visibility);
  let eApBp = wernerCorrelation(bell.aliceAxisPrime, bell.bobAxisPrime, visibility);
  return eAB - eABp + eApB + eApBp;
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let N = bell.gridSize;
  if (gid.x >= N || gid.y >= N || gid.z >= N) { return; }

  // Map voxel index to normalized [-1, 1] coordinates.
  let nf = f32(N);
  let p = (vec3f(f32(gid.x), f32(gid.y), f32(gid.z)) + vec3f(0.5)) / nf * 2.0 - vec3f(1.0);

  let aliceCenter = vec3f(-bell.armOffset, 0.0, 0.0);
  let bobCenter   = vec3f( bell.armOffset, 0.0, 0.0);

  // Source: Werner visibility scales the central singlet sphere.
  let source = bell.visibility * gauss3(p, vec3f(0.0), bell.sourceSigma);

  // Detection efficiency scales the entire analyzer apparatus (cores +
  // lobes). η² makes the dimming feel dramatic between perfect (η=1) and
  // marginal (η≈0.83) regimes.
  let etaScale = bell.detectionEfficiency * bell.detectionEfficiency;
  let aliceCore = etaScale * gauss3(p, aliceCenter, bell.analyzerSigma);
  let bobCore   = etaScale * gauss3(p, bobCenter,   bell.analyzerSigma);

  // Oriented lobes. The lobe sits at analyzer_center + lobeOffset * axis_dir
  // so the user's Bloch-sphere setting maps directly to spatial position.
  // Smaller sigma than the analyzer core to keep the two axis lobes
  // distinguishable at canonical-CHSH separation (≈ √2 · lobeOffset).
  let lobeSigma = max(0.06, bell.analyzerSigma * 0.55);
  let aliceA  = etaScale *
                gauss3(p, aliceCenter + bell.lobeOffset * bell.aliceAxis,      lobeSigma);
  let aliceAp = etaScale * bell.primedLobeScale *
                gauss3(p, aliceCenter + bell.lobeOffset * bell.aliceAxisPrime, lobeSigma);
  let bobB    = etaScale *
                gauss3(p, bobCenter   + bell.lobeOffset * bell.bobAxis,        lobeSigma);
  let bobBp   = etaScale * bell.primedLobeScale *
                gauss3(p, bobCenter   + bell.lobeOffset * bell.bobAxisPrime,   lobeSigma);

  // Cold → warm ramp: opacity grows with trial count, saturating around 5k.
  let warmth = clamp(bell.trialCount / 5000.0, 0.0, 1.0);
  let armBoost = 0.4 + 0.6 * warmth;

  // CHSH glow on the green channel: empirical |S| past the classical bound,
  // normalised to the Tsirelson distance (0.828).
  let chsh_glow = clamp((bell.liveSAbs - 2.0) / 0.828, 0.0, 1.0);
  let lhv_glow  = clamp((bell.liveLhvAbs - 2.0) / 0.828, 0.0, 1.0);

  let aliceTotal = (0.5 * source + aliceCore + aliceA + aliceAp) * armBoost;
  let bobTotal   = (0.5 * source + bobCore   + bobB   + bobBp)   * armBoost;

  let r = aliceTotal;
  let b = bobTotal;
  let g = source * chsh_glow + (aliceCore + bobCore) * 0.4 * lhv_glow;
  let a = source + 0.5 * (aliceTotal + bobTotal);
  var outColor = vec4f(r, g, b, a);

  if (bell.chshCausticEnabled != 0u) {
    let causticStrength = clamp(bell.chshCausticStrength, 0.0, 4.0);
    if (causticStrength > 0.0) {
      let causticFoldScale = clamp(bell.chshCausticFoldScale, 0.25, 24.0);
      let causticPhase = clamp(bell.chshCausticPhase, -6.28318530718, 6.28318530718);
      let signedS = wernerChshSigned(clamp(bell.visibility, 0.0, 1.0));
      let positiveSlack = clamp((abs(signedS) - 2.0) / 0.8284271247461903, 0.0, 1.0);

      let pa = p - aliceCenter;
      let pb = p - bobCenter;
      let da = length(pa);
      let db = length(pb);
      let aliceFold = dot(pa, bell.aliceAxis) - dot(pa, bell.aliceAxisPrime);
      let bobFold = dot(pb, bell.bobAxis) - dot(pb, bell.bobAxisPrime);
      let eikonal = da + db + 0.22 * (aliceFold - bobFold);
      let folded = cos(causticFoldScale * eikonal + causticPhase);
      let balanceDelta = da - db;
      let balance = exp(-(balanceDelta * balanceDelta) / (2.0 * 0.42 * 0.42));
      let envelope = exp(-dot(p, p) / (2.0 * 0.9 * 0.9));
      let ridgeCore = exp(-abs(folded) * (1.2 + 2.0 * positiveSlack));
      let ridge = (0.18 + 0.82 * ridgeCore) * balance * envelope;
      let cuspSigma = 0.14 + 0.22 / sqrt(causticFoldScale);
      let cusp = exp(-dot(p, p) / (2.0 * cuspSigma * cuspSigma)) * (1.0 - positiveSlack);
      let lens = causticStrength * (0.18 + 0.82 * positiveSlack) * ridge;
      let shadow = causticStrength * cusp;

      outColor = vec4f(
        max(0.0, r + lens * (0.45 + 0.35 * positiveSlack) - shadow * 0.08),
        max(0.0, g + lens * (0.25 + 1.15 * positiveSlack) - shadow * 0.18),
        max(0.0, b + lens * (0.95 - 0.4 * positiveSlack) + shadow * 0.45),
        max(0.0, a + lens * 0.75 + shadow * 0.25)
      );
    }
  }

  textureStore(densityGrid, vec3i(i32(gid.x), i32(gid.y), i32(gid.z)), outColor);
}
`
