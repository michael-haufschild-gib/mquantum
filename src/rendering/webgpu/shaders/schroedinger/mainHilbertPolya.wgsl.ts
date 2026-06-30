/**
 * WGSL Hilbert–Pólya Spectrum Main Shader — Evans-landscape filament volume.
 *
 * Dedicated volumetric main block for quantumMode === 'hilbertPolya'. Each
 * camera ray is a straight ray (no geodesic bending) through a 3D box volume
 * (Re z, Im z, θ) of the Riemann operator's shooting determinant |Ẽ_θ(z)|.
 * The heavy FFT/dip-detection math is computed in a Web Worker
 * (src/lib/physics/hilbertPolya/volume.worker.ts) and uploaded progressively
 * as a read-only volume LUT bound at group 2, binding 2; the shader only does
 * a manual trilinear interpolation per sample.
 *
 * ## The physics
 * Zeros of the shooting determinant Ẽ_θ on the real z-axis are the Riemann
 * ordinates γ_n — they appear as bright filaments pinned to the Im z = 0
 * plane (the Riemann Hypothesis as geometry). The (1−2^{1−s}) prefactor comb
 * sits at Im z = −1/2 (off-axis calibration). The θ axis sweeps the contour
 * rotation: at θ ≈ 0 the zeros drown beneath the archimedean e^{−πz/2}
 * cancellation noise — rendered as the dim "Matsubara veil" fog — and
 * crystallize as θ → π/2 − 0.15.
 *
 * Volume LUT layout: flat array<vec4f>, index = ((k·48 + j)·160 + i);
 * i ↦ Re z, j ↦ Im z, k ↦ θ. Channels: x = filament intensity [0,1],
 * y = veil mask [0,1], z = distance to nearest dip, w = arg Ẽ.
 *
 * Requires (from sibling compose blocks): SchroedingerUniforms + BasisVectors
 * (uniforms.wgsl), camera uniforms + bind groups, constants (TAU / INV_TAU),
 * hsl2rgb, intersectSphere, and the hilbertPolyaVolume storage buffer
 * (binding 2). Self-contained otherwise — no volume/quantum blocks.
 *
 * @module rendering/webgpu/shaders/schroedinger/mainHilbertPolya.wgsl
 */

/**
 * Generate the Hilbert–Pólya Spectrum volumetric main block.
 *
 * @returns WGSL source for the fragment entry point
 */
