/**
 * Generate dimension-specific dispatch GLSL code
 * @param dimension - The dimension (3-11)
 * @returns GLSL dispatch code string
 */
export function generateDispatch(dimension: number): string {
  // Map dimension to function name
  // 3-11 are supported with unrolled versions
  let sdfName = 'sdfHighD'
  let simpleSdfName = 'sdfHighD_simple'
  let args = 'pos, uDimension, pwr, bail, maxIt'
  let argsTrap = 'pos, uDimension, pwr, bail, maxIt, trap'

  if (dimension >= 3 && dimension <= 11) {
    sdfName = `sdf${dimension}D`
    simpleSdfName = `sdf${dimension}D_simple`
    args = 'pos, pwr, bail, maxIt'
    argsTrap = 'pos, pwr, bail, maxIt, trap'
  }

  return `
// ============================================
// Optimized Dispatch (No branching)
// Dimension: ${dimension}
// PERF: Uses pre-computed uniforms (uEffectivePower, uEffectiveBailout)
//       instead of per-call computation. ~640x fewer branches per pixel.
// ============================================

/**
 * Get distance to Mandelbulb surface (simple version).
 * Uses pre-computed uniforms for maximum performance.
 */
float GetDist(vec3 pos) {
    // PERF: uEffectivePower and uEffectiveBailout computed once per frame on CPU
    return ${simpleSdfName}(${args.replace('pwr', 'uEffectivePower').replace('bail', 'uEffectiveBailout').replace('maxIt', 'int(uSdfMaxIterations)')});
}

/**
 * Get distance to Mandelbulb surface with trap value output.
 * Uses pre-computed uniforms for maximum performance.
 */
float GetDistWithTrap(vec3 pos, out float trap) {
    // PERF: uEffectivePower and uEffectiveBailout computed once per frame on CPU
    return ${sdfName}(${argsTrap.replace('pwr', 'uEffectivePower').replace('bail', 'uEffectiveBailout').replace('maxIt', 'int(uSdfMaxIterations)')});
}
`
}
