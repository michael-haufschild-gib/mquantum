/**
 * WGSL Modular Knot ("Rademacher Horizon") Main Shader.
 *
 * Dedicated volumetric main block for quantumMode === 'modularKnot'. Each camera
 * ray is a straight ray (no geodesic bending) through a CPU-baked 3D RGBA volume
 * that encodes the trefoil knot core plus one tube per closed modular geodesic,
 * each wound |Φ| times in the meridian and colored by its exact Rademacher
 * invariant Φ. The heavy number theory + splatting runs once on the CPU
 * (src/lib/physics/modularKnot.ts), baked into an N³ RGBA8 volume uploaded as a
 * group-2 3D texture (binding 2) + linear sampler (binding 3); the shader only
 * does a trilinear `textureSampleLevel` per march step.
 *
 * ## The physics
 * The unit tangent bundle of the modular surface SL₂(ℝ)/SL₂(ℤ) is the complement
 * of the trefoil knot in S³ (Ghys, ICM 2006). Every closed geodesic lifts to a
 * **modular knot**; its linking number with the trefoil core equals the
 * **Rademacher invariant Φ** of the corresponding hyperbolic conjugacy class.
 * Φ is the same global topological winding that S(T) = (1/π) arg ζ(½ + iT)
 * realizes analytically — RH "confinement" rendered as a winding number, not a
 * local potential well. The baked RGB carries the diverging Φ color (cool Φ < 0,
 * white Φ = 0, warm Φ > 0); the baked A carries density; the near-white,
 * high-density trefoil core reads as the bright central knot.
 *
 * Requires (from sibling compose blocks): SchroedingerUniforms + BasisVectors
 * (uniforms.wgsl), camera uniforms + bind groups, constants (TAU / INV_TAU),
 * hsl2rgb, intersectSphere, plus the modularKnotVolume texture + modularKnotSampler
 * (binding 2/3). Self-contained otherwise — no volume/quantum blocks.
 *
 * @module rendering/webgpu/shaders/schroedinger/mainModularKnot.wgsl
 */

/**
 * Generate the Modular Knot volumetric main block.
 *
 * @returns WGSL source for the fragment entry point
 */