export function generateMainBlockHilbertPolya(): string {
  return /* wgsl */ `
// ============================================
// Hilbert–Pólya Spectrum — Evans Landscape Volumetric Main
// ============================================

const HP_MAX_STEPS: i32 = 256;
// Volume LUT resolution (must match HP_VOL_NX / HP_VOL_NY / HP_VOL_NTHETA in
// src/lib/physics/hilbertPolya/evans.ts).
const HP_NX: i32 = 160;
const HP_NY: i32 = 48;
const HP_NTHETA: i32 = 40;
// Model-space half-extents of the (Re z, Im z, θ) box.
const HP_HALF_EXT: vec3f = vec3f(3.2, 1.2, 2.0);
// Path-length budget multiplier (matches the straight-chord march reserve).
const HP_PATH_SLACK: f32 = 1.05;
// 4D Matsubara-frequency coupling: at dimension 4 the W axis is read as an extra
// Matsubara frequency ω that shifts the contour-rotation θ. The shift sweeps the
// veil-lift across the image so the spectral filaments crystallize along a
// diagonal as the slice tilts into W. 0 at dimension 3 (the basis W-row is null).
const HP_W_OMEGA: f32 = 1.6;

/** Cheap per-pixel hash for march-offset jitter (banding suppression). */
fn hpJitterHash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

// Keep in sync with the hilbertPolya color-algorithm allowlist.
const HP_ALGO_PHASE: i32 = 3;
const HP_ALGO_MIXED: i32 = 4;
const HP_ALGO_BLACKBODY: i32 = 5;
const HP_ALGO_VIRIDIS: i32 = 19;
const HP_ALGO_DENSITY_CONTOURS: i32 = 21;

/** Compact viridis ramp (5-stop piecewise-linear, matches emission.wgsl). */
fn hpViridis(tIn: f32) -> vec3f {
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
fn hpThermal(tIn: f32) -> vec3f {
  let t = clamp(tIn, 0.0, 1.0);
  let r = clamp(t * 2.4, 0.0, 1.0);
  let g = clamp(t * 1.6 - 0.25, 0.0, 1.0);
  let b = clamp(t * 2.2 - 1.2, 0.0, 1.0);
  return vec3f(r, g, b);
}

/**
 * Per-sample emission color for the active color algorithm.
 * f is the filament intensity in [0, 1]; phase is arg Ẽ.
 */
fn hpEmissionColor(algo: i32, f: f32, phase: f32) -> vec3f {
  if (algo == HP_ALGO_BLACKBODY) {
    return hpThermal(f);
  }
  if (algo == HP_ALGO_VIRIDIS) {
    return hpViridis(f);
  }
  if (algo == HP_ALGO_DENSITY_CONTOURS) {
    // Viridis with iso-intensity contour shells darkened in.
    let shell = abs(fract(f * 8.0) - 0.5) * 2.0;
    let contour = 0.45 + 0.55 * smoothstep(0.15, 0.5, shell);
    return hpViridis(f) * contour;
  }
  let hue = fract(phase * INV_TAU + 0.62);
  if (algo == HP_ALGO_PHASE) {
    return hsl2rgb(hue, 0.85, 0.55);
  }
  // HP_ALGO_MIXED: phase hue, filament-driven brightness.
  return hsl2rgb(hue, 0.9, 0.5) * (0.55 + 0.7 * f);
}

/** Trilinear sample of the (Re z, Im z, θ) volume LUT. */
fn hpSampleVolume(n: vec3f) -> vec4f {
  let fx = n.x * f32(HP_NX - 1);
  let fy = n.y * f32(HP_NY - 1);
  let fz = n.z * f32(HP_NTHETA - 1);
  let i0 = clamp(i32(floor(fx)), 0, HP_NX - 1);
  let j0 = clamp(i32(floor(fy)), 0, HP_NY - 1);
  let k0 = clamp(i32(floor(fz)), 0, HP_NTHETA - 1);
  let i1 = min(i0 + 1, HP_NX - 1);
  let j1 = min(j0 + 1, HP_NY - 1);
  let k1 = min(k0 + 1, HP_NTHETA - 1);
  let tx = clamp(fx - f32(i0), 0.0, 1.0);
  let ty = clamp(fy - f32(j0), 0.0, 1.0);
  let tz = clamp(fz - f32(k0), 0.0, 1.0);

  let s000 = hilbertPolyaVolume[(k0 * HP_NY + j0) * HP_NX + i0];
  let s100 = hilbertPolyaVolume[(k0 * HP_NY + j0) * HP_NX + i1];
  let s010 = hilbertPolyaVolume[(k0 * HP_NY + j1) * HP_NX + i0];
  let s110 = hilbertPolyaVolume[(k0 * HP_NY + j1) * HP_NX + i1];
  let s001 = hilbertPolyaVolume[(k1 * HP_NY + j0) * HP_NX + i0];
  let s101 = hilbertPolyaVolume[(k1 * HP_NY + j0) * HP_NX + i1];
  let s011 = hilbertPolyaVolume[(k1 * HP_NY + j1) * HP_NX + i0];
  let s111 = hilbertPolyaVolume[(k1 * HP_NY + j1) * HP_NX + i1];

  let s00 = mix(s000, s100, tx);
  let s10 = mix(s010, s110, tx);
  let s01 = mix(s001, s101, tx);
  let s11 = mix(s011, s111, tx);
  let s0 = mix(s00, s10, ty);
  let s1 = mix(s01, s11, ty);
  return mix(s0, s1, tz);
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

  let glow = schroedinger.hpGlow;
  let fog = schroedinger.hpFogGain;
  let planeMarker = schroedinger.hpPlaneMarker > 0.5;
  let gain = schroedinger.densityGain;

  // LOD-scaled, hard-capped step budget.
  let maxSteps = clamp((schroedinger.sampleCount * 5) / 2, 48, HP_MAX_STEPS);
  let baseStep = (tFar - tNear) * HP_PATH_SLACK / f32(maxSteps);

  // First-3 rows of the N-D rotation; sample the box in rotated coordinates.
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
  let boxOrigin = vec3f(
    getBasisComponent(basis.origin, 0),
    getBasisComponent(basis.origin, 1),
    getBasisComponent(basis.origin, 2)
  );
  // 4th-axis (W) row of the N-D basis — the Matsubara frequency ω. Null at
  // dimension 3, so wq ≡ 0 and the box sampling is byte-identical to the 3D mode.
  let awRow = vec3f(
    getBasisComponent(basis.basisX, 3),
    getBasisComponent(basis.basisY, 3),
    getBasisComponent(basis.basisZ, 3)
  );
  let awOrigin = getBasisComponent(basis.origin, 3);

  let jitter = hpJitterHash(input.clipPosition.xy);
  var p = ro + rd * (tNear + jitter * baseStep);
  var accumColor = vec3f(0.0);
  var accumAlpha = 0.0;
  let filamentWidth = max(schroedinger.hpFilamentWidth, 0.02);

  for (var i = 0; i < HP_MAX_STEPS; i++) {
    if (i >= maxSteps) { break; }

    // Rotated-frame coordinates, then normalized box coordinates; samples
    // outside the box contribute nothing.
    let q = boxOrigin + vec3f(dot(p, axRow), dot(p, ayRow), dot(p, azRow));
    // 4D: the Matsubara frequency ω = (W-projection of p) shifts the θ
    // contour-rotation axis, so the veil-lift becomes a spatial gradient. At
    // dimension 3, wq ≡ 0 and qz = q.z (the box sampling is unchanged).
    let wq = dot(p, awRow) + awOrigin;
    let qz = q.z + wq * HP_W_OMEGA;
    let n = (vec3f(q.x, q.y, qz) + HP_HALF_EXT) / (2.0 * HP_HALF_EXT);
    if (any(n < vec3f(0.0)) || any(n > vec3f(1.0))) {
      p += rd * baseStep;
      continue;
    }

    let s = hpSampleVolume(n);
    // Filament profile applied here against the LUT's distance channel — the
    // width slider is a pure uniform (instant, sub-voxel, no LUT recompute).
    let f = s.x * exp(-0.5 * (s.z * s.z) / (filamentWidth * filamentWidth));
    let v = s.y;       // Matsubara veil mask
    let phase = s.w;   // arg Ẽ

    // Bright filament emission colored by the active color algorithm, plus a
    // dim cool-grey veil fog where the f64 cancellation floor swallows |Ẽ|.
    var emiss = hpEmissionColor(schroedinger.colorAlgorithm, f, phase) * (f * glow * gain);
    emiss += vec3f(0.45, 0.5, 0.62) * v * fog * 0.25;

    // Critical-plane marker: a faint warm sheet at Im z = 0 — the plane every
    // filament is pinned to (render-only).
    if (planeMarker && abs(q.y) < 0.012) {
      emiss += vec3f(0.9, 0.85, 0.6) * 0.08;
    }

    // Front-to-back accumulation. Filaments carry the opacity; the veil adds
    // a weak fog term so the unrotated end reads as a haze, not a void.
    let stepAlpha = 1.0 - exp(-(f * glow + v * fog * 0.3) * 0.9 * baseStep);
    let weight = (1.0 - accumAlpha) * stepAlpha;
    accumColor += weight * emiss;
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
