/**
 * WGSL Coherence Horizon Main Shader — Coherence-Sourced Gravity (CSG).
 *
 * Dedicated geodesic main block for `quantumMode === 'coherenceHorizon'`.
 * Instead of the shared straight-ray volume raymarch, every camera ray is a
 * null geodesic of the Schwarzschild–Tangherlini metric
 *
 *   f(r) = 1 − (r_h / r)^(d−2),   μ = r_h^(d−2),
 *
 * whose horizon radius r_h is sourced by the *quantum coherence* of a
 * two-branch cat state (CPU-precomputed: r_h = horizonScale·(1−δ)^(1/(d−2))).
 *
 * Bending uses the exact d-dimensional null Binet equation
 *   u″ + u = (d/2)·μ·u^(d−1)         (u = 1/r)
 * in vector form: a = −(d/2)·μ·h²·r̂ / r^(d+1) with h = |x × v| recomputed per
 * step (exact for planar geodesics; the natural generalization under N-D
 * basis rotation). Verlet-style integration with per-step renormalization.
 *
 * Visual phenomena produced:
 *  - capture (r < r_h) → opaque black event-horizon shadow,
 *  - perihelion near the photon sphere r_ph = r_h·(d/2)^(1/(d−2)) → bright
 *    photon ring (additive, gain via coherenceHorizonRingGain),
 *  - bent paths through the cat cloud → Einstein arcs of the fringes,
 *  - emission damped by the gravitational redshift factor √f(r),
 *  - δ → 1 collapses r_h → 0: straight rays, bare lobes, no shadow.
 *
 * The cat-state density evaluated along the path is
 *   a± = exp(−((u∓s)² + ρ⊥²)/(4w²)),
 *   ρ  = a₊² + a₋² + 2·(1−δ)·a₊·a₋·cos(2kθ)
 * and must stay in sync with `catStateDensity` in
 * `src/lib/physics/coherenceHorizon.ts`.
 *
 * Performance contract (≥45 fps at defaults):
 *  - all metric constants CPU-precomputed (no per-frame derivations),
 *  - adaptive step: fine near the photon sphere, coarse far away,
 *  - 6σ Gaussian reject test before any exp/cos evaluation,
 *  - early exit on capture, escape, and alpha saturation,
 *  - step count tied to the sampleCount LOD uniform.
 *
 * @module rendering/webgpu/shaders/schroedinger/mainCoherenceHorizon.wgsl
 */

/**
 * Generate the Coherence Horizon geodesic main block.
 *
 * Requires (from sibling compose blocks): SchroedingerUniforms + BasisVectors
 * (uniforms.wgsl), camera uniforms + bind groups, constants (TAU), hsl2rgb,
 * and intersectSphere. Self-contained otherwise — no volume/quantum blocks.
 *
 * @returns WGSL source for the fragment entry point
 */
