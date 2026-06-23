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
  let glow = schroedinger.mkGlow;
  let flow = schroedinger.mkFlow;
  // Slow auto-rotation angle: turns the knot about the vertical (y) axis so the
  // 3D linking structure reads instead of projecting flat. Applied to p.xz
  // BEFORE mapping to volume UVW (render-only).
  let rotAngle = flow * schroedinger.time;
  let cosA = cos(rotAngle);
  let sinA = sin(rotAngle);

  // Step budget: LOD-scaled, hard-capped. 5/2 steps per LOD sample keeps several
  // samples per tube at default settings while holding 45+ fps at high pixel loads.
  let maxSteps = clamp((schroedinger.sampleCount * 5) / 2, 48, MK_MAX_STEPS);
  let baseStep = (tFar - tNear) * MK_PATH_SLACK / f32(maxSteps);
  let invSpan = 1.0 / (2.0 * boundR);

  // ── March state ──
  let jitter = mkJitterHash(input.clipPosition.xy);
  var p = ro + rd * (tNear + jitter * baseStep);
  var accumColor = vec3f(0.0);
  var accumAlpha = 0.0;

  for (var i = 0; i < MK_MAX_STEPS; i++) {
    if (i >= maxSteps) { break; }

    // Optional slow auto-rotation of the sampling point about the y axis.
    let pr = vec3f(cosA * p.x - sinA * p.z, p.y, sinA * p.x + cosA * p.z);

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
