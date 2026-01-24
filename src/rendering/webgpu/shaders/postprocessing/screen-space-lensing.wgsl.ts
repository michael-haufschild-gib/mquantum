/**
 * WGSL Screen-Space Lensing Shader
 *
 * Hybrid lensing shader that uses screen-space distortion for nearby objects
 * and sky cubemap sampling for distant background.
 *
 * Port of GLSL postprocessing/screenSpaceLensing.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/postprocessing/screen-space-lensing.wgsl
 */

export const screenSpaceLensingUniformsBlock = /* wgsl */ `
// ============================================
// Screen-Space Lensing Uniforms
// ============================================

struct ScreenSpaceLensingUniforms {
  blackHoleCenter: vec2f,
  horizonRadius: f32,
  intensity: f32,
  mass: f32,
  distortionScale: f32,
  falloff: f32,
  chromaticAberration: f32,
  near: f32,
  far: f32,
  depthAvailable: f32,
  hybridSkyEnabled: f32,
  skyCubemapAvailable: f32,
  _padding1: f32,
  inverseViewProjection: mat4x4f,
  cameraPosition: vec3f,
  _padding2: f32,
  resolution: vec2f,
  _padding3: vec2f,
}
`

export const screenSpaceLensingVertexShader = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(@location(0) position: vec3f, @location(1) uv: vec2f) -> VertexOutput {
  var output: VertexOutput;
  output.uv = uv;
  output.position = vec4f(position.xy, 0.0, 1.0);
  return output;
}
`

export const screenSpaceLensingFragmentShader = /* wgsl */ `
${screenSpaceLensingUniformsBlock}

@group(0) @binding(0) var colorTexture: texture_2d<f32>;
@group(0) @binding(1) var colorSampler: sampler;
@group(0) @binding(2) var depthTexture: texture_2d<f32>;
@group(0) @binding(3) var depthSampler: sampler;
@group(0) @binding(4) var skyCubemap: texture_cube<f32>;
@group(0) @binding(5) var skyCubemapSampler: sampler;
@group(0) @binding(6) var<uniform> uniforms: ScreenSpaceLensingUniforms;

/**
 * Compute radial distortion magnitude based on distance from center.
 * Uses gravitational lensing formula: deflection = strength / r^falloff
 */
fn lensingMagnitude(r: f32) -> f32 {
  let safeR = max(r, 0.001);
  let strength = uniforms.intensity * uniforms.mass * uniforms.distortionScale * 0.02;
  let deflection = strength / pow(safeR, uniforms.falloff);
  return min(deflection, 0.5);
}

/**
 * Compute displacement vector for a UV coordinate.
 */
fn computeLensingDisplacement(uv: vec2f, center: vec2f) -> vec2f {
  let toCenter = center - uv;
  let r = length(toCenter);
  if (r < 0.01) {
    return vec2f(0.0);
  }
  let dir = normalize(toCenter);
  let mag = lensingMagnitude(r);
  return dir * mag;
}

/**
 * Reconstruct world ray direction from screen UV.
 */
fn getWorldRayDirection(uv: vec2f) -> vec3f {
  let ndc = uv * 2.0 - 1.0;
  let farClip = vec4f(ndc, 1.0, 1.0);
  var worldPos = uniforms.inverseViewProjection * farClip;
  worldPos /= worldPos.w;
  return normalize(worldPos.xyz - uniforms.cameraPosition);
}

/**
 * Bend a 3D ray direction toward black hole center.
 */
fn bendRay3D(rayDir: vec3f, center2D: vec2f) -> vec3f {
  let centerNDC = center2D * 2.0 - 1.0;
  let centerClip = vec4f(centerNDC, 0.0, 1.0);
  var centerWorld = uniforms.inverseViewProjection * centerClip;
  centerWorld /= centerWorld.w;
  let centerDir = normalize(centerWorld.xyz - uniforms.cameraPosition);

  let cosAngle = dot(rayDir, centerDir);
  let angle = acos(clamp(cosAngle, -1.0, 1.0));

  let strength = uniforms.intensity * uniforms.mass * uniforms.distortionScale * 0.02;
  let safeAngle = max(angle, 0.001);
  let deflection = min(strength * 10.0 / pow(safeAngle * 10.0, uniforms.falloff), 0.5);

  let bentDir = mix(rayDir, centerDir, deflection);
  return normalize(bentDir);
}

/**
 * Sample sky cubemap with chromatic aberration.
 * Uses mip bias for far-field samples to reduce bandwidth.
 */
