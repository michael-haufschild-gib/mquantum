/**
 * WGSL Mandelbulb Dispatch Generation
 *
 * Generates dimension-specific dispatch WGSL code.
 * Port of GLSL dispatch.glsl.ts to WGSL.
 *
 * @module rendering/webgpu/shaders/mandelbulb/sdf/dispatch
 */

/**
 * Generate dimension-specific dispatch WGSL code
 * @param dimension - The dimension (3-11)
 * @returns WGSL dispatch code string
 */
export function generateDispatch(dimension: number): string {
  // Map dimension to function name
  // 3-11 are supported with unrolled versions
  let sdfName = 'mandelbulbSDFHighD'
  let simpleSdfName = 'mandelbulbSDFHighD_simple'
  let hasExplicitDim = false

  if (dimension >= 3 && dimension <= 11) {
    sdfName = `mandelbulbSDF${dimension}D`
    simpleSdfName = `mandelbulbSDF${dimension}D_simple`
  } else {
    // Fallback to generic high-D version
    hasExplicitDim = true
  }

  const dimArg = hasExplicitDim ? `${dimension}, ` : ''

  return /* wgsl */ `
// ============================================
// Optimized Dispatch (No branching)
// Dimension: ${dimension}
// Uses pre-computed uniforms from MandelbulbUniforms struct.
// ============================================

/**
 * Get distance to Mandelbulb surface (simple version).
 * Uses pre-computed uniforms for maximum performance.
 */
fn GetDist(pos: vec3f, basis: BasisVectors, uniforms: MandelbulbUniforms) -> f32 {
  return ${simpleSdfName}(pos, ${dimArg}basis, uniforms);
}

/**
 * Get distance to Mandelbulb surface with trap value output.
 * Uses pre-computed uniforms for maximum performance.
 */
fn GetDistWithTrap(pos: vec3f, basis: BasisVectors, uniforms: MandelbulbUniforms) -> vec2f {
  return ${sdfName}(pos, ${dimArg}basis, uniforms);
}
`
}

/**
 * Get the SDF block export name for a given dimension
 * @param dimension - The dimension (3-11)
 * @returns The export name string
 */
export function getSdfBlockName(dimension: number): string {
  if (dimension >= 3 && dimension <= 11) {
    return `sdf${dimension}dBlock`
  }
  return 'sdfHighDBlock'
}

/**
 * Get the import path for a given dimension's SDF block
 * @param dimension - The dimension (3-11)
 * @returns The relative import path
 */
export function getSdfImportPath(dimension: number): string {
  if (dimension >= 3 && dimension <= 11) {
    return `./sdf/sdf${dimension}d.wgsl`
  }
  return './sdf/sdf-high-d.wgsl'
}
