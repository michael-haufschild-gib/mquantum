/**
 * WGSL Ambient Occlusion Block
 *
 * Ambient occlusion calculation for SDF rendering.
 * Port of GLSL ao.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/features/ao.wgsl
 */

export const aoBlock = /* wgsl */ `
// ============================================
// Ambient Occlusion
// ============================================

/**
 * Calculate ambient occlusion using cone tracing.
 * Standard 5-sample AO based on Inigo Quilez technique.
 *
 * @param pos Surface position
 * @param nor Surface normal
 * @return AO factor (0 = fully occluded, 1 = not occluded)
 */
fn calcAO(pos: vec3f, nor: vec3f) -> f32 {
  var occ: f32 = 0.0;
  var sca: f32 = 1.0;

  for (var i = 0; i < 5; i++) {
    let h = 0.01 + 0.12 * f32(i) / 4.0;
    let d = GetDist(pos + h * nor);
    occ += (h - d) * sca;
    sca *= 0.95;
  }

  return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

/**
 * Quality-aware ambient occlusion.
 * Adjusts sample count based on quality level.
 *
 * @param pos Surface position
 * @param nor Surface normal
 * @param quality Quality level (0=low, 1=medium, 2=high)
 * @param radius Sampling radius
 * @param intensity AO strength multiplier
 * @return AO factor
 */
fn calcAOQuality(
  pos: vec3f,
  nor: vec3f,
  quality: i32,
  radius: f32,
  intensity: f32
) -> f32 {
  // Sample counts based on quality
  let sampleCount = select(select(8, 5, quality == 1), 3, quality == 0);

  var occ: f32 = 0.0;
  var sca: f32 = 1.0;
  let step = radius / f32(sampleCount);

  for (var i = 0; i < sampleCount; i++) {
    let h = 0.01 + step * f32(i + 1);
    let d = GetDist(pos + h * nor);
    occ += (h - d) * sca;
    sca *= 0.85;

    if (i >= sampleCount) { break; }
  }

  return clamp(1.0 - intensity * occ, 0.0, 1.0);
}

/**
 * Fast AO approximation using single sample.
 * Best for performance-critical rendering.
 *
 * @param pos Surface position
 * @param nor Surface normal
 * @param radius Sample distance
 * @return Approximate AO factor
 */
fn calcAOFast(pos: vec3f, nor: vec3f, radius: f32) -> f32 {
  let d = GetDist(pos + nor * radius);
  return clamp(d / radius, 0.0, 1.0);
}

/**
 * Hemisphere-based AO for more accurate occlusion.
 * Uses Fibonacci spiral sampling pattern.
 *
 * @param pos Surface position
 * @param nor Surface normal
 * @param radius Maximum sample radius
 * @param samples Number of samples
 * @param bias Distance bias to avoid self-occlusion
 * @return AO factor
 */
fn calcAOHemisphere(
  pos: vec3f,
  nor: vec3f,
  radius: f32,
  samples: i32,
  bias: f32
) -> f32 {
  // Create tangent space basis
  let tangent = normalize(cross(nor, select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(nor.x) > 0.9)));
  let bitangent = cross(nor, tangent);

  var occlusion: f32 = 0.0;
  let invSamples = 1.0 / f32(samples);

  for (var i = 0; i < samples; i++) {
    // Fibonacci hemisphere sampling
    let t = f32(i) * invSamples;
    let phi = 2.0 * PI * f32(i) * GOLDEN_RATIO;
    let cosTheta = 1.0 - t;
    let sinTheta = sqrt(1.0 - cosTheta * cosTheta);

    // Sample direction in tangent space
    let localDir = vec3f(
      sinTheta * cos(phi),
      sinTheta * sin(phi),
      cosTheta
    );

    // Transform to world space
    let worldDir = tangent * localDir.x + bitangent * localDir.y + nor * localDir.z;

    // Variable sample distance (closer samples contribute more)
    let sampleDist = radius * (0.2 + 0.8 * t);
    let samplePos = pos + worldDir * sampleDist + nor * bias;

    let d = GetDist(samplePos);
    let rangeCheck = smoothstep(0.0, 1.0, sampleDist / (abs(d) + 0.001));
    occlusion += select(0.0, 1.0, d < sampleDist) * rangeCheck * cosTheta;
  }

  occlusion *= invSamples;
  return 1.0 - occlusion;
}

/**
 * Multi-scale AO combining near and far occlusion.
 *
 * @param pos Surface position
 * @param nor Surface normal
 * @param nearRadius Near-field radius (small details)
 * @param farRadius Far-field radius (large geometry)
 * @return Combined AO factor
 */
fn calcAOMultiScale(
  pos: vec3f,
  nor: vec3f,
  nearRadius: f32,
  farRadius: f32
) -> f32 {
  // Near-field AO (fine details)
  let nearAO = calcAO(pos, nor);

  // Far-field AO (coarse occlusion)
  var farOcc: f32 = 0.0;
  for (var i = 0; i < 3; i++) {
    let h = farRadius * (0.3 + 0.35 * f32(i));
    let d = GetDist(pos + h * nor);
    farOcc += smoothstep(0.0, h, h - d);
  }
  let farAO = 1.0 - farOcc / 3.0;

  // Combine with near AO weighted more heavily
  return nearAO * 0.7 + farAO * 0.3;
}
`
