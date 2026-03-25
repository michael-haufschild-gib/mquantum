/**
 * Classical-quantum correspondence overlay shader.
 *
 * Renders the classical Ehrenfest trajectory ⟨x⟩(t) as a glowing trail
 * embedded inside the quantum probability cloud. Trail anchor positions are
 * precomputed on the CPU each frame in model space (including N-D projection);
 * the shader computes the true closest distance between the camera ray and
 * each trail segment via a 2x2 linear solve, producing a smooth continuous glow.
 *
 * Supports all quantum modes:
 * - HO: Analytical Lissajous from energy-shell amplitudes (CPU-projected for N-D)
 * - TDSE/BEC: Ehrenfest trajectory from A3 observables ⟨x_i⟩(t) history
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/classicalOverlay.wgsl
 */

/** No-op stub when classical overlay is disabled at compile time. Includes struct for symbol resolution. */
export const classicalOverlayStubWGSL = /* wgsl */ `
struct ClassicalOverlayResult {
  color: vec3f,
  alpha: f32,
  depth: f32,
}

fn evaluateClassicalOverlay(
  ro: vec3f, rd: vec3f, tNear: f32, tFar: f32, uniforms: SchroedingerUniforms, dimension: i32
) -> ClassicalOverlayResult {
  var result: ClassicalOverlayResult;
  result.color = vec3f(0.0);
  result.alpha = 0.0;
  result.depth = tFar;
  return result;
}
`

export const classicalOverlayWGSL = /* wgsl */ `

struct ClassicalOverlayResult {
  color: vec3f,
  alpha: f32,
  depth: f32,
}

/**
 * Compute the minimum distance between ray R(t)=ro+t*rd and segment S(s)=A+s*AB,
 * returning (distance, rayT, segmentT).
 */
fn raySegmentClosest(
  ro: vec3f, rd: vec3f, A: vec3f, B: vec3f
) -> vec3f {
  let AB = B - A;
  let AO = ro - A;

  let d_rd_rd = dot(rd, rd);    // always 1 if rd normalized, but be safe
  let d_rd_AB = dot(rd, AB);
  let d_AB_AB = dot(AB, AB);
  let d_AO_rd = dot(AO, rd);
  let d_AO_AB = dot(AO, AB);

  let denom = d_rd_rd * d_AB_AB - d_rd_AB * d_rd_AB;

  var rayT: f32;
  var segT: f32;

  if (abs(denom) < 1e-8) {
    // Ray and segment are nearly parallel — just use closest point to A
    rayT = -d_AO_rd / max(d_rd_rd, 1e-8);
    segT = 0.0;
  } else {
    rayT = (d_rd_AB * d_AO_AB - d_AB_AB * d_AO_rd) / denom;
    segT = (d_rd_rd * d_AO_AB - d_rd_AB * d_AO_rd) / denom;
  }

  // Clamp segment parameter to [0,1]
  segT = clamp(segT, 0.0, 1.0);
  // Re-derive rayT for clamped segT to get true closest ray point
  let segPt = A + AB * segT;
  rayT = dot(segPt - ro, rd) / max(d_rd_rd, 1e-8);

  let rayPt = ro + rd * rayT;
  let dist = length(rayPt - segPt);

  return vec3f(dist, rayT, segT);
}

/**
 * Evaluate classical trajectory overlay for a volumetric ray.
 * Trail points are CPU-precomputed in model space (N-D projected for HO,
 * observables-derived for TDSE/BEC). Mode logic is handled on the CPU;
 * the shader only checks trailCount and renders if data exists.
 */
fn evaluateClassicalOverlay(
  ro: vec3f,
  rd: vec3f,
  tNear: f32,
  tFar: f32,
  uniforms: SchroedingerUniforms,
  dimension: i32
) -> ClassicalOverlayResult {
  var result: ClassicalOverlayResult;
  result.color = vec3f(0.0);
  result.alpha = 0.0;
  result.depth = tFar;

  if (uniforms.classicalOverlayEnabled == 0u) {
    return result;
  }

  let trailCount = uniforms.classicalTrailCount;
  if (trailCount <= 1) {
    return result;
  }

  let glowColor = uniforms.classicalOverlayColor;
  let lineWidth = uniforms.boundingRadius * 0.018;

  var bestDist: f32 = 1e10;
  var bestDepth: f32 = tFar;
  var bestFade: f32 = 0.0;

  // Check each segment between consecutive trail points
  // Trail points are already in model space (CPU handles N-D projection)
  let segCount = min(trailCount, 6) - 1;
  for (var i = 0; i < 5; i++) {
    if (i >= segCount) { break; }

    let ptA = uniforms.classicalTrail[i];
    let ptB = uniforms.classicalTrail[i + 1];

    let posA = ptA.xyz;
    let posB = ptB.xyz;

    // True ray-segment closest distance
    let closest = raySegmentClosest(ro, rd, posA, posB);
    let dist = closest.x;
    let rayT = closest.y;
    let segT = closest.z;

    // Depth must be within volume
    if (rayT < tNear || rayT > tFar) { continue; }

    // Interpolate fade along segment
    let fade = mix(ptA.w, ptB.w, segT);

    if (dist < bestDist) {
      bestDist = dist;
      bestDepth = rayT;
      bestFade = fade;
    }
  }

  if (bestDist > lineWidth * 4.0) {
    return result;
  }

  let normalizedDist = bestDist / max(lineWidth, 0.0001);
  let glow = exp(-normalizedDist * normalizedDist * 2.5);

  if (glow < 0.01) {
    return result;
  }

  let alpha = glow * bestFade;
  let hdrBoost = 1.0 + glow * 0.4;
  result.color = glowColor * hdrBoost;
  result.alpha = min(alpha, 0.9);
  result.depth = bestDepth;

  return result;
}
`
