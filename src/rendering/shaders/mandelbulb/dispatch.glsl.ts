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
// ============================================

/**
 * Get distance to Mandelbulb surface (simple version).
 * Uses uSdfMaxIterations from store (user-configurable).
 */
float GetDist(vec3 pos) {
    float pwr = getEffectivePower();
    float bail = max(uEscapeRadius, 2.0);
    int maxIt = int(uSdfMaxIterations);

    return ${simpleSdfName}(${args});
}

/**
 * Get distance to Mandelbulb surface with trap value output.
 * Uses uSdfMaxIterations from store (user-configurable).
 */
float GetDistWithTrap(vec3 pos, out float trap) {
    float pwr = getEffectivePower();
    float bail = max(uEscapeRadius, 2.0);
    int maxIt = int(uSdfMaxIterations);

    return ${sdfName}(${argsTrap});
}
`
}