fn sampleSkyChromatic(bentDir: vec3f, baseDir: vec3f, mipBias: f32) -> vec3f {
  let rScale = 1.0 - uniforms.chromaticAberration * 0.1;
  let gScale = 1.0;
  let bScale = 1.0 + uniforms.chromaticAberration * 0.1;

  let rDir = normalize(mix(baseDir, bentDir, rScale));
  let gDir = normalize(mix(baseDir, bentDir, gScale));
  let bDir = normalize(mix(baseDir, bentDir, bScale));

  let r = textureSampleLevel(skyCubemap, skyCubemapSampler, rDir, mipBias).r;
  let g = textureSampleLevel(skyCubemap, skyCubemapSampler, gDir, mipBias).g;
  let b = textureSampleLevel(skyCubemap, skyCubemapSampler, bDir, mipBias).b;

  return vec3f(r, g, b);
}

/**
 * Apply chromatic aberration to lensing.
 */
fn applyLensingChromatic(uv: vec2f, displacement: vec2f) -> vec3f {
  let rScale = 1.0 - uniforms.chromaticAberration * 0.02;
  let gScale = 1.0;
  let bScale = 1.0 + uniforms.chromaticAberration * 0.02;

  let r = textureSample(colorTexture, colorSampler, uv + displacement * rScale).r;
  let g = textureSample(colorTexture, colorSampler, uv + displacement * gScale).g;
  let b = textureSample(colorTexture, colorSampler, uv + displacement * bScale).b;

  return vec3f(r, g, b);
}

/**
 * Compute Einstein ring brightness boost.
 */
fn einsteinRingBoost(r: f32, ringRadius: f32, ringWidth: f32) -> f32 {
  let diff = abs(r - ringRadius);
  let safeWidth = max(ringWidth, 0.001);
  let falloff = exp(-diff * diff / (safeWidth * safeWidth * 2.0));
  return 1.0 + falloff * 0.5;
}

/**
 * Linearize depth from depth buffer.
 */
fn linearizeDepth(depth: f32, near: f32, far: f32) -> f32 {
  let z = depth * 2.0 - 1.0;
  let denominator = far + near - z * (far - near);
  return (2.0 * near * far) / max(denominator, 0.0001);
}

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // Early exit if effect is disabled
  if (uniforms.intensity < 0.001) {
    return textureSample(colorTexture, colorSampler, uv);
  }

  let displacement = computeLensingDisplacement(uv, uniforms.blackHoleCenter);
  let r = length(uv - uniforms.blackHoleCenter);

  // Sample depth for depth-aware distortion
  var depth = 1.0;
  var linearDepth = uniforms.far;
  var isSky = true;

  if (uniforms.depthAvailable > 0.5) {
    depth = textureSample(depthTexture, depthSampler, uv).r;
    linearDepth = linearizeDepth(depth, uniforms.near, uniforms.far);
    isSky = depth > 0.99;
  }

  var distortedUV = uv + displacement;
  distortedUV = clamp(distortedUV, vec2f(0.0), vec2f(1.0));

  let depthFactor = select(1.0, smoothstep(1.0, 10.0, linearDepth), uniforms.depthAvailable > 0.5);

  var color: vec3f;

  if (uniforms.hybridSkyEnabled > 0.5 && uniforms.skyCubemapAvailable > 0.5 && isSky) {
    let baseDir = getWorldRayDirection(uv);
    let bentDir = bendRay3D(baseDir, uniforms.blackHoleCenter);

    // Compute mip bias: higher LOD for far-field samples
    let mipBias = smoothstep(0.1, 0.5, r) * 2.0;

    if (uniforms.chromaticAberration > 0.01) {
      color = sampleSkyChromatic(bentDir, baseDir, mipBias);
    } else {
      color = textureSampleLevel(skyCubemap, skyCubemapSampler, bentDir, mipBias).rgb;
    }
  } else {
    // Do NOT apply SSL distortion to the inner black hole region
    let distFromCenter = length(uv - uniforms.blackHoleCenter);
    let innerRadius = uniforms.horizonRadius * 2.5;
    let outerRadius = uniforms.horizonRadius * 3.5;
    let sslFactor = smoothstep(innerRadius, outerRadius, distFromCenter);

    let finalUV = mix(uv, distortedUV, depthFactor * sslFactor);

    if (uniforms.chromaticAberration > 0.01) {
      let finalDisplacement = displacement * depthFactor * sslFactor;
      color = applyLensingChromatic(uv, finalDisplacement);
    } else {
      color = textureSample(colorTexture, colorSampler, finalUV).rgb;
    }
  }

  let ringRadius = uniforms.horizonRadius * 1.5;
  let boost = einsteinRingBoost(r, ringRadius, uniforms.horizonRadius * 0.3);
  color *= boost;

  return vec4f(color, 1.0);
}
`