export function generateMainBlockModularKnot(): string {
  return /* wgsl */ `
// ============================================
// Modular Knot — Rademacher Horizon (3D-texture volumetric main)
// ============================================

const MK_MAX_STEPS: i32 = 256;
// Path-length budget multiplier (matches the straight-chord march reserve).
const MK_PATH_SLACK: f32 = 1.05;
// 4D winding strength: at dimension 4 the W axis winds the knot by an angle
// proportional to the 4th coordinate — the Rademacher invariant Φ (the linking
// number with the trefoil core) realized as a literal 4D screw. The self-crossings
// of the projected knot shear apart along W. 0 at dimension 3 (basis W-row is null).
const MK_W_WIND: f32 = 2.2;

/** Cheap per-pixel hash for march-offset jitter (banding suppression). */
fn mkJitterHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

// Color algorithm ids implemented by this mode. Must stay in sync with
// COLOR_ALGORITHM_TO_INT and the modularKnot allowlist in
// getAvailableColorAlgorithms (src/lib/colors/palette/types.ts).
const MK_ALGO_PHASE: i32 = 3;
const MK_ALGO_MIXED: i32 = 4;
const MK_ALGO_BLACKBODY: i32 = 5;
const MK_ALGO_VIRIDIS: i32 = 19;
const MK_ALGO_DENSITY_CONTOURS: i32 = 21;

/** Compact viridis ramp (5-stop piecewise-linear, matches emission.wgsl). */
fn mkViridis(tIn: f32) -> vec3f {
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
fn mkThermal(tIn: f32) -> vec3f {
  let t = clamp(tIn, 0.0, 1.0);
  let r = clamp(t * 2.4, 0.0, 1.0);
  let g = clamp(t * 1.6 - 0.25, 0.0, 1.0);
  let b = clamp(t * 2.2 - 1.2, 0.0, 1.0);
  return vec3f(r, g, b);
}

/**
 * Per-sample emission color for the active color algorithm.
 * baked is the trilinearly-sampled Φ color; dens is the [0,1] density.
 * MIXED(4)/PHASE(3) use the exact baked Φ color; the density ramps (BLACKBODY/
 * VIRIDIS/DENSITY_CONTOURS) remap dens through the scientific ramps so the
 * topology reads as a single-channel field when the audience wants it.
 */
fn mkEmissionColor(algo: i32, baked: vec3f, dens: f32) -> vec3f {
  if (algo == MK_ALGO_BLACKBODY) {
    return mkThermal(dens);
  }
  if (algo == MK_ALGO_VIRIDIS) {
    return mkViridis(dens);
  }
  if (algo == MK_ALGO_DENSITY_CONTOURS) {
    // Viridis with iso-density contour shells darkened in.
    let shell = abs(fract(dens * 8.0) - 0.5) * 2.0;
    let contour = 0.45 + 0.55 * smoothstep(0.15, 0.5, shell);
    return mkViridis(dens) * contour;
  }
  // MK_ALGO_MIXED (default) and MK_ALGO_PHASE: the exact baked Φ diverging color
  // (cool Φ < 0 / white 0 / warm Φ > 0), modulated by density so the tube cores
  // and the near-white trefoil read brightest.
  return baked * (0.5 + 0.7 * dens);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  // Ray in model space, then rotated into the N-D slice basis B = [basisX basisY
  // basisZ] so the TimelineControls rotation panel turns the knot — exactly as the
  // riemannZeta / hilbertPolya / wdwZeta modes do. There is NO bespoke auto-spin
  // (the old mkFlow·time turntable is removed; all rotation goes through the panel).
  let roM = camera.cameraPositionModel;
  let worldRayDir = normalize(input.vPosition - camera.cameraPosition);
  let rdM = normalize((camera.inverseModelMatrix * vec4f(worldRayDir, 0.0)).xyz);

  let axRow = vec3f(getBasisComponent(basis.basisX, 0), getBasisComponent(basis.basisY, 0), getBasisComponent(basis.basisZ, 0));
  let ayRow = vec3f(getBasisComponent(basis.basisX, 1), getBasisComponent(basis.basisY, 1), getBasisComponent(basis.basisZ, 1));
  let azRow = vec3f(getBasisComponent(basis.basisX, 2), getBasisComponent(basis.basisY, 2), getBasisComponent(basis.basisZ, 2));
  let o3 = vec3f(getBasisComponent(basis.origin, 0), getBasisComponent(basis.origin, 1), getBasisComponent(basis.origin, 2));
  let ro = vec3f(dot(axRow, roM), dot(ayRow, roM), dot(azRow, roM)) + o3;
  let rd3u = vec3f(dot(axRow, rdM), dot(ayRow, rdM), dot(azRow, rdM));
  let len3 = max(length(rd3u), 1e-5);
  let rd = rd3u / len3;
  // 4th-axis (W) projection — the Rademacher screw. Null at dim 3 (wHere ≡ 0).
  let awRow = vec3f(getBasisComponent(basis.basisX, 3), getBasisComponent(basis.basisY, 3), getBasisComponent(basis.basisZ, 3));
  let roW = dot(awRow, roM) + getBasisComponent(basis.origin, 3);
  let rdW = dot(awRow, rdM) / len3;

  let boundR = schroedinger.boundingRadius;
  let tSphere = intersectSphere(ro, rd, boundR);
  if (tSphere.y < 0.0) {
    discard;
  }
  let tNear = max(0.0, tSphere.x);
  let tFar = tSphere.y;

  let glow = schroedinger.mkGlow;

  // Step budget: LOD-scaled, hard-capped. 5/2 steps per LOD sample keeps several
  // samples per tube at default settings while holding 45+ fps at high pixel loads.
  let maxSteps = clamp((schroedinger.sampleCount * 5) / 2, 48, MK_MAX_STEPS);
  let baseStep = (tFar - tNear) * MK_PATH_SLACK / f32(maxSteps);
  let invSpan = 1.0 / (2.0 * boundR);

  // ── March state ──
  let jitter = mkJitterHash(input.clipPosition.xy);
  let t0 = tNear + jitter * baseStep;
  var p = ro + rd * t0;
  var accumColor = vec3f(0.0);
  var accumAlpha = 0.0;

  for (var i = 0; i < MK_MAX_STEPS; i++) {
    if (i >= maxSteps) { break; }

    // ── WILD 4D: RADEMACHER SCREW ──
    // The 4th coordinate w (= roW + rdW·t along the ray) winds the knot about y by
    // MK_W_WIND·w, so the projected self-crossings shear apart into clean linked
    // loops — the Rademacher invariant Φ (the linking number with the trefoil core)
    // made literal as a 4D screw. At dim 3, w ≡ 0 → no winding (panel rotation only).
    let wHere = roW + rdW * (t0 + f32(i) * baseStep);
    let ang = wHere * MK_W_WIND;
    let ca = cos(ang);
    let sa = sin(ang);
    let pr = vec3f(ca * p.x - sa * p.z, p.y, sa * p.x + ca * p.z);

    // Map model-space point to volume UVW. The baked volume spans world [-R, R]³
    // (the splat baked into [-1,1]³, framed by boundingRadius ≈ 4); skip samples
    // outside the unit cube — edge-clamping would smear the boundary voxels.
    let uvw = pr * invSpan + vec3f(0.5);
    if (uvw.x < 0.0 || uvw.x > 1.0 ||
        uvw.y < 0.0 || uvw.y > 1.0 ||
        uvw.z < 0.0 || uvw.z > 1.0) {
      p += rd * baseStep;
      continue;
    }

    // textureSampleLevel (NOT textureSample) — loop/branch-safe trilinear fetch.
    let texel = textureSampleLevel(modularKnotVolume, modularKnotSampler, uvw, 0.0);
    let rgb = texel.rgb;
    let dens = texel.a;
    if (dens < 1e-4) {
      p += rd * baseStep;
      continue;
    }

    var emissColor = mkEmissionColor(schroedinger.colorAlgorithm, rgb, dens);
    emissColor *= glow * sqrt(max(0.25, schroedinger.densityGain));
    // Mild HDR lift on the densest voxels only — kept small so the per-Φ hues
    // survive tone mapping instead of blowing out to white through the bloom.
    emissColor *= 1.0 + 0.2 * dens * dens;

    // Front-to-back accumulation. No 1/r divergence term — this is a Cartesian
    // volume (the splat already carries world-space thickness in the density).
    let stepAlpha = 1.0 - exp(-dens * 6.0 * baseStep);
    let weight = (1.0 - accumAlpha) * stepAlpha;
    accumColor += weight * emissColor;
    accumAlpha += weight;
    if (accumAlpha > 0.985) { break; }

    p += rd * baseStep;
  }

  if (accumAlpha < 0.01) {
    discard;
  }
  return vec4f(accumColor, accumAlpha);
}
`
}
