/**
 * WGSL Arithmetic Horizon Main Shader — Riemann ζ spectral synthesis.
 *
 * Dedicated volumetric main block for quantumMode === 'riemannZeta'. Each
 * camera ray is a straight ray (no geodesic bending) through an N-dimensional
 * radial density field that reconstructs the prime-number shells from the
 * Riemann ζ zeros (and dually from the primes). The heavy Σ-over-zeros math is
 * precomputed on the CPU (src/lib/physics/riemannZeta.ts) and uploaded as a
 * read-only radial look-up table bound at group 2, binding 2; the shader only
 * does a LUT lookup, an angular factor, and a Berry–Keating horizon redshift.
 *
 * ## The physics
 * Working in the logarithmic radial coordinate u = ln r (the natural
 * coordinate of the Berry–Keating dilation Hamiltonian H = xp), Riemann's
 * explicit formula reconstructs Gaussian bumps of weight Λ(n) = log p at
 * u = k·log p — the prime powers — purely from the zeros. A self-similar
 * dilation flow u → u − flow·t streams the shells across an optional dark
 * horizon core at r_h, with emission dimmed by the Tangherlini redshift
 * √f = √(1 − (r_h/r)^(d−2)).
 *
 * Visual phenomena produced:
 *  - concentric prime shells at the radii r = exp(u) where the LUT density peaks,
 *  - a Hagedorn-temperature brightness ignition as β → 1⁺ (partition gain),
 *  - lobed shells from the real spherical-harmonic angular factor (ℓ, m),
 *  - an optional dark dilation-horizon core with √f redshifted streaming shells.
 *
 * Requires (from sibling compose blocks): SchroedingerUniforms + BasisVectors
 * (uniforms.wgsl), camera uniforms + bind groups, constants (TAU / INV_TAU),
 * hsl2rgb, intersectSphere, and the riemannLut storage buffer (binding 2).
 * Self-contained otherwise — no volume/quantum blocks.
 *
 * @module rendering/webgpu/shaders/schroedinger/mainRiemannZeta.wgsl
 */

/**
 * Generate the Arithmetic Horizon volumetric main block.
 *
 * @returns WGSL source for the fragment entry point
 */
