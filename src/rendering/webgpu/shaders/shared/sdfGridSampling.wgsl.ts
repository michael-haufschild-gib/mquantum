/**
 * SDF Grid Sampling Utilities
 *
 * WGSL functions for sampling pre-computed SDF values from a 3D texture.
 * These functions replace expensive per-pixel SDF evaluations with cheap
 * texture lookups during raymarching.
 *
 * The grid texture format (rgba16float):
 * - R: signed distance value
 * - G: orbital trap value
 * - B: reserved
 * - A: reserved
 *
 * @module rendering/webgpu/shaders/shared/sdfGridSampling.wgsl
 */

/**
 * Bind group declarations for SDF grid texture.
 * These are added to Group 2 (object-specific) alongside object uniforms.
 *
 * @param startBinding The binding index to start from (after object uniforms)
 */
export function generateSDFGridBindings(startBinding: number = 2): string {
  return /* wgsl */ `
// ============================================
// SDF Grid Texture Bindings
// ============================================

@group(2) @binding(${startBinding}) var sdfGridTexture: texture_3d<f32>;
@group(2) @binding(${startBinding + 1}) var sdfGridSampler: sampler;
`
}

/**
 * Grid coordinate conversion constants.
 * Must match the compute pass WORLD_BOUND value.
 */
export const sdfGridConstantsBlock = /* wgsl */ `
// ============================================
// SDF Grid Constants
// ============================================

// World space bounds (matches compute pass)
const SDF_GRID_BOUND: f32 = 2.0;

// Grid sampling epsilon to prevent edge artifacts
const SDF_GRID_EPS: f32 = 0.001;
`

/**
 * SDF grid sampling functions.
 * These replace the direct SDF evaluation functions during raymarching.
 */
export const sdfGridSamplingBlock = /* wgsl */ `
// ============================================
// SDF Grid Sampling Functions
// ============================================

/**
 * Convert world position to grid UVW coordinates.
 * Maps [-BOUND, +BOUND] to [0, 1].
 *
 * @param p World-space position
 * @return UVW coordinates for texture sampling
 */
fn worldToGridUVW(p: vec3f) -> vec3f {
  // Map from [-BOUND, BOUND] to [0, 1]
  return (p + vec3f(SDF_GRID_BOUND)) / (2.0 * SDF_GRID_BOUND);
}

/**
 * Check if a position is inside the SDF grid bounds.
 *
 * @param p World-space position
 * @return True if position can be sampled from grid
 */
fn isInsideSDFGrid(p: vec3f) -> bool {
  let absP = abs(p);
  return absP.x < SDF_GRID_BOUND && absP.y < SDF_GRID_BOUND && absP.z < SDF_GRID_BOUND;
}

/**
 * Sample signed distance from pre-computed SDF grid.
 *
 * When the position is outside the grid bounds, returns an approximate
 * distance based on the bounding sphere.
 *
 * @param p World-space position (MODEL space during raymarching)
 * @return Signed distance value
 */
fn GetDistFromGrid(p: vec3f) -> f32 {
  // Check bounds - outside the grid, estimate distance to bounding sphere
  if (!isInsideSDFGrid(p)) {
    // Distance to bounding sphere surface
    return length(p) - SDF_GRID_BOUND + SDF_GRID_EPS;
  }

  // Sample from 3D texture with trilinear filtering
  let uvw = worldToGridUVW(p);
  let sample = textureSample(sdfGridTexture, sdfGridSampler, uvw);

  // R channel contains signed distance
  return sample.r;
}

/**
 * Sample signed distance and orbital trap from pre-computed SDF grid.
 *
 * @param p World-space position (MODEL space during raymarching)
 * @return vec2f where x = signed distance, y = orbital trap value
 */
fn GetDistWithOrbitalFromGrid(p: vec3f) -> vec2f {
  // Check bounds
  if (!isInsideSDFGrid(p)) {
    // Outside grid - return bounding sphere distance and zero trap
    return vec2f(length(p) - SDF_GRID_BOUND + SDF_GRID_EPS, 0.0);
  }

  // Sample from 3D texture
  let uvw = worldToGridUVW(p);
  let sample = textureSample(sdfGridTexture, sdfGridSampler, uvw);

  // R = distance, G = orbital trap
  return vec2f(sample.r, sample.g);
}
`

/**
 * Alternative dispatch functions that route to grid sampling.
 * These replace the standard GetDist/GetDistWithOrbital functions
 * when grid sampling mode is enabled.
 */
export const sdfGridDispatchBlock = /* wgsl */ `
// ============================================
// SDF Grid Dispatch Functions
// ============================================
// These replace direct SDF evaluation with grid sampling

fn GetDist(p: vec3f) -> f32 {
  return GetDistFromGrid(p);
}

fn GetDistWithOrbital(p: vec3f) -> vec2f {
  return GetDistWithOrbitalFromGrid(p);
}
`