export function generateMainBlockCoherenceHorizon(): string {
  return /* wgsl */ `
// ============================================
// Coherence Horizon — Geodesic Raymarch Main
// ============================================

const MAX_GEODESIC_STEPS: i32 = 192;
// Path-length budget multiplier: bent rays are longer than the straight chord.
const GEODESIC_PATH_SLACK: f32 = 1.35;
// Gaussian support cutoff: skip emission beyond exp(-9) ≈ 1.2e-4.
const CH_CLOUD_CUTOFF: f32 = 9.0;

/** Cheap per-pixel hash for march-offset jitter (banding suppression). */
fn chJitterHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

// Color algorithm ids implemented by this mode. Must stay in sync with
// COLOR_ALGORITHM_TO_INT and the coherenceHorizon allowlist in
// getAvailableColorAlgorithms (src/lib/colors/palette/types.ts).
const CH_ALGO_PHASE: i32 = 3;
const CH_ALGO_MIXED: i32 = 4;
const CH_ALGO_BLACKBODY: i32 = 5;
const CH_ALGO_VIRIDIS: i32 = 19;
const CH_ALGO_DENSITY_CONTOURS: i32 = 21;

/** Compact viridis ramp (5-stop piecewise-linear, matches emission.wgsl). */
fn chViridis(tIn: f32) -> vec3f {
  let t = clamp(tIn, 0.0, 1.0);
  var r: f32; var g: f32; var b: f32;
  if (t < 0.25) {
    let u = t / 0.25;
    r = mix(0.267, 0.231, u); g = mix(0.005, 0.319, u); b = mix(0.329, 0.542, u);
  } else if (t < 0.5) {
    let u = (t - 0.25) / 0.25;
    r = mix(0.231, 0.128, u); g = mix(0.319, 0.567, u); b = mix(0.542, 0.551, u);
  } else if (t < 0.75) {
    let u = (t - 0.5) / 0.25;
    r = mix(0.128, 0.373, u); g = mix(0.567, 0.785, u); b = mix(0.551, 0.380, u);
  } else {
    let u = (t - 0.75) / 0.25;
    r = mix(0.373, 0.993, u); g = mix(0.785, 0.906, u); b = mix(0.380, 0.144, u);
  }
  return vec3f(r, g, b);
}

/** Compact thermal ramp: dim red -> orange -> white-hot by normalized density. */
fn chThermal(tIn: f32) -> vec3f {
  let t = clamp(tIn, 0.0, 1.0);
  let r = clamp(t * 2.4, 0.0, 1.0);
  let g = clamp(t * 1.6 - 0.25, 0.0, 1.0);
  let b = clamp(t * 2.2 - 1.2, 0.0, 1.0);
  return vec3f(r, g, b);
}

/**
 * Per-sample emission color for the active color algorithm.
 * rhoN is the density normalized to [0, 1]; phase is arg(psi).
 */
fn chEmissionColor(algo: i32, rhoN: f32, phase: f32) -> vec3f {
  if (algo == CH_ALGO_BLACKBODY) {
    return chThermal(rhoN);
  }
  if (algo == CH_ALGO_VIRIDIS) {
    return chViridis(rhoN);
  }
  if (algo == CH_ALGO_DENSITY_CONTOURS) {
    // Viridis with iso-density contour shells darkened in.
    let shell = abs(fract(rhoN * 8.0) - 0.5) * 2.0;
    let contour = 0.45 + 0.55 * smoothstep(0.15, 0.5, shell);
    return chViridis(rhoN) * contour;
  }
  let hue = fract(phase * INV_TAU + 0.62);
  if (algo == CH_ALGO_PHASE) {
    return hsl2rgb(hue, 0.85, 0.55);
  }
  // CH_ALGO_MIXED (default): phase hue, density-driven brightness.
  return hsl2rgb(hue, 0.8, 0.58) * (0.65 + 0.6 * rhoN);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Ray setup in model space (matches the shared volumetric main blocks).
  let ro = camera.cameraPositionModel;
  let worldRayDir = normalize(input.vPosition - camera.cameraPosition);
  let rd = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  let boundR = schroedinger.boundingRadius;
  let tSphere = intersectSphere(ro, rd, boundR);
  if (tSphere.y < 0.0) {
    discard;
  }
  let tNear = max(0.0, tSphere.x);
  let tFar = tSphere.y;

  // ── Per-fragment metric + state constants (uniform-derived) ──
  let rh = schroedinger.coherenceHorizonRadius;
  let expo = max(schroedinger.coherenceHorizonMetricExponent, 1.0); // d-2
  let hasHorizon = rh > 1e-6;
  // mu = r_h^(d-2); photon sphere r_ph = r_h * (d/2)^(1/(d-2)), d = expo + 2.
  var mu = 0.0;
  var rPh = 0.0;
  if (hasHorizon) {
    mu = pow(rh, expo);
    rPh = rh * pow(0.5 * (expo + 2.0), 1.0 / expo);
  }
  let sep = schroedinger.coherenceHorizonSeparation;
  let width = max(schroedinger.coherenceHorizonWidth, 1e-3);
  let inv4w2 = 1.0 / (4.0 * width * width);
  let waveK = schroedinger.coherenceHorizonWaveNumber;
  let visibility = 1.0 - clamp(schroedinger.coherenceHorizonDecoherence, 0.0, 1.0);
  let glow = schroedinger.coherenceHorizonGlow;
  let ringGain = schroedinger.coherenceHorizonRingGain;
  let fringeDrift = 0.6 * schroedinger.time;

  // Step budget: LOD-scaled, hard-capped. The base step spends the whole
  // budget on the straight chord plus slack for geodesic curvature.
  // 5/2 steps per LOD sample keeps >=6 samples per interference fringe at
  // default settings while holding 45+ fps at 5K-equivalent pixel loads.
  let maxSteps = clamp((schroedinger.sampleCount * 5) / 2, 48, MAX_GEODESIC_STEPS);
  let baseStep = (tFar - tNear) * GEODESIC_PATH_SLACK / f32(maxSteps);
  let invRPh = select(0.0, 1.0 / max(rPh, 1e-4), hasHorizon);

  // ── Orthonormal-basis collapse (PERF: hoists all N-D work out of the loop) ──
  // The slice basis B = [basisX basisY basisZ] is an orthonormal d×3 triad
  // (rotation-derived), so with q = B·p + o:
  //   |q|²  = |p|² + 2·p·(Bᵀo) + |o|²      (since |B·p| = |p|)
  //   Bᵀq   = p + Bᵀo                       (since BᵀB = I₃)
  //   q[0]  = p·row₀(B) + o[0]
  // Everything the march needs reduces to 3D ops on per-fragment constants —
  // no per-step array<f32,11> construction, no per-step dimension loops.
  var bto = vec3f(0.0);
  var oSq = 0.0;
  for (var j = 0; j < ACTUAL_DIM && j < 11; j++) {
    let oj = getBasisComponent(basis.origin, j);
    oSq += oj * oj;
    bto += oj * vec3f(
      getBasisComponent(basis.basisX, j),
      getBasisComponent(basis.basisY, j),
      getBasisComponent(basis.basisZ, j)
    );
  }
  let axis0 = vec3f(
    getBasisComponent(basis.basisX, 0),
    getBasisComponent(basis.basisY, 0),
    getBasisComponent(basis.basisZ, 0)
  );
  let o0 = getBasisComponent(basis.origin, 0);
  let densitySigmaScale = schroedinger.densityGain * glow;
  let boundRSqOut = boundR * boundR * 1.1;

  // ── March state ──
  let jitter = chJitterHash(input.clipPosition.xy);
  var p = ro + rd * (tNear + jitter * baseStep);
  var v = rd;
  var accumColor = vec3f(0.0);
  var accumAlpha = 0.0;
  var captured = false;
  var minR = 1e9;

  for (var i = 0; i < MAX_GEODESIC_STEPS; i++) {
    if (i >= maxSteps) { break; }

    // N-D radius via the collapsed basis identities above.
    let rSq = max(dot(p, p) + 2.0 * dot(p, bto) + oSq, 1e-10);
    let r = sqrt(rSq);
    minR = min(minR, r);

    // Capture: inside the coherence-sourced horizon. Nothing escapes.
    if (hasHorizon && r < rh) {
      captured = true;
      break;
    }
    // Escape: outside the bounding sphere moving outward.
    if (dot(p, p) > boundRSqOut && dot(p, v) > 0.0) {
      break;
    }

    // Adaptive step: shrink near the photon sphere where curvature peaks.
    var stepLen = baseStep;
    // One pow shared by the redshift factor and the bending magnitude:
    // powInvRExpo = r^-(d-2), so f = 1 - mu·powInvRExpo and
    // r^-(d+1) = powInvRExpo · invR³.
    let invR = 1.0 / r;
    var powInvRExpo = 0.0;
    if (hasHorizon) {
      stepLen *= clamp((r - rh) * invRPh, 0.22, 1.0);
      powInvRExpo = pow(invR, expo);
    }

    // ── Cat-cloud emission (6σ reject before any exp) ──
    let u = dot(p, axis0) + o0;
    let perpSq = max(rSq - u * u, 0.0);
    let dPlus = u - sep;
    let dMinus = u + sep;
    let nearestLobeSq = min(dPlus * dPlus, dMinus * dMinus) + perpSq;
    if (nearestLobeSq * inv4w2 < CH_CLOUD_CUTOFF) {
      let aPlus = exp(-(dPlus * dPlus + perpSq) * inv4w2);
      let aMinus = exp(-(dMinus * dMinus + perpSq) * inv4w2);
      let diag = aPlus * aPlus + aMinus * aMinus;
      let theta = waveK * u + fringeDrift;
      let crossTerm = 2.0 * visibility * aPlus * aMinus * cos(2.0 * theta);
      let rho = max(diag + crossTerm, 0.0);

      if (rho > 1e-5) {
        // Gravitational redshift: emission from depth r is dimmed by sqrt(f).
        var redshift = 1.0;
        if (hasHorizon) {
          redshift = sqrt(clamp(1.0 - mu * powInvRExpo, 0.0, 1.0));
        }
        // Phase of the cat superposition (interference coloring input).
        let phase = atan2((aPlus - aMinus) * sin(theta), (aPlus + aMinus) * cos(theta));
        let rhoN = clamp(rho, 0.0, 1.0);
        let emissColor = chEmissionColor(schroedinger.colorAlgorithm, rhoN, phase);

        let stepAlpha = 1.0 - exp(-rho * densitySigmaScale * stepLen * 3.0);
        let weight = (1.0 - accumAlpha) * stepAlpha;
        accumColor += weight * emissColor * redshift;
        accumAlpha += weight;
        if (accumAlpha > 0.985) { break; }
      }
    }

    // ── Null-geodesic bending: a = -(d/2)·mu·h²·r̂ / r^(d+1) ──
    if (hasHorizon) {
      // Bᵀq = p + Bᵀo (orthonormal collapse) — the N-D radial direction
      // projected to the visible 3-plane, now a constant-time expression.
      let pEff = p + bto;
      let hVec = cross(pEff, v);
      let hSq = dot(hVec, hVec);
      let accelMag = 0.5 * (expo + 2.0) * mu * hSq * powInvRExpo * invR * invR * invR;
      let radialDir = pEff / max(length(pEff), 1e-6);
      v = normalize(v - radialDir * (accelMag * stepLen));
    }
    p += v * stepLen;
  }

  // ── Photon ring: perihelion proximity to r_ph glows warm-gold. HDR-bright
  // (the bloom pass picks it up) with a soft outer halo for visibility. ──
  if (hasHorizon && ringGain > 0.0) {
    let ringWidth = max(0.13 * rPh, 0.025);
    let ringT = (minR - rPh) / ringWidth;
    let core = exp(-ringT * ringT);
    let halo = 0.22 * exp(-abs(ringT) * 0.6);
    let ring = ringGain * (core + halo);
    if (ring > 0.003) {
      let ringColor = vec3f(1.0, 0.84, 0.55);
      accumColor += ring * ringColor * (1.0 - 0.45 * accumAlpha);
      accumAlpha = max(accumAlpha, clamp(ring, 0.0, 1.0) * 0.9);
    }
  }

  // Captured rays terminate on the horizon: opaque black shadow behind any
  // foreground emission already accumulated.
  if (captured) {
    return vec4f(accumColor, 1.0);
  }

  if (accumAlpha < 0.01) {
    discard;
  }
  return vec4f(accumColor, accumAlpha);
}
`
}
