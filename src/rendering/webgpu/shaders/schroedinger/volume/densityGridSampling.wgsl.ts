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
 * Bind group declaration + sampling function for pre-computed gradient normals.
 * Only included when USE_PRECOMPUTED_NORMALS is true (analytic modes with density grid).
 */
export function generateNormalGridFragmentBinding(startBinding: number = 7): string {
  return /* wgsl */ `
@group(2) @binding(${startBinding}) var normalGridTexture: texture_3d<f32>;

/**
 * Sample pre-computed gradient normal from the normal grid texture.
 * Returns vec3f normal direction. Returns zero-length vector when
 * gradient magnitude is too small (density peak / empty region),
 * signaling the caller to fall back to viewDir.
 */
fn sampleNormalFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  let uvw = worldToDensityGridUVW(pos, uniforms);
  if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) {
    return vec3f(0.0, 1.0, 0.0);
  }
  let packed = textureSampleLevel(normalGridTexture, densityGridSampler, uvw, 0.0);
  if (packed.w < 0.01) {
    return vec3f(0.0);
  }
  return packed.xyz;
}
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
 * Compute log-density gradient from grid using central differences.
 * Returns ∇s = ∇log(ρ+ε), consistent with tetrahedral and analytical gradient methods.
 * Uses 6 axis-aligned texture samples (2 per axis) for gradient estimation.
 *
 * @param pos World-space position
 * @param uniforms Schroedinger uniforms containing boundingRadius
 * @return Gradient vector (ds/dx, ds/dy, ds/dz) where s = log(ρ + ε)
 */
fn computeGradientFromGrid(pos: vec3f, uniforms: SchroedingerUniforms) -> vec3f {
  // PERF: Compute base UVW once, then offset in UVW space directly.
  // This avoids 6 redundant worldToDensityGridUVW calls (each does div + add).
  let bound = uniforms.boundingRadius;
  let invDiameter = uniforms.invBoundingRadius * 0.5; // = 1 / (2 * bound)

  // Step size in UVW space: 2 texels / gridSize
  let uvwStep = 2.0 / DENSITY_GRID_SIZE;
  let baseUVW = (pos + vec3f(bound)) * invDiameter;

  // Sample 6 neighbors in UVW space with zero-outside-grid semantics.
  // Matches sampleDensityFromGrid: positions outside [0,1] return zero,
  // preventing clamp-to-edge from creating spurious gradients at the boundary.
  let uxp = baseUVW + vec3f(uvwStep, 0.0, 0.0);
  let uxn = baseUVW - vec3f(uvwStep, 0.0, 0.0);
  let uyp = baseUVW + vec3f(0.0, uvwStep, 0.0);
  let uyn = baseUVW - vec3f(0.0, uvwStep, 0.0);
  let uzp = baseUVW + vec3f(0.0, 0.0, uvwStep);
  let uzn = baseUVW - vec3f(0.0, 0.0, uvwStep);
  let sxp = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uxp, 0.0), all(uxp >= vec3f(0.0)) && all(uxp <= vec3f(1.0)));
  let sxn = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uxn, 0.0), all(uxn >= vec3f(0.0)) && all(uxn <= vec3f(1.0)));
  let syp = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uyp, 0.0), all(uyp >= vec3f(0.0)) && all(uyp <= vec3f(1.0)));
  let syn = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uyn, 0.0), all(uyn >= vec3f(0.0)) && all(uyn <= vec3f(1.0)));
  let szp = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uzp, 0.0), all(uzp >= vec3f(0.0)) && all(uzp <= vec3f(1.0)));
  let szn = select(vec4f(0.0), textureSampleLevel(densityGridTexture, densityGridSampler, uzn, 0.0), all(uzn >= vec3f(0.0)) && all(uzn <= vec3f(1.0)));

  // World-space half-distance between sample points (each offset is ±uvwStep
  // = ±2 texels in UVW = ±(2/N * 2*bound) in world, total 2h = 8*bound/N).
  let eps = bound * (4.0 / DENSITY_GRID_SIZE);

  if (IS_DUAL_CHANNEL) {
    let gradX = (sxp.r + sxp.g) - (sxn.r + sxn.g);
    let gradY = (syp.r + syp.g) - (syn.r + syn.g);
    let gradZ = (szp.r + szp.g) - (szn.r + szn.g);
    let gradRho = vec3f(gradX, gradY, gradZ) / (2.0 * eps);
    let rhoCenter = textureSampleLevel(densityGridTexture, densityGridSampler, baseUVW, 0.0);
    let rhoTotal = rhoCenter.r + rhoCenter.g;
    return gradRho / max(rhoTotal + 1e-8, 1e-8);
  } else if (DENSITY_GRID_HAS_PHASE) {
    let gradX = sxp.g - sxn.g;
    let gradY = syp.g - syn.g;
    let gradZ = szp.g - szn.g;
    return vec3f(gradX, gradY, gradZ) / (2.0 * eps);
  } else {
    let gradX = sxp.r - sxn.r;
    let gradY = syp.r - syn.r;
    let gradZ = szp.r - szn.r;
    let gradRho = vec3f(gradX, gradY, gradZ) / (2.0 * eps);
    let rho = textureSampleLevel(densityGridTexture, densityGridSampler, baseUVW, 0.0).r;
    return gradRho / max(rho + 1e-8, 1e-8);
  }
}
`
