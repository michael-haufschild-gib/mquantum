/**
 * Julia SDF Grid Compute Shader
 *
 * Pre-computes a 3D SDF texture from the Julia fractal.
 * This replaces expensive per-pixel SDF evaluations during raymarching
 * with cheap texture lookups, providing 5-10x performance improvement.
 *
 * Architecture:
 * - Input: Julia uniforms, basis vectors, grid parameters
 * - Output: 64x64x64 (or configurable) rgba16float 3D texture
 * - Workgroup: 8x8x8 threads
 * - Dispatch: (gridSize/8)^3 workgroups
 *
 * Output format (rgba16float):
 * - R: signed distance value
 * - G: orbital trap value
 * - B: reserved (gradient x or AO)
 * - A: reserved (gradient y or shadow)
 *
 * @module rendering/webgpu/shaders/julia/compute/sdfGrid.wgsl
 */

/**
 * Grid parameters uniform struct
 * Must match JuliaSDFGridPass.ts GRID_PARAMS_SIZE
 */
export const sdfGridParamsBlock = /* wgsl */ `
// ============================================
// SDF Grid Compute Parameters
// ============================================

struct SDFGridParams {
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
 * - Group 0, Binding 0: JuliaUniforms
 * - Group 0, Binding 1: BasisVectors
 * - Group 0, Binding 2: SDFGridParams
 * - Group 0, Binding 3: Output texture (storage)
 */
export const sdfGridBindingsBlock = /* wgsl */ `
// ============================================
// Compute Shader Bind Groups
// ============================================

// Uniform bindings (read-only)
@group(0) @binding(0) var<uniform> julia: JuliaUniforms;
@group(0) @binding(1) var<uniform> basis: BasisVectors;
@group(0) @binding(2) var<uniform> gridParams: SDFGridParams;

// Output texture (write-only)
// Using rgba16float for hardware filtering support in the render pass
@group(0) @binding(3) var sdfGrid: texture_storage_3d<rgba16float, write>;
`

/**
 * SDF Grid compute shader entry point for 3D Julia.
 */
export const sdfGrid3dComputeBlock = /* wgsl */ `
// ============================================
// 3D SDF Grid Compute Shader Entry Point
// ============================================

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid >= gridParams.gridSize)) {
    return;
  }

  let gridSizeF = vec3f(gridParams.gridSize);
  let uvw = (vec3f(gid) + 0.5) / gridSizeF;
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);

  let distFromCenter = length(worldPos);
  if (distFromCenter > BOUND_R) {
    textureStore(sdfGrid, gid, vec4f(BOUND_R * 2.0, 0.0, 0.0, 0.0));
    return;
  }

  let result = sdfJulia3D(
    worldPos,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  );
  textureStore(sdfGrid, gid, vec4f(result.x, result.y, 0.0, 0.0));
}
`

/**
 * SDF Grid compute shader entry point for 4D Julia (quaternion).
 */
export const sdfGrid4dComputeBlock = /* wgsl */ `
// ============================================
// 4D SDF Grid Compute Shader Entry Point
// ============================================

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid >= gridParams.gridSize)) {
    return;
  }

  let gridSizeF = vec3f(gridParams.gridSize);
  let uvw = (vec3f(gid) + 0.5) / gridSizeF;
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);

  let distFromCenter = length(worldPos);
  if (distFromCenter > BOUND_R) {
    textureStore(sdfGrid, gid, vec4f(BOUND_R * 2.0, 0.0, 0.0, 0.0));
    return;
  }

  let result = sdfJulia4D(
    worldPos,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  );
  textureStore(sdfGrid, gid, vec4f(result.x, result.y, 0.0, 0.0));
}
`

/**
 * Generate compute shader entry point for dimensions 5-11.
 * @param dimension The dimension (5-11)
 */
export function generateSDFGridComputeBlock(dimension: number): string {
  return /* wgsl */ `
// ============================================
// ${dimension}D SDF Grid Compute Shader Entry Point
// ============================================

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (any(gid >= gridParams.gridSize)) {
    return;
  }

  let gridSizeF = vec3f(gridParams.gridSize);
  let uvw = (vec3f(gid) + 0.5) / gridSizeF;
  let worldPos = mix(gridParams.worldMin, gridParams.worldMax, uvw);

  let distFromCenter = length(worldPos);
  if (distFromCenter > BOUND_R) {
    textureStore(sdfGrid, gid, vec4f(BOUND_R * 2.0, 0.0, 0.0, 0.0));
    return;
  }

  let result = sdfJulia${dimension}D(
    worldPos,
    julia.effectivePower,
    julia.effectiveBailout,
    i32(julia.iterations)
  );
  textureStore(sdfGrid, gid, vec4f(result.x, result.y, 0.0, 0.0));
}
`
}
