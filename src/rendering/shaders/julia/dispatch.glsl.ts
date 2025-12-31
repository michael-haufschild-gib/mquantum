export const dispatchBlock = `
// ============================================
// SDF Dispatcher
// ============================================

/**
 * Get distance to Julia surface with trap value output.
 * Uses uSdfMaxIterations from store (user-configurable).
 */
float GetDistWithTrap(vec3 pos, out float trap) {
    float pwr = getEffectivePower();
    float bail = max(uEscapeRadius, 2.0);
    int maxIt = int(uSdfMaxIterations);

    return sdfJulia3D(pos, pwr, bail, maxIt, trap);
}

/**
 * Get distance to Julia surface (simple version).
 * Uses uSdfMaxIterations from store (user-configurable).
 */
float GetDist(vec3 pos) {
    float pwr = getEffectivePower();
    float bail = max(uEscapeRadius, 2.0);
    int maxIt = int(uSdfMaxIterations);

    return sdfJulia3D_simple(pos, pwr, bail, maxIt);
}
`;
