/**
 * Generate dimension-specific dispatch GLSL code for Julia
 * Maps dimension to the appropriate optimized SDF function.
 *
 * @param dimension - The dimension (3-11)
 * @returns GLSL dispatch code string
 */
export function generateDispatch(dimension: number): string {
  // Clamp dimension to valid range
  const dim = Math.max(3, Math.min(11, dimension))

  // Generate dimension-specific function names
  const sdfName = `sdfJulia${dim}D`
  const simpleSdfName = `sdfJulia${dim}D_simple`

  return `
// ============================================
// Optimized Dispatch (Compile-time dimension: ${dim})
// Zero runtime branching - SDF selected at shader compile time
// ============================================

/**
 * Get distance to Julia surface with trap value output.
 * Uses uSdfMaxIterations from store (user-configurable).
 */
float GetDistWithTrap(vec3 pos, out float trap) {
    float pwr = getEffectivePower();
    float bail = max(uEscapeRadius, 2.0);
    int maxIt = int(uSdfMaxIterations);

    return ${sdfName}(pos, pwr, bail, maxIt, trap);
}

/**
 * Get distance to Julia surface (simple version).
 * Uses uSdfMaxIterations from store (user-configurable).
 */
float GetDist(vec3 pos) {
    float pwr = getEffectivePower();
    float bail = max(uEscapeRadius, 2.0);
    int maxIt = int(uSdfMaxIterations);

    return ${simpleSdfName}(pos, pwr, bail, maxIt);
}
`
}

// Legacy static export for backwards compatibility (defaults to 4D)
export const dispatchBlock = generateDispatch(4)
