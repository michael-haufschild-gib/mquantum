/**
 * Density Grid Sampling Utilities
 *
 * WGSL functions for sampling pre-computed quantum density values from a 3D texture.
 * These replace expensive per-pixel wavefunction evaluations (Laguerre + Legendre +
 * spherical harmonics, ~85-90 cycles per step) with cheap texture lookups during raymarching.
 *
 * The grid texture format depends on device capability:
 * - rgba16float: R=rho, G=logRho, B=spatialPhase, A=relativePhase
 * - r16float: R=rho only (fallback)
 *
 * Coordinate mapping: world pos in [-boundingRadius, +boundingRadius] → UVW [0, 1]
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/densityGridSampling
 */

/**
 * Bind group declarations for density grid texture.
 * Added to Group 2 (object-specific) alongside Schroedinger uniforms + basis + eigencache.
 *
 * @param startBinding The binding index to start from (after object uniforms)
 */
export function generateDensityGridFragmentBindings(startBinding: number = 4): string {
  return /* wgsl */ `
// ============================================
// Density Grid Texture Bindings (Fragment)
// ============================================

@group(2) @binding(${startBinding}) var densityGridTexture: texture_3d<f32>;
@group(2) @binding(${startBinding + 1}) var densityGridSampler: sampler;
`
}

/**
 * Bind group declarations for free-scalar analysis texture.
 * Reuses the same sampler as the density grid (trilinear filtering).
 * Added to Group 2 (object-specific) after density grid bindings.
 *
 * @param startBinding The binding index for the analysis texture
 */
export function generateAnalysisTextureBindings(startBinding: number = 6): string {
  return /* wgsl */ `
// ============================================
// Analysis Texture Bindings (Fragment)
// ============================================

@group(2) @binding(${startBinding}) var analysisTexture: texture_3d<f32>;
`
}

/**
 * Analysis texture sampling function for fragment-shader educational color modes.
 * Samples per-voxel physics observables from the analysis 3D texture.
 */
export const analysisTextureSamplingBlock = /* wgsl */ `
// ============================================
// Analysis Texture Sampling Functions
// ============================================

/**
 * Sample analysis data from the free-scalar analysis 3D texture.
 * Contents depend on the active educational mode:
 *   Hamiltonian/Character: R=K, G=gradE, B=V, A=E
 *   Energy Flux: R=Sx, G=Sy, B=Sz, A=|S|
 *
 * @param pos World-space position (model space during raymarching)
 * @param uniforms Schroedinger uniforms containing boundingRadius
 * @return vec4f with analysis data channels
 */
fn sampleAnalysisFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec4f {
  let uvw = worldToDensityGridUVW(pos, uniforms);

  if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) {
    return vec4f(0.0);
  }

  return textureSampleLevel(analysisTexture, densityGridSampler, uvw, 0.0);
}
`

/**
 * Density grid sampling functions for fragment-shader raymarching.
 * Replaces inline wavefunction evaluation with texture lookups.
 */
export const densityGridSamplingBlock = /* wgsl */ `
// ============================================
// Density Grid Sampling Functions
// ============================================

/**
 * Convert world position to density grid UVW coordinates.
 * Maps [-boundingRadius, +boundingRadius] to [0, 1].
 *
 * @param pos World-space position (model space during raymarching)
 * @param uniforms Schroedinger uniforms containing boundingRadius
 * @return UVW coordinates for texture sampling
 */
fn worldToDensityGridUVW(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  let bound = uniforms.boundingRadius;
  var gridPos = pos;

  // Free-scalar density textures are now written in model space by the writeGrid
  // compute shader (which applies basis-rotated N-D slicing). No additional
  // basis remap is needed here — gridPos = pos (identity).
  // Hydrogen/HO density textures also bake basis/origin during compute write
  // (mapPosToND), so gridPos = pos is correct for all modes.

  return (gridPos + vec3f(bound)) / (2.0 * bound);
}

/**
 * Sample density data from pre-computed 3D grid texture.
 *
 * Returns (rho, logRho, spatialPhase, relativePhase) when rgba16float format is available.
 * Returns (rho, 0, 0, 0) for r16float fallback.
 *
 * When position is outside grid bounds, returns zero density.
 *
 * @param pos World-space position (model space during raymarching)
 * @param uniforms Schroedinger uniforms containing boundingRadius
 * @return vec4f with density data channels
 */
fn sampleDensityFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec4f {
  let uvw = worldToDensityGridUVW(pos, uniforms);

  // Clamp check: positions outside [0,1] UVW are outside the grid
  if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) {
    return vec4f(0.0);
  }

  // Use textureSampleLevel (explicit LOD=0) instead of textureSample
  // to avoid non-uniform control flow issues in the raymarching loop.
  // The density grid has a single mip level, so level 0 is always correct.
  return textureSampleLevel(densityGridTexture, densityGridSampler, uvw, 0.0);
}

/**
 * Compute density gradient from grid using central differences.
 * Uses 6 axis-aligned texture samples (2 per axis) for gradient estimation.
 *
 * @param pos World-space position
 * @param uniforms Schroedinger uniforms containing boundingRadius
 * @return Gradient vector (drho/dx, drho/dy, drho/dz)
 */
fn computeGradientFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  // Step size: 2 texels in world space for smoother gradient
  // Grid covers [-bound, +bound] with DENSITY_GRID_SIZE texels
  let bound = uniforms.boundingRadius;
  let eps = bound * (2.0 / DENSITY_GRID_SIZE);

  let dx = vec3f(eps, 0.0, 0.0);
  let dy = vec3f(0.0, eps, 0.0);
  let dz = vec3f(0.0, 0.0, eps);

  // Central differences on the rho channel (.r)
  let gradX = sampleDensityFromGrid(pos + dx, uniforms).r - sampleDensityFromGrid(pos - dx, uniforms).r;
  let gradY = sampleDensityFromGrid(pos + dy, uniforms).r - sampleDensityFromGrid(pos - dy, uniforms).r;
  let gradZ = sampleDensityFromGrid(pos + dz, uniforms).r - sampleDensityFromGrid(pos - dz, uniforms).r;

  // Normalize by 2*eps for proper central difference derivative
  return vec3f(gradX, gradY, gradZ) / (2.0 * eps);
}
`