export function generateMainBlockRiemannZeta(): string {
  return /* wgsl */ `
// ============================================
// Arithmetic Horizon — Riemann ζ Volumetric Main
// ============================================

const RZ_MAX_STEPS: i32 = 256;
const RZ_LUT_SIZE: i32 = 1024;
// Path-length budget multiplier (matches the straight-chord march reserve).
const RZ_PATH_SLACK: f32 = 1.05;

/** Cheap per-pixel hash for march-offset jitter (banding suppression). */
fn rzJitterHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

// Color algorithm ids implemented by this mode. Must stay in sync with
// COLOR_ALGORITHM_TO_INT and the riemannZeta allowlist in
// getAvailableColorAlgorithms (src/lib/colors/palette/types.ts).
const RZ_ALGO_PHASE: i32 = 3;
const RZ_ALGO_MIXED: i32 = 4;
const RZ_ALGO_BLACKBODY: i32 = 5;
const RZ_ALGO_VIRIDIS: i32 = 19;
const RZ_ALGO_DENSITY_CONTOURS: i32 = 21;

/** Compact viridis ramp (5-stop piecewise-linear, matches emission.wgsl). */
fn rzViridis(tIn: f32) -> vec3f {
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
fn rzThermal(tIn: f32) -> vec3f {
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
fn rzEmissionColor(algo: i32, rhoN: f32, phase: f32) -> vec3f {
  if (algo == RZ_ALGO_BLACKBODY) {
    return rzThermal(rhoN);
  }
  if (algo == RZ_ALGO_VIRIDIS) {
    return rzViridis(rhoN);
  }
  if (algo == RZ_ALGO_DENSITY_CONTOURS) {
    // Viridis with iso-density contour shells darkened in.
    let shell = abs(fract(rhoN * 8.0) - 0.5) * 2.0;
    let contour = 0.45 + 0.55 * smoothstep(0.15, 0.5, shell);
    return rzViridis(rhoN) * contour;
  }
  let hue = fract(phase * INV_TAU + 0.62);
  if (algo == RZ_ALGO_PHASE) {
    return hsl2rgb(hue, 0.85, 0.55);
  }
  // RZ_ALGO_MIXED (default): phase hue, density-driven brightness. Saturation
  // is kept high and lightness moderate so nested shells keep distinct hues
  // instead of washing to white under front-to-back accumulation.
  return hsl2rgb(hue, 0.9, 0.5) * (0.55 + 0.7 * rhoN);
}

/**
 * |Real spherical harmonic| for ℓ in 0..4 (closed-form). Returns the unsigned
 * magnitude of the (unnormalized, leading-coefficient-dropped) real solid
 * harmonic for the unit direction dir = (x, y, z), with m clamped to [-ℓ, ℓ].
 * ℓ = 0 returns 1 (isotropic). Used as the lobe factor for the prime shells.
 */
fn rzAngular(lIn: i32, mIn: i32, dir: vec3f) -> f32 {
  let l = clamp(lIn, 0, 4);
  if (l == 0) { return 1.0; }
  let m = clamp(mIn, -l, l);
  let x = dir.x;
  let y = dir.y;
  let z = dir.z;
  let x2 = x * x;
  let y2 = y * y;
  let z2 = z * z;

  if (l == 1) {
    if (m == -1) { return abs(y); }
    if (m == 0) { return abs(z); }
    return abs(x);
  }
  if (l == 2) {
    if (m == -2) { return abs(x * y); }
    if (m == -1) { return abs(y * z); }
    if (m == 0) { return abs(3.0 * z2 - 1.0); }
    if (m == 1) { return abs(x * z); }
    return abs(x2 - y2);
  }
  if (l == 3) {
    if (m == -3) { return abs(y * (3.0 * x2 - y2)); }
    if (m == -2) { return abs(x * y * z); }
    if (m == -1) { return abs(y * (5.0 * z2 - 1.0)); }
    if (m == 0) { return abs(z * (5.0 * z2 - 3.0)); }
    if (m == 1) { return abs(x * (5.0 * z2 - 1.0)); }
    if (m == 2) { return abs(z * (x2 - y2)); }
    return abs(x * (x2 - 3.0 * y2));
  }
  // l == 4
  if (m == -4) { return abs(x * y * (x2 - y2)); }
  if (m == -3) { return abs(y * z * (3.0 * x2 - y2)); }
  if (m == -2) { return abs(x * y * (7.0 * z2 - 1.0)); }
  if (m == -1) { return abs(y * z * (7.0 * z2 - 3.0)); }
  if (m == 0) { return abs(35.0 * z2 * z2 - 30.0 * z2 + 3.0); }
  if (m == 1) { return abs(x * z * (7.0 * z2 - 3.0)); }
  if (m == 2) { return abs((x2 - y2) * (7.0 * z2 - 1.0)); }
  if (m == 3) { return abs(x * z * (x2 - 3.0 * y2)); }
  return abs(x2 * (x2 - 3.0 * y2) - y2 * (3.0 * x2 - y2));
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

  // ── Per-fragment scalar constants (uniform-derived) ──
  let uMin = schroedinger.riemannUMin;
  let uMax = schroedinger.riemannUMax;
  let partitionGain = schroedinger.riemannPartitionGain;
  let glow = schroedinger.riemannGlow;
  let rh = schroedinger.riemannHorizonRadius;
  let expo = max(schroedinger.riemannMetricExponent, 1.0); // d-2
  let flow = schroedinger.riemannFlowRate;
  let lf = i32(round(schroedinger.riemannAngularL));
  let mf = i32(round(schroedinger.riemannAngularM));
  let du = (uMax - uMin) / f32(RZ_LUT_SIZE - 1);
  let hasHorizon = rh > 1e-6;
  let cutaway = schroedinger.riemannCutaway > 0.5;

  // Step budget: LOD-scaled, hard-capped. Density spends the whole chord plus
  // a small slack reserve. 5/2 steps per LOD sample keeps several samples per
  // shell at default settings while holding 45+ fps at high pixel loads.
  let maxSteps = clamp((schroedinger.sampleCount * 5) / 2, 48, RZ_MAX_STEPS);
  let baseStep = (tFar - tNear) * RZ_PATH_SLACK / f32(maxSteps);

  // ── Orthonormal-basis collapse (PERF: hoists all N-D work out of the loop) ──
  // The slice basis B = [basisX basisY basisZ] is an orthonormal d×3 triad, so
  // with q = B·p + o:  |q|² = |p|² + 2·p·(Bᵀo) + |o|².
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
  // First-3 ND coordinate basis rows (for the angular direction factor).
  let axRow = vec3f(
    getBasisComponent(basis.basisX, 0),
    getBasisComponent(basis.basisY, 0),
    getBasisComponent(basis.basisZ, 0)
  );
  let ayRow = vec3f(
    getBasisComponent(basis.basisX, 1),
    getBasisComponent(basis.basisY, 1),
    getBasisComponent(basis.basisZ, 1)
  );
  let azRow = vec3f(
    getBasisComponent(basis.basisX, 2),
    getBasisComponent(basis.basisY, 2),
    getBasisComponent(basis.basisZ, 2)
  );
  let o0 = getBasisComponent(basis.origin, 0);
  let o1 = getBasisComponent(basis.origin, 1);
  let o2 = getBasisComponent(basis.origin, 2);
  let boundRSqOut = boundR * boundR * 1.1;

  // ── March state ──
  let jitter = rzJitterHash(input.clipPosition.xy);
  var p = ro + rd * (tNear + jitter * baseStep);
  var accumColor = vec3f(0.0);
  var accumAlpha = 0.0;
  var captured = false;

  for (var i = 0; i < RZ_MAX_STEPS; i++) {
    if (i >= maxSteps) { break; }

    // N-D radius via the collapsed basis identities above.
    let rSq = max(dot(p, p) + 2.0 * dot(p, bto) + oSq, 1e-10);
    let r = sqrt(rSq);

    // Dilation horizon: a dark core. Nothing escapes.
    if (hasHorizon && r < rh) {
      captured = true;
      break;
    }
    // Escape: outside the bounding sphere moving outward.
    if (dot(p, p) > boundRSqOut && dot(p, rd) > 0.0) {
      break;
    }

    // Self-similar dilation flow in the log-radius coordinate (render-only).
    let u = log(r) - flow * schroedinger.time;

    // Outside the LUT u-range the density is exactly zero — edge-clamping
    // would smear the boundary samples over the whole inner core / outer
    // margin as uniform fog (must stay in sync with sampleRiemannDensity).
    if (u < uMin || u > uMax) {
      p += rd * baseStep;
      continue;
    }

    // First-3 ND coords for the angular direction factor.
    let x0 = o0 + dot(p, axRow);
    let x1 = o1 + dot(p, ayRow);
    let x2 = o2 + dot(p, azRow);

    // Cutaway wedge (render-only): remove the x0>0, x1>0 quarter so the
    // interior prime shells read as a clean bullseye cross-section instead of
    // a veiled onion (rays to the inner shells otherwise always cross every
    // outer shell twice). Tested before the LUT fetch — cut samples cost no
    // memory traffic.
    if (cutaway && x0 > 0.0 && x1 > 0.0) {
      p += rd * baseStep;
      continue;
    }

    // Radial LUT sample with linear interpolation.
    let f = clamp((u - uMin) / du, 0.0, f32(RZ_LUT_SIZE - 1));
    let i0 = i32(floor(f));
    let i1 = min(i0 + 1, RZ_LUT_SIZE - 1);
    let tt = f - f32(i0);
    let s0 = riemannLut[i0];
    let s1 = riemannLut[i1];
    let s = mix(s0, s1, tt);
    let rho = s.x;
    let psi = vec2f(s.z, s.w);

    let dir = normalize(vec3f(x0, x1, x2) + vec3f(1e-6));
    let A = rzAngular(lf, mf, dir);
    let ang = A * A;

    let dens = rho * ang * glow * partitionGain * schroedinger.densityGain;
    if (dens < 1e-5) {
      p += rd * baseStep;
      continue;
    }

    // Berry–Keating dilation-horizon redshift: emission from depth r is dimmed
    // by √f = √(1 − (r_h/r)^(d−2)).
    var redshift = 1.0;
    if (hasHorizon) {
      redshift = sqrt(clamp(1.0 - pow(rh / r, expo), 0.0, 1.0));
    }

    let phase = atan2(psi.y, psi.x);
    let rhoN = clamp(rho * ang, 0.0, 1.0);
    var emissColor = rzEmissionColor(schroedinger.colorAlgorithm, rhoN, phase);
    // Luminous shell skins: the stored radial derivative dRho/du peaks on the
    // flanks of every prime shell — a warm-white rim that traces each shell
    // boundary (the delta-comb structure of the explicit formula made visible).
    let edge = clamp(abs(s.y) * 0.06, 0.0, 1.0) * ang;
    emissColor += edge * vec3f(1.0, 0.92, 0.7) * 0.3;
    // Mild HDR lift on shell cores for the bloom pass — kept small so the
    // per-shell hues survive tone mapping instead of blowing out to white.
    emissColor *= 1.0 + 0.5 * rhoN * rhoN;

    // Front-to-back accumulation with radial-divergence compensation: the
    // optical depth integrates in the log-radial coordinate (du = dr/r — the
    // Berry–Keating dilation parameter), so every prime shell contributes the
    // same opacity regardless of its world-space thickness r·Δu. Without the
    // 1/r factor the outer shells (geometrically thicker) saturate alpha
    // before any inner shell is reached.
    let stepAlpha = 1.0 - exp(-dens * 0.75 * baseStep / max(r, 0.05));
    let weight = (1.0 - accumAlpha) * stepAlpha;
    accumColor += weight * emissColor * redshift;
    accumAlpha += weight;
    if (accumAlpha > 0.985) { break; }

    p += rd * baseStep;
  }

  // Captured rays terminate on the horizon: opaque black core behind any
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
