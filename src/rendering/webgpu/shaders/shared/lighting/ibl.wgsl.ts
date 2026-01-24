/**
 * WGSL IBL (Image-Based Lighting) Block
 *
 * Environment map sampling for specular and diffuse IBL.
 * Uses PMREM textures with CubeUV encoding for roughness-based sampling.
 * Port of GLSL ibl.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/lighting/ibl.wgsl
 */

export const iblUniformsBlock = /* wgsl */ `
// ============================================
// IBL Uniforms
// ============================================

struct IBLUniforms {
  envMapSize: f32,        // Width of the PMREM texture
  iblIntensity: f32,      // Multiplier for IBL contribution
  iblQuality: i32,        // 0=off, 1=low, 2=high
  _padding: f32,
}
`

export const pmremSamplingBlock = /* wgsl */ `
// ============================================
// PMREM CubeUV Sampling (from Three.js)
// ============================================

const cubeUV_minMipLevel: f32 = 4.0;
const cubeUV_minTileSize: f32 = 16.0;
const FACE_SELECTION_EPSILON: f32 = 1e-4;

/**
 * Compute max mip level from face size: log2(faceSize).
 */
fn getCubeUVMaxMip(envMapSize: f32) -> f32 {
  return log2(envMapSize);
}

/**
 * Compute texel dimensions from envMapSize.
 * PMREM layout: 3 faces wide, 4 face heights tall.
 */
fn getCubeUVTexelSize(envMapSize: f32) -> vec2f {
  return vec2f(
    1.0 / (3.0 * envMapSize),
    1.0 / (4.0 * envMapSize)
  );
}

/**
 * Face selection with epsilon for edge case handling.
 */
fn getFace(direction: vec3f) -> f32 {
  let absDirection = abs(direction);
  var face: f32 = -1.0;

  let ax = absDirection.x;
  let ay = absDirection.y;
  let az = absDirection.z;

  if (ax > az + FACE_SELECTION_EPSILON) {
    if (ax > ay + FACE_SELECTION_EPSILON) {
      if (direction.x > 0.0) { face = 0.0; } else { face = 3.0; }
    } else {
      if (direction.y > 0.0) { face = 1.0; } else { face = 4.0; }
    }
  } else if (az > ax - FACE_SELECTION_EPSILON) {
    if (az > ay + FACE_SELECTION_EPSILON) {
      if (direction.z > 0.0) { face = 2.0; } else { face = 5.0; }
    } else {
      if (direction.y > 0.0) { face = 1.0; } else { face = 4.0; }
    }
  } else {
    if (ax >= ay) {
      if (direction.x > 0.0) { face = 0.0; } else { face = 3.0; }
    } else {
      if (direction.y > 0.0) { face = 1.0; } else { face = 4.0; }
    }
  }

  return face;
}

/**
 * Get UV coordinates for a cube face.
 */
fn getUV(direction: vec3f, face: f32) -> vec2f {
  var uv: vec2f;

  if (face == 0.0) {
    uv = vec2f(direction.z, direction.y) / abs(direction.x);
  } else if (face == 1.0) {
    uv = vec2f(-direction.x, -direction.z) / abs(direction.y);
  } else if (face == 2.0) {
    uv = vec2f(-direction.x, direction.y) / abs(direction.z);
  } else if (face == 3.0) {
    uv = vec2f(-direction.z, direction.y) / abs(direction.x);
  } else if (face == 4.0) {
    uv = vec2f(-direction.x, direction.z) / abs(direction.y);
  } else {
    uv = vec2f(direction.x, direction.y) / abs(direction.z);
  }

  return 0.5 * (uv + 1.0);
}

/**
 * Sample the PMREM texture with bilinear filtering.
 */
fn bilinearCubeUV(
  envMap: texture_2d<f32>,
  envSampler: sampler,
  direction: vec3f,
  mipInt: f32,
  envMapSize: f32
) -> vec3f {
  let cubeUV_maxMip = getCubeUVMaxMip(envMapSize);
  let texelSize = getCubeUVTexelSize(envMapSize);

  var face = getFace(direction);
  let filterInt = max(cubeUV_minMipLevel - mipInt, 0.0);
  let actualMip = max(mipInt, cubeUV_minMipLevel);

  let faceSize = exp2(actualMip);

  // UV margin for seam prevention
  let uvMargin: f32 = 1.5;
  var uv = getUV(direction, face) * (faceSize - 2.0 * uvMargin) + uvMargin;

  if (face > 2.0) {
    uv.y += faceSize;
    face -= 3.0;
  }

  uv.x += face * faceSize;
  uv.x += filterInt * 3.0 * cubeUV_minTileSize;
  uv.y += 4.0 * (exp2(cubeUV_maxMip) - faceSize);

  uv.x *= texelSize.x;
  uv.y *= texelSize.y;

  // Clamp UV
  uv = clamp(uv, vec2f(0.001), vec2f(0.999));

  return textureSample(envMap, envSampler, uv).rgb;
}

// Roughness to mip level mapping constants (matches PMREMGenerator)
const cubeUV_r0: f32 = 1.0;
const cubeUV_m0: f32 = -2.0;
const cubeUV_r1: f32 = 0.8;
const cubeUV_m1: f32 = -1.0;
const cubeUV_r4: f32 = 0.4;
const cubeUV_m4: f32 = 2.0;
const cubeUV_r5: f32 = 0.305;
const cubeUV_m5: f32 = 3.0;
const cubeUV_r6: f32 = 0.21;
const cubeUV_m6: f32 = 4.0;

/**
 * Convert roughness to mip level.
 */
fn roughnessToMip(roughness: f32) -> f32 {
  var mip: f32 = 0.0;

  if (roughness >= cubeUV_r1) {
    mip = (cubeUV_r0 - roughness) * (cubeUV_m1 - cubeUV_m0) / (cubeUV_r0 - cubeUV_r1) + cubeUV_m0;
  } else if (roughness >= cubeUV_r4) {
    mip = (cubeUV_r1 - roughness) * (cubeUV_m4 - cubeUV_m1) / (cubeUV_r1 - cubeUV_r4) + cubeUV_m1;
  } else if (roughness >= cubeUV_r5) {
    mip = (cubeUV_r4 - roughness) * (cubeUV_m5 - cubeUV_m4) / (cubeUV_r4 - cubeUV_r5) + cubeUV_m4;
  } else if (roughness >= cubeUV_r6) {
    mip = (cubeUV_r5 - roughness) * (cubeUV_m6 - cubeUV_m5) / (cubeUV_r5 - cubeUV_r6) + cubeUV_m5;
  } else {
    mip = -2.0 * log2(1.16 * roughness);
  }

  return mip;
}

/**
 * Sample PMREM texture at given roughness level.
 */
fn textureCubeUV(
  envMap: texture_2d<f32>,
  envSampler: sampler,
  sampleDir: vec3f,
  roughness: f32,
  envMapSize: f32
) -> vec4f {
  let cubeUV_maxMip = getCubeUVMaxMip(envMapSize);
  let mip = clamp(roughnessToMip(roughness), cubeUV_m0, cubeUV_maxMip);
  let mipF = fract(mip);
  let mipInt = floor(mip);

  let color0 = bilinearCubeUV(envMap, envSampler, sampleDir, mipInt, envMapSize);

  if (mipF == 0.0) {
    return vec4f(color0, 1.0);
  } else {
    let color1 = bilinearCubeUV(envMap, envSampler, sampleDir, mipInt + 1.0, envMapSize);
    return vec4f(mix(color0, color1, mipF), 1.0);
  }
}
`

