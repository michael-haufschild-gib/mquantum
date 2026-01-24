/**
 * Hydrogen Atom Radial Wavefunction R_nl(r)
 *
 * The radial part of the hydrogen wavefunction describes how
 * the probability density varies with distance from the nucleus.
 *
 * Formula:
 *   R_nl(r) = N_nl · (2r/na₀)^l · L^{2l+1}_{n-l-1}(2r/na₀) · e^{-r/na₀}
 *
 * where:
 *   N_nl = normalization constant
 *   a₀ = Bohr radius (scaling factor)
 *   L^α_k = associated Laguerre polynomial
 *
 * Properties:
 *   - n - l - 1 radial nodes (zeros)
 *   - Decays exponentially at large r
 *   - Scales as r^l near the origin
 *
 * @see https://en.wikipedia.org/wiki/Hydrogen_atom
 */
export const hydrogenRadialBlock = `
// ============================================
// Hydrogen Radial Wavefunction R_nl(r)
// ============================================

/**
 * Compute normalization constant for R_nl(r)
 *
 * N_nl = sqrt((2/na₀)³ · (n-l-1)! / (2n·(n+l)!))
 *
 * For visualization, we use a simplified normalization that
 * maintains relative amplitudes but avoids numerical issues.
 *
 * PERF: Uses FACTORIAL_LUT from sphericalHarmonics.glsl for O(1) lookup
 * instead of O(n+l) loop computation. Falls back to loop for n > 7.
 *
 * @param n - Principal quantum number (1-7)
 * @param l - Azimuthal quantum number (0 to n-1)
 * @param a0 - Bohr radius scale factor
 * @return Normalization constant
 */
float hydrogenRadialNorm(int n, int l, float a0) {
    float fn = float(n);

    // (2/na₀)^{3/2}
    float front = pow(2.0 / (fn * a0), 1.5);

    // sqrt((n-l-1)! / (2n·(n+l)!))
    // PERF: Use FACTORIAL_LUT for O(1) lookup (n ≤ 7 means n+l ≤ 12)
    int nMinusLMinus1 = n - l - 1;
    int nPlusL = n + l;

    float factRatio;
    if (nPlusL <= 12 && nMinusLMinus1 >= 0) {
        // PERF: Direct LUT lookup - O(1) instead of O(n+l) loop
        float factNum = FACTORIAL_LUT[nMinusLMinus1];
        float factDen = 2.0 * fn * FACTORIAL_LUT[nPlusL];
        factRatio = factNum / factDen;
    } else {
        // Fallback for edge cases (rare: n ≤ 7 means nPlusL ≤ 12)
        float factNum = 1.0;
        for (int i = 1; i <= nMinusLMinus1; i++) {
            factNum *= float(i);
        }
        float factDen = 2.0 * fn;
        for (int i = 1; i <= nPlusL; i++) {
            factDen *= float(i);
        }
        factRatio = factNum / factDen;
    }

    return front * sqrt(factRatio);
}

/**
 * Evaluate hydrogen radial wavefunction R_nl(r)
 *
 * @param n - Principal quantum number (n >= 1)
 * @param l - Azimuthal quantum number (0 <= l < n)
 * @param r - Radial distance from nucleus
 * @param a0 - Bohr radius scale factor (controls orbital size)
 * @return R_nl(r)
 */
float hydrogenRadial(int n, int l, float r, float a0) {
    // Validate quantum numbers
    if (n < 1 || l < 0 || l >= n) return 0.0;

    // Avoid division by zero
    if (a0 < 0.001) a0 = 0.001;

    // Scaled radial coordinate: ρ = 2r / (n·a₀)
    float fn = float(n);
    float rho = 2.0 * r / (fn * a0);

    // Normalization constant (simplified for visualization)
    float norm = hydrogenRadialNorm(n, l, a0);

    // ρ^l factor (behavior near origin)
    float fl = float(l);
    float rhoL = (l == 0) ? 1.0 : pow(max(rho, 1e-10), fl);

    // Associated Laguerre polynomial L^{2l+1}_{n-l-1}(ρ)
    int lagK = n - l - 1;
    float alpha = float(2 * l + 1);
    float L = laguerre(lagK, alpha, rho);

    // Exponential decay: e^{-ρ/2} = e^{-r/(na₀)}
    float expPart = exp(-rho * 0.5);

    // Damping for high n to prevent numerical blowup
    float damp = 1.0 / (1.0 + 0.02 * float(n * n));

    return damp * norm * rhoL * L * expPart;
}

/**
 * Compute radial probability density r²|R_nl|²
 *
 * This is what's often plotted to show where electrons are likely
 * to be found. The r² factor accounts for the spherical volume element.
 *
 * @param n - Principal quantum number
 * @param l - Azimuthal quantum number
 * @param r - Radial distance
 * @param a0 - Bohr radius
 * @return r²|R_nl(r)|²
 */
float hydrogenRadialProbability(int n, int l, float r, float a0) {
    float R = hydrogenRadial(n, l, r, a0);
    return r * r * R * R;
}

/**
 * Find approximate maximum of radial wavefunction
 *
 * Used for adaptive scaling in visualization.
 * For l=0 (s orbitals), max is near r ≈ n²·a₀
 * For l>0, max is near r ≈ n·a₀·(n - sqrt(n² - l²))
 *
 * @param n - Principal quantum number
 * @param l - Azimuthal quantum number
 * @param a0 - Bohr radius
 * @return Approximate radius of maximum probability
 */
float hydrogenRadialMaxRadius(int n, int l, float a0) {
    float fn = float(n);
    float fl = float(l);

    if (l == 0) {
        // s orbitals: max at r ≈ n·a₀
        return fn * a0;
    } else {
        // General case: max near r = n·a₀·(1 + sqrt(1 - (l/n)²))
        float ratio = fl / fn;
        return fn * a0 * (1.0 + sqrt(max(0.0, 1.0 - ratio * ratio)));
    }
}
`
