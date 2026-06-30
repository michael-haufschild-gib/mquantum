/**
 * WGSL Bifurcation Horizon Main Shader — the Riemann critical strip as the
 * maximally-extended (Kruskal) eternal black hole.
 *
 * Dedicated volumetric main block for quantumMode === 'bifurcationHorizon'.
 * Each camera ray is a straight ray (no geodesic bending) through an
 * N-dimensional field organized around a vertical throat: the throat axis is
 * x₁ = Im s (height t), and the perpendicular radius rPerp folds all the other
 * dimensions. The wedge coordinate u = log(rPerp / r₀) places the bifurcation
 * surface (critical line Re s = ½) at u = 0, with the two Kruskal wedges at
 * u > 0 and u < 0. The functional-equation involution s ↦ 1 − s̄ — the Tomita
 * modular conjugation J — is exactly the wedge reflection u ↦ −u.
 *
 * The heavy ζ-zero / membrane math is precomputed on the CPU
 * (src/lib/physics/bifurcationHorizon.ts) and uploaded as a read-only 2D
 * (t, u) look-up table bound at group 2, binding 2; the shader only does a
 * bilinear LUT lookup, a modular flow shift, and an optional extremal redshift.
 *
 * Visual phenomena produced:
 *  - a glowing vertical throat (the ERB / bifurcation surface) at u = 0,
 *  - sharp GUE-spaced horizontal ζ-zero rings stacked along the throat,
 *  - two faint flaring thermal (KMS) wedges, one on each side of the throat,
 *  - animated modular dilation flow streaming the rings along the throat,
 *  - an optional dark extremal core at r_h with √f-redshifted wedges.
 *
 * Requires (from sibling compose blocks): SchroedingerUniforms + BasisVectors
 * (uniforms.wgsl), camera uniforms + bind groups, constants (TAU / INV_TAU),
 * hsl2rgb, intersectSphere, and the bifurcationLut storage buffer (binding 2).
 * Self-contained otherwise — no volume/quantum blocks.
 *
 * @module rendering/webgpu/shaders/schroedinger/mainBifurcationHorizon.wgsl
 */

/**
 * Generate the Bifurcation Horizon volumetric main block.
 *
 * @returns WGSL source for the fragment entry point
 */
