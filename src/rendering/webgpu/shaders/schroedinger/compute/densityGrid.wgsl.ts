/**
 * Density Grid Compute Shader
 *
 * Pre-computes a 3D density texture from the quantum wavefunction.
 * This replaces expensive per-pixel density evaluations during raymarching
 * with cheap texture lookups.
 *
 * Architecture:
 * - Input: Quantum uniforms, basis vectors, grid parameters
 * - Output: 64×64×64 (or configurable) r16float/rgba16float 3D texture
 * - Workgroup: 8×8×8 threads
 * - Dispatch: (gridSize/8)³ workgroups
 *
 * Expected performance improvement: 3-6x FPS increase by reducing
 * ~480 density evaluations per pixel to ~96 texture lookups.
 */

/**
 * Grid parameters uniform struct
 */
export const gridParamsBlock = /* wgsl */ `
// ============================================
// Density Grid Compute Parameters
// ============================================

struct GridParams {
  gridSize: vec3u,      // Grid resolution (e.g., 64, 64, 64)
  _pad0: u32,           // Padding for 16-byte alignment
  worldMin: vec3f,      // World-space minimum (e.g., -2, -2, -2)
  _pad1: f32,           // Padding
  worldMax: vec3f,      // World-space maximum (e.g., +2, +2, +2)
  _pad2: f32,           // Padding
}
`

/**
 * Compute shader bind group layout block
 * Uses a dedicated layout for compute:
 * - Group 0, Binding 0: SchroedingerUniforms
 * - Group 0, Binding 1: BasisVectors
 * - Group 0, Binding 2: GridParams
 * - Group 0, Binding 3: Output texture (storage)
 */
export function generateDensityGridBindingsBlock(
  storageFormat: 'r16float' | 'rgba16float' = 'rgba16float'
): string {
  return /* wgsl */ `
// ============================================
// Compute Shader Bind Groups
// ============================================

// Uniform bindings (read-only)
@group(0) @binding(0) var<uniform> schroedinger: SchroedingerUniforms;
@group(0) @binding(1) var<uniform> basis: BasisVectors;
@group(0) @binding(2) var<uniform> gridParams: GridParams;

// Output texture (write-only)
// r16float is used for density-only mode, rgba16float for phase-capable mode.
@group(0) @binding(3) var densityGrid: texture_storage_3d<${storageFormat}, write>;
`
}

// Backward-compatible default bindings block (rgba16float payload)
export const densityGridBindingsBlock = generateDensityGridBindingsBlock()

/**
 * Main compute shader entry point
 *
 * Each thread computes density for one grid cell.
 * The density value is stored in a 3D texture for later
 * sampling during raymarching.
 */
export const densityGridComputeBlock = /* wgsl */ `
// ============================================
// Density Grid Compute Shader Entry Point
// ============================================

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Bounds check - skip threads outside grid
  if (any(gid >= gridParams.gridSize)) {
    return;
  }

  // Convert grid coordinate to normalized [0,1] space
  // Note: gridSize-1 ensures we sample at grid cell centers including boundaries
  let gridSizeF = vec3f(gridParams.gridSize);
  let uvw = (vec3f(gid) + 0.5) / gridSizeF;

  // Convert to world-space position within bounding volume
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);

  // Check if position is within the bounding sphere (dynamic radius)
  // Grid is a cube, but quantum volume is spherical - skip corners
  let distFromCenter = length(worldPos);
  if (distFromCenter > schroedinger.boundingRadius) {
    // Outside bounding sphere - store zero density
    textureStore(densityGrid, gid, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Compute animation time (matching fragment shader convention)
  let t = schroedinger.time * schroedinger.timeScale;

  // Sample density at this grid point using existing quantum functions
  // sampleDensityWithPhase returns vec3f(rho, logRho, spatialPhase)
  let densityResult = sampleDensityWithPhase(worldPos, t, schroedinger);

  // Extract density value
  let rho = densityResult.x;

  // Store density in the 3D texture
  textureStore(densityGrid, gid, vec4f(rho, 0.0, 0.0, 0.0));
}
`

/**
 * Extended compute shader that also stores phase information
 * for phase-based coloring during rendering.
 *
 * Output format (rgba16float):
 * - R: density (rho)
 * - G: log density (s)
 * - B: spatial phase
 * - A: reserved (flow magnitude or gradient magnitude)
 */
export const densityGridWithPhaseComputeBlock = /* wgsl */ `
// ============================================
// Density Grid with Phase - Compute Shader
// ============================================

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  // Bounds check
  if (any(gid >= gridParams.gridSize)) {
    return;
  }

  // Convert grid coordinate to world-space position
  let gridSizeF = vec3f(gridParams.gridSize);
  let uvw = (vec3f(gid) + 0.5) / gridSizeF;
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);

  // Skip positions outside bounding sphere (dynamic radius)
  let distFromCenter = length(worldPos);
  if (distFromCenter > schroedinger.boundingRadius) {
    textureStore(densityGrid, gid, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Compute animation time
  let t = schroedinger.time * schroedinger.timeScale;

  // Sample density with full phase information
  let densityResult = sampleDensityWithPhase(worldPos, t, schroedinger);

  // densityResult = vec3f(rho, logRho, spatialPhase)
  let rho = densityResult.x;
  let logRho = densityResult.y;
  let spatialPhase = densityResult.z;

  // Store all values
  textureStore(densityGrid, gid, vec4f(rho, logRho, spatialPhase, 0.0));
}
`