export const iblBlock = /* wgsl */ `
// ============================================
// Image-Based Lighting (IBL) with PMREM
// ============================================

/**
 * Compute IBL contribution using PMREM texture.
 *
 * @param N Surface normal
 * @param V View direction
 * @param F0 Base reflectivity
 * @param roughness Material roughness
 * @param metallic Metallic factor
 * @param albedo Base color
 * @param envMap PMREM environment map
 * @param envSampler Sampler for env map
 * @param iblUniforms IBL uniform data
 * @return IBL color contribution
 */
fn computeIBL(
  N: vec3f,
  V: vec3f,
  F0: vec3f,
  roughness: f32,
  metallic: f32,
  albedo: vec3f,
  envMap: texture_2d<f32>,
  envSampler: sampler,
  iblUniforms: IBLUniforms
) -> vec3f {
  if (iblUniforms.iblQuality == 0) {
    return vec3f(0.0);
  }

  let R = reflect(-V, N);
  let NdotV = max(dot(N, V), 0.0);

  // Fresnel with roughness compensation
  let F = fresnelSchlickRoughness(NdotV, F0, roughness);

  // Sample direction adjustment for rough surfaces
  var sampleDir = R;
  if (iblUniforms.iblQuality == 2 && roughness > 0.3) {
    sampleDir = normalize(mix(R, N, roughness * roughness * 0.3));
  }

  // Specular IBL - single PMREM sample at roughness level
  let specularIBL = textureCubeUV(envMap, envSampler, sampleDir, roughness, iblUniforms.envMapSize).rgb * F;

  // Diffuse IBL - sample at max roughness (fully diffuse)
  let kD = (1.0 - F) * (1.0 - metallic);
  let diffuseIBL = textureCubeUV(envMap, envSampler, N, 1.0, iblUniforms.envMapSize).rgb * kD * albedo / PI;

  return (specularIBL + diffuseIBL) * iblUniforms.iblIntensity;
}
`
