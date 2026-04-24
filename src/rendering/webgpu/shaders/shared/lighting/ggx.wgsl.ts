/**
 * WGSL GGX PBR Specular Block
 *
 * Cook-Torrance BRDF with GGX (Trowbridge-Reitz) distribution
 * for physically-based specular reflections.
 *
 * @module rendering/webgpu/shaders/shared/lighting/ggx.wgsl
 */

export const ggxBlock = /* wgsl */ `
// ============================================
// GGX Physically Based Specular
// ============================================

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
  // Guard against V and L being opposite (zero-length half vector).
  let halfSum = V + L;
  let halfLenSq = dot(halfSum, halfSum);
  var H: vec3f;
  if (halfLenSq > EPS_DIVISION * EPS_DIVISION) {
    // inverseSqrt + multiply is one cheaper than length()+divide on every GPU backend.
    H = halfSum * inverseSqrt(halfLenSq);
  } else {
    H = N;
  }

  let NdotV = max(dot(N, V), 0.0);
  let NdotL = max(dot(N, L), 0.0);

  // Distribution term (GGX / Trowbridge-Reitz) inlined so (a, a2) are shared with
  // nothing -- but we can fuse the Smith k term across both Schlick calls below.
  let NdotH = max(dot(N, H), 0.0);
  let NdotH2 = NdotH * NdotH;
  let a = roughness * roughness;
  let a2 = a * a;
  let dNom = NdotH2 * (a2 - 1.0) + 1.0;
  let NDF = a2 / max(PI * dNom * dNom, EPS_DIVISION);

  // Smith's G: compute k once (used to be recomputed inside each geometrySchlickGGX).
  let r1 = roughness + 1.0;
  let k = (r1 * r1) / 8.0;
  let oneMinusK = 1.0 - k;
  let ggxV = NdotV / max(NdotV * oneMinusK + k, EPS_DIVISION);
  let ggxL = NdotL / max(NdotL * oneMinusK + k, EPS_DIVISION);
  let G = ggxV * ggxL;

  let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

  let numerator = NDF * G * F;
  let denominator = 4.0 * NdotV * NdotL + EPS_DIVISION;
  return numerator / denominator;
}

`