export function generateMainBlockBifurcationHorizon(): string {
  return /* wgsl */ `
// ============================================
// Bifurcation Horizon — Kruskal eternal black hole on the critical strip
// ============================================

const BH_MAX_STEPS: i32 = 256;
// LUT dimensions (must match BIFURCATION_NT / BIFURCATION_NU in physics core).
const BH_NT: i32 = 384;
const BH_NU: i32 = 96;
// Path-length budget multiplier (matches the straight-chord march reserve).
const BH_PATH_SLACK: f32 = 1.05;
// Azimuthal helix turns over the throat height — renders the S(T) spectral-flow
// winding as a barber-pole and breaks the throat's trivial axisymmetry so
// orbiting about the throat axis is meaningful.
const BH_HELIX_PITCH: f32 = 4.0;

/** Cheap per-pixel hash for march-offset jitter (banding suppression). */
fn bhJitterHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

// Color algorithm ids implemented by this mode. Must stay in sync with
// COLOR_ALGORITHM_TO_INT and the bifurcationHorizon allowlist in
// getAvailableColorAlgorithms (src/lib/colors/palette/types.ts).
const BH_ALGO_PHASE: i32 = 3;
const BH_ALGO_MIXED: i32 = 4;
const BH_ALGO_BLACKBODY: i32 = 5;
const BH_ALGO_VIRIDIS: i32 = 19;
const BH_ALGO_DENSITY_CONTOURS: i32 = 21;

/** Compact viridis ramp (5-stop piecewise-linear, matches emission.wgsl). */
fn bhViridis(tIn: f32) -> vec3f {
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
fn bhThermal(tIn: f32) -> vec3f {
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
fn bhEmissionColor(algo: i32, rhoN: f32, phase: f32) -> vec3f {
  if (algo == BH_ALGO_BLACKBODY) {
    return bhThermal(rhoN);
  }
  if (algo == BH_ALGO_VIRIDIS) {
    return bhViridis(rhoN);
  }
  if (algo == BH_ALGO_DENSITY_CONTOURS) {
    // Viridis with iso-density contour shells darkened in.
    let shell = abs(fract(rhoN * 8.0) - 0.5) * 2.0;
    let contour = 0.45 + 0.55 * smoothstep(0.15, 0.5, shell);
    return bhViridis(rhoN) * contour;
  }
  let hue = fract(phase * INV_TAU + 0.58);
  if (algo == BH_ALGO_PHASE) {
    return hsl2rgb(hue, 0.85, 0.55);
  }
  // BH_ALGO_MIXED (default): phase hue, density-driven brightness. Saturation
  // is kept high and lightness moderate so the throat and the two wedges keep
  // distinct, mirror-related hues instead of washing to white under
  // front-to-back accumulation.
  return hsl2rgb(hue, 0.9, 0.5) * (0.55 + 0.7 * rhoN);
}

/**
 * Bilinear sample of the 2D (t, u) LUT density / edge / psi at fractional
 * indices (ft in [0, BH_NT-1], fu in [0, BH_NU-1]). Returns the interpolated
 * vec4f [density, edge, psiRe, psiIm].
 */
fn bhSampleLut(ft: f32, fu: f32) -> vec4f {
  let it0 = i32(floor(ft));
  let iu0 = i32(floor(fu));
  let it1 = min(it0 + 1, BH_NT - 1);
  let iu1 = min(iu0 + 1, BH_NU - 1);
  let at = ft - f32(it0);
  let au = fu - f32(iu0);
  let s00 = bifurcationLut[it0 * BH_NU + iu0];
  let s01 = bifurcationLut[it0 * BH_NU + iu1];
  let s10 = bifurcationLut[it1 * BH_NU + iu0];
  let s11 = bifurcationLut[it1 * BH_NU + iu1];
  let top = mix(s00, s01, au);
  let bot = mix(s10, s11, au);
  return mix(top, bot, at);
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
  let r0 = max(schroedinger.bhNeckRadius, 1e-4);
  let uHalf = schroedinger.bhUHalf;
  let tMax = schroedinger.bhTMax;
  let glow = schroedinger.bhGlow;
  let flow = schroedinger.bhFlowRate;
  let swirl = schroedinger.bhSwirl;
  let rh = schroedinger.bhRedshiftRadius;
  let expo = max(schroedinger.bhMetricExponent, 1.0); // d-2
  let hasHorizon = rh > 1e-6;
  let ftScale = f32(BH_NT - 1) / max(tMax, 1e-4);
  let fuScale = f32(BH_NU - 1) / max(2.0 * uHalf, 1e-4);

  // Step budget: LOD-scaled, hard-capped. 5/2 steps per LOD sample keeps
  // several samples per ring at default settings while holding 45+ fps at high
  // pixel loads.
  let maxSteps = clamp((schroedinger.sampleCount * 5) / 2, 48, BH_MAX_STEPS);
  let baseStep = (tFar - tNear) * BH_PATH_SLACK / f32(maxSteps);

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
  // First-3 ND coordinate basis rows (for the throat axis x₁ and the wedge).
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
  let jitter = bhJitterHash(input.clipPosition.xy);
  var p = ro + rd * (tNear + jitter * baseStep);
  var accumColor = vec3f(0.0);
  var accumAlpha = 0.0;
  var captured = false;

  for (var i = 0; i < BH_MAX_STEPS; i++) {
    if (i >= maxSteps) { break; }

    // Escape: outside the bounding sphere moving outward.
    if (dot(p, p) > boundRSqOut && dot(p, rd) > 0.0) {
      break;
    }

    // Full N-D radius² via the collapsed basis identities above.
    let rTotalSq = max(dot(p, p) + 2.0 * dot(p, bto) + oSq, 1e-10);

    // First-3 ND coords. x₁ is the throat-height axis t = Im s.
    let x0 = o0 + dot(p, axRow);
    let x1 = o1 + dot(p, ayRow);
    let x2 = o2 + dot(p, azRow);

    // Perpendicular radius: total radius² minus the throat-axis component, so
    // rPerp folds dimensions 0, 2, 3, … into the wedge funnel. Centered on
    // t = tMax/2 so the throat straddles the origin along x₁.
    let t = x1 + 0.5 * tMax;
    let rPerpSq = max(rTotalSq - x1 * x1, 0.0);
    let rPerp = sqrt(rPerpSq);

    // Extremal dark core: nothing escapes from inside r_h.
    if (hasHorizon && rPerp < rh) {
      captured = true;
      break;
    }

    // Skip samples outside the field: too close to the throat axis (rPerp → 0,
    // u → −∞), or outside the throat-height window. Costs no LUT traffic.
    if (rPerp < 1e-4 || t < 0.0 || t > tMax) {
      p += rd * baseStep;
      continue;
    }

    // Wedge coordinate u = log(rPerp / r₀). u = 0 ⟺ rPerp = r₀ ⟺ the critical
    // line / bifurcation surface. u > 0 and u < 0 are the two Kruskal wedges;
    // the FE / modular mirror s ↦ 1 − s̄ is u ↦ −u.
    let uGeom = log(rPerp / r0);
    if (uGeom < -uHalf || uGeom > uHalf) {
      p += rd * baseStep;
      continue;
    }

    // Modular dilation flow in the wedge coordinate (render-only): the boost
    // the modular Hamiltonian generates is a translation in u, applied
    // CYCLICALLY on the LUT window so the rings stream along the throat and
    // re-enter at the opposite wedge. An unwrapped shift walks the pattern off
    // the window and the mode fades to black.
    var u = uGeom;
    let uShift = flow * schroedinger.time;
    if (uShift != 0.0) {
      let uRange = 2.0 * uHalf;
      u = -uHalf + fract((uGeom - uShift + uHalf) / uRange) * uRange;
    }

    // Bilinear 2D LUT sample.
    let ft = clamp(t * ftScale, 0.0, f32(BH_NT - 1));
    let fu = clamp((u + uHalf) * fuScale, 0.0, f32(BH_NU - 1));
    let s = bhSampleLut(ft, fu);
    let rho = s.x;
    let psi = vec2f(s.z, s.w);

    // Azimuthal spectral-flow winding: render S(T) = (1/π)arg ζ(½+iT) as a helix
    // climbing the throat — an integer azimuthal mode m_az spiraling with the
    // height t (plus an optional time swirl). This is the genuine FE /
    // spectral-flow winding made visible, and it breaks the throat's trivial
    // axisymmetry so orbiting about the throat axis x₁ actually changes the view.
    let phiAz = atan2(x2, x0);
    let mAz = max(1.0, round(schroedinger.bhWinding));
    let helix = mAz * phiAz + BH_HELIX_PITCH * (t / max(tMax, 1e-4)) * TAU
              + swirl * schroedinger.time;
    let azMod = 0.7 + 0.3 * (0.5 + 0.5 * cos(helix));

    // The KMS thermal-wedge haze is already baked into the LUT density rho on
    // the CPU (bhThermalGain shapes that build); the shader only scales it. The
    // azimuthal helix azMod modulates emission so the throat reads as genuinely 3D.
    let dens = rho * azMod * glow * schroedinger.densityGain;
    if (dens < 1e-5) {
      p += rd * baseStep;
      continue;
    }

    // Extremal redshift: emission from depth rPerp is dimmed by
    // √f = √(1 − (r_h/rPerp)^(d−2)).
    var redshift = 1.0;
    if (hasHorizon) {
      redshift = sqrt(clamp(1.0 - pow(rh / rPerp, expo), 0.0, 1.0));
    }

    // Hue follows the LUT phase plus the azimuthal helix, so the spectral-flow
    // winding tints the throat and the two wedges keep distinct, spiraling hues.
    let phase = atan2(psi.y, psi.x) + 0.5 * helix;
    let rhoN = clamp(rho, 0.0, 1.0);
    var emissColor = bhEmissionColor(schroedinger.colorAlgorithm, rhoN, phase);
    // Luminous rim: the stored edge channel (dDensity/du) peaks on the flanks
    // of the membrane and each zero-ring — a warm-white skin tracing the
    // bifurcation surface and the spectrum.
    let edge = clamp(abs(s.y) * 0.05, 0.0, 1.0);
    emissColor += edge * vec3f(1.0, 0.92, 0.7) * 0.3;
    // Mild HDR lift on cores for the bloom pass — kept small so the per-wedge
    // hues survive tone mapping instead of blowing out to white.
    emissColor *= 1.0 + 0.5 * rhoN * rhoN;

    // Front-to-back accumulation with 1/rPerp divergence compensation: the
    // optical depth integrates in the wedge coordinate (du = drPerp/rPerp — the
    // modular dilation parameter), so every wedge shell contributes the same
    // opacity regardless of its world-space thickness rPerp·Δu. Without the
    // 1/rPerp factor the outer wedges (geometrically thicker) saturate alpha
    // before the throat is reached.
    let stepAlpha = 1.0 - exp(-dens * 0.75 * baseStep / max(rPerp, 0.05));
    let weight = (1.0 - accumAlpha) * stepAlpha;
    accumColor += weight * emissColor * redshift;
    accumAlpha += weight;
    if (accumAlpha > 0.985) { break; }

    p += rd * baseStep;
  }

  // Captured rays terminate on the extremal core: opaque black behind any
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
