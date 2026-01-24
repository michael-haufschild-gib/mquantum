/**
 * WGSL GGX PBR Specular Block
 *
 * Cook-Torrance BRDF with GGX (Trowbridge-Reitz) distribution
 * for physically-based specular reflections.
 * Port of GLSL ggx.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/shared/lighting/ggx.wgsl
 */

export const ggxBlock = /* wgsl */ `
// ============================================
// GGX Physically Based Specular
// ============================================

/**
 * GGX Distribution (Trowbridge-Reitz).
 * Returns the probability that microfacets are aligned with the half vector.
 *
 * @param N Surface normal
 * @param H Half vector between view and light
 * @param roughness Material roughness (0-1)
 * @return Distribution value
 */
fn distributionGGX(N: vec3f, H: vec3f, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;

  let num = a2;
  var denom = NdotH2 * (a2 - 1.0) + 1.0;
  denom = PI * denom * denom;

  return num / max(denom, EPS_DIVISION);
}

/**
 * Geometry Schlick-GGX.
 * Approximates shadowing/masking by microfacets.
 *
 * @param NdotV Dot product of normal and view direction
 * @param roughness Material roughness
 * @return Geometry term
 */
fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;

  let num = NdotV;
  let denom = NdotV * (1.0 - k) + k;

  return num / max(denom, EPS_DIVISION);
}

/**
 * Geometry Smith.
 * Combined shadowing/masking for both view and light directions.
 *
 * @param N Surface normal
 * @param V View direction
 * @param L Light direction
 * @param roughness Material roughness
 * @return Combined geometry term
 */
fn geometrySmith(N: vec3f, V: vec3f, L: vec3f, roughness: f32) -> f32 {
  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);
  let ggx2 = geometrySchlickGGX(NdotV, roughness);
  let ggx1 = geometrySchlickGGX(NdotL, roughness);

  return ggx1 * ggx2;
}

/**
 * Fresnel Schlick approximation.
 * Returns the ratio of reflected light based on viewing angle.
 *
 * @param cosTheta Cosine of angle between half vector and view direction
 * @param F0 Base reflectivity at normal incidence
 * @return Fresnel factor
 */
fn fresnelSchlick(cosTheta: f32, F0: vec3f) -> vec3f {
  // Optimized: pow(x,5) -> multiplication chain (3 muls vs transcendental)
  let x = clamp(1.0 - cosTheta, 0.0, 1.0);
  let x2 = x * x;
  let x5 = x2 * x2 * x;  // x^5 = x^2 * x^2 * x
  return F0 + (1.0 - F0) * x5;
}

/**
 * Fresnel Schlick with roughness compensation for IBL.
 *
 * @param cosTheta Cosine of angle
 * @param F0 Base reflectivity
 * @param roughness Material roughness
 * @return Fresnel factor
 */
fn fresnelSchlickRoughness(cosTheta: f32, F0: vec3f, roughness: f32) -> vec3f {
  let x = clamp(1.0 - cosTheta, 0.0, 1.0);
  let x2 = x * x;
  let x5 = x2 * x2 * x;
  return F0 + (max(vec3f(1.0 - roughness), F0) - F0) * x5;
}

/**
 * Compute PBR specular contribution using Cook-Torrance BRDF.
 *
 * @param N Surface normal
 * @param V View direction
 * @param L Light direction
 * @param roughness Material roughness
 * @param F0 Base reflectivity
 * @return Specular color
 */
fn computePBRSpecular(N: vec3f, V: vec3f, L: vec3f, roughness: f32, F0: vec3f) -> vec3f {
  // Guard against V and L being opposite (zero-length half vector)
  let halfSum = V + L;
  let halfLen = length(halfSum);
  var H: vec3f;
  if (halfLen > EPS_DIVISION) {
    H = halfSum / halfLen;
  } else {
    H = N;
  }

  // Cook-Torrance BRDF
  let NDF = distributionGGX(N, H, roughness);
  let G = geometrySmith(N, V, L, roughness);
  let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  let numerator = NDF * G * F;
  let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + EPS_DIVISION;
  let specular = numerator / denominator;

  return specular;
}

/**
 * Compute F0 (base reflectivity) from IOR.
 *
 * @param ior Index of refraction
 * @return F0 value
 */
fn iorToF0(ior: f32) -> f32 {
  let r = (ior - 1.0) / (ior + 1.0);
  return r * r;
}

/**
 * Compute F0 for metals from base color.
 * Metals have F0 equal to their albedo.
 *
 * @param baseColor Base color
 * @param metallic Metallic factor
 * @param reflectance Reflectance (default 0.04 for dielectrics)
 * @return F0 vector
 */
fn computeF0(baseColor: vec3f, metallic: f32, reflectance: f32) -> vec3f {
  return mix(vec3f(reflectance), baseColor, metallic);
}
`
