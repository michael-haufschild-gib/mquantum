/**
 * Shadow Map Sampling Module (WGSL)
 *
 * Provides shadow map sampling for mesh-based objects (Polytope, TubeWireframe).
 * Supports all three light types:
 * - Directional lights: 2D shadow maps with orthographic projection
 * - Spot lights: 2D shadow maps with perspective projection
 * - Point lights: 2D packed shadow maps (6 cube faces packed into 2D texture)
 *
 * Uses PCF (Percentage Closer Filtering) for soft shadow edges.
 *
 * Point light shadows use Three.js's approach: packing 6 cube faces into a 2D texture
 * with a 4:2 aspect ratio, then using cubeToUV() to map 3D directions to 2D coordinates.
 *
 * Port of GLSL shared/features/shadowMaps.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/features/shadowMaps.wgsl
 */

/**
 * Shadow map uniform declarations struct.
 */
export const shadowMapsUniformsBlock = /* wgsl */ `
// ============================================
// Shadow Map Uniforms Structure
// ============================================

struct ShadowUniforms {
  // Shadow Matrices (world to light clip space) - 4 lights max
  shadowMatrix0: mat4x4f,
  shadowMatrix1: mat4x4f,
  shadowMatrix2: mat4x4f,
  shadowMatrix3: mat4x4f,

  // Per-light shadow enable flags (packed as vec4 for alignment)
  lightCastsShadow: vec4u, // Each component is 0 or 1

  // Shadow settings
  shadowMapBias: f32,
  shadowMapSize: f32,
  shadowPCFSamples: i32, // 0=hard, 1=3x3 PCF, 2=5x5 PCF
  shadowCameraNear: f32,
  shadowCameraFar: f32,
  _padding: vec3f,
}
`

/**
 * Shadow map sampling functions.
 * Includes PCF filtering for soft shadows and packed 2D sampling for point lights.
 */
export const shadowMapsFunctionsBlock = /* wgsl */ `
// ============================================
// Shadow Map Functions
// ============================================

// Unpack RGBA to depth value (Three.js packing format)
fn unpackRGBAToDepth(v: vec4f) -> f32 {
  // Three.js packs depth as RGBA for precision
  return dot(v, vec4f(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0));
}

// Get shadow matrix by index
fn getShadowMatrix(index: i32, shadowUniforms: ShadowUniforms) -> mat4x4f {
  if (index == 0) { return shadowUniforms.shadowMatrix0; }
  if (index == 1) { return shadowUniforms.shadowMatrix1; }
  if (index == 2) { return shadowUniforms.shadowMatrix2; }
  if (index == 3) { return shadowUniforms.shadowMatrix3; }
  return mat4x4f(1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
}

// Check if light casts shadow
fn lightCastsShadow(index: i32, shadowUniforms: ShadowUniforms) -> bool {
  if (index == 0) { return shadowUniforms.lightCastsShadow.x > 0u; }
  if (index == 1) { return shadowUniforms.lightCastsShadow.y > 0u; }
  if (index == 2) { return shadowUniforms.lightCastsShadow.z > 0u; }
  if (index == 3) { return shadowUniforms.lightCastsShadow.w > 0u; }
  return false;
}

// ============================================
// Point Light Shadow Functions (Three.js style)
// ============================================

// Convert 3D direction to 2D UV coordinates for packed cube shadow map
// Three.js packs 6 cube faces into a 2D texture with layout: xzXZ / y Y
// (lowercase = negative direction, uppercase = positive direction)
fn cubeToUV(v: vec3f, texelSizeY: f32) -> vec2f {
  var absV = abs(v);

  // Scale to unit cube intersection - guard against zero vector
  let maxComponent = max(absV.x, max(absV.y, absV.z));
  let scaleToCube = 1.0 / max(maxComponent, 0.0001);
  absV *= scaleToCube;

  // Apply scale to avoid seams (pull slightly inward from edges)
  var vScaled = v * scaleToCube * (1.0 - 2.0 * texelSizeY);

  // Start with XY plane projection
  var planar = vScaled.xy;

  let almostATexel = 1.5 * texelSizeY;
  let almostOne = 1.0 - almostATexel;

  // Determine which face we're on and remap coordinates
  if (absV.z >= almostOne) {
    // Z faces (+Z or -Z)
    if (vScaled.z > 0.0) {
      planar.x = 4.0 - vScaled.x; // +Z face
    }
    // -Z face uses default v.xy
  } else if (absV.x >= almostOne) {
    // X faces (+X or -X)
    let signX = sign(vScaled.x);
    planar.x = vScaled.z * signX + 2.0 * signX;
  } else if (absV.y >= almostOne) {
    // Y faces (+Y or -Y)
    let signY = sign(vScaled.y);
    planar.x = vScaled.x + 2.0 * signY + 2.0;
    planar.y = vScaled.z * signY - 2.0;
  }

  // Map from [-4,4] x [-2,2] to [0,1] x [0,1]
  return vec2f(0.125, 0.25) * planar + vec2f(0.375, 0.75);
}

// Sample point light shadow using packed 2D texture
fn getPointShadow(
  lightIndex: i32,
  worldPos: vec3f,
  lightPos: vec3f,
  pointShadowMap: texture_2d<f32>,
  shadowSampler: sampler,
  shadowUniforms: ShadowUniforms
) -> f32 {
  let lightToFrag = worldPos - lightPos;
  let lightDistance = length(lightToFrag);

  // Guard against zero distance (fragment at light position)
  if (lightDistance < 0.0001) {
    return 1.0; // Not in shadow
  }
  let lightDir = lightToFrag / lightDistance;

  // Early exit if fragment is outside the shadow camera range
  let cameraNear = shadowUniforms.shadowCameraNear;
  let cameraFar = shadowUniforms.shadowCameraFar;
  if (lightDistance - cameraFar > 0.0 || lightDistance - cameraNear < 0.0) {
    return 1.0; // Not in shadow (outside range)
  }

  // Calculate texel size for the packed texture (4:2 aspect ratio)
  let texelSizeY = 1.0 / (shadowUniforms.shadowMapSize * 2.0);

  // Convert 3D direction to 2D UV
  let uv = cubeToUV(lightDir, texelSizeY);

  // Sample the packed shadow map
  let shadowSample = textureSample(pointShadowMap, shadowSampler, uv);
  let closestDepth = unpackRGBAToDepth(shadowSample);

  // Normalize fragment distance
  let depthRange = cameraFar - cameraNear;
  var dp = select(0.0, (lightDistance - cameraNear) / depthRange, depthRange > 0.0001);

  // Point lights need larger bias (2x) due to cube map edge discontinuities
  let bias = shadowUniforms.shadowMapBias * 2.0;
  dp += bias;

  // Compare in normalized space: if dp > closestDepth, fragment is in shadow
  return step(dp, closestDepth);
}

// ============================================
// Directional/Spot Shadow Functions
// ============================================

// PCF shadow sampling for directional and spot lights
fn sampleShadowPCF(
  lightIndex: i32,
  worldPos: vec3f,
  shadowMap: texture_2d<f32>,
  shadowSampler: sampler,
  shadowUniforms: ShadowUniforms
) -> f32 {
  let shadowMatrix = getShadowMatrix(lightIndex, shadowUniforms);
  let shadowCoord = shadowMatrix * vec4f(worldPos, 1.0);

  // Perspective divide (guard against w=0)
  let w = max(abs(shadowCoord.w), 0.0001);
  var projCoord = shadowCoord.xyz / w;

  // Transform from NDC [-1,1] to texture space [0,1]
  projCoord = projCoord * 0.5 + 0.5;

  // Check if outside shadow frustum (including near plane z < 0)
  if (projCoord.x < 0.0 || projCoord.x > 1.0 ||
      projCoord.y < 0.0 || projCoord.y > 1.0 ||
      projCoord.z < 0.0 || projCoord.z > 1.0) {
    return 1.0; // Outside shadow frustum = fully lit
  }

  let currentDepth = projCoord.z;
  let texelSize = 1.0 / max(shadowUniforms.shadowMapSize, 1.0);
  var shadow = 0.0;

  // PCF kernel based on quality setting
  if (shadowUniforms.shadowPCFSamples == 0) {
    // Hard shadows (single sample)
    let closestDepth = textureSample(shadowMap, shadowSampler, projCoord.xy).r;
    shadow = select(0.0, 1.0, currentDepth <= closestDepth + shadowUniforms.shadowMapBias);
  } else if (shadowUniforms.shadowPCFSamples == 1) {
    // 3x3 PCF (9 samples)
    for (var x = -1; x <= 1; x++) {
      for (var y = -1; y <= 1; y++) {
        let offset = vec2f(f32(x), f32(y)) * texelSize;
        let depth = textureSample(shadowMap, shadowSampler, projCoord.xy + offset).r;
        shadow += select(0.0, 1.0, currentDepth <= depth + shadowUniforms.shadowMapBias);
      }
    }
    shadow /= 9.0;
  } else {
    // 5x5 PCF (25 samples)
    for (var x = -2; x <= 2; x++) {
      for (var y = -2; y <= 2; y++) {
        let offset = vec2f(f32(x), f32(y)) * texelSize;
        let depth = textureSample(shadowMap, shadowSampler, projCoord.xy + offset).r;
        shadow += select(0.0, 1.0, currentDepth <= depth + shadowUniforms.shadowMapBias);
      }
    }
    shadow /= 25.0;
  }

  return shadow;
}
`
