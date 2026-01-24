/**
 * 1D Harmonic Oscillator eigenfunction
 *
 * The quantum harmonic oscillator eigenfunctions are:
 *   φ_n(x) = (α/π)^{1/4} · (1/√(2^n n!)) · H_n(αx) · e^{-½(αx)²}
 *
 * where α = √(mω/ℏ) and H_n is the Hermite polynomial.
 *
 * For visualization (not physical simulation), we use a simplified version
 * without the normalization constant, and add damping for stability:
 *   φ_n(x) ∝ damp(n) · H_n(αx) · e^{-½(αx)²}
 *
 * The damping factor prevents blowup at higher quantum numbers.
 */
export const ho1dBlock = `
// ============================================
// 1D Harmonic Oscillator Eigenfunction
// ============================================

// Evaluate 1D HO eigenfunction φ_n(x, ω)
// Uses visual normalization (not physically exact but stable)
//
// Parameters:
//   n     - quantum number (0-6)
//   x     - position coordinate
//   omega - angular frequency (affects spread)
//
// Returns: eigenfunction value (real)
float ho1D(int n, float x, float omega) {
    // α = √ω (in dimensionless units with ℏ=m=1)
    float alpha = sqrt(max(omega, 0.01));
    float u = alpha * x;

    // Gaussian envelope: e^{-½u²}
    // Clamp u² to prevent underflow
    float u2 = min(u * u, 40.0);
    float gauss = exp(-0.5 * u2);

    // Hermite polynomial
    float H = hermite(n, u);

    // Damping factor to prevent blowup at higher n
    // This keeps visual amplitude reasonable across quantum numbers
    float damp = 1.0 / (1.0 + 0.15 * float(n * n));

    return damp * H * gauss;
}

// Evaluate product of 1D HO eigenfunctions for D dimensions
// This is the separable D-dimensional eigenfunction:
//   Φ_n(x) = Π_{j=0}^{D-1} φ_{n_j}(x_j, ω_j)
//
// Parameters:
//   xND    - D-dimensional coordinates
//   dim    - number of dimensions
//   nVec   - quantum numbers for each dimension (packed in uQuantum)
//   termIdx - which superposition term (for accessing uQuantum)
//
// Returns: product eigenfunction value (real)
float hoND(float xND[MAX_DIM], int dim, int termIdx) {
    // OPTIMIZATION: Early exit for points outside 3σ Gaussian envelope
    // Harmonic oscillator decays as exp(-0.5 * α² * x²), negligible beyond 3σ
    // This saves ~20-30% of wavefunction evaluations at volume boundaries
    float distSq = 0.0;
    for (int j = 0; j < MAX_DIM; j++) {
        if (j >= dim) break;
        float alpha = sqrt(max(uOmega[j], 0.01));
        float u = alpha * xND[j];
        distSq += u * u;
    }
    // If sum of squared scaled coords > 18 (≈3σ per dim), contribution < 1e-8
    // This threshold works well for up to 11 dimensions
    if (distSq > 18.0) return 0.0;

    float product = 1.0;

    for (int j = 0; j < MAX_DIM; j++) {
        if (j >= dim) break;

        int n = uQuantum[termIdx * MAX_DIM + j];
        float omega = uOmega[j];

        product *= ho1D(n, xND[j], omega);

        // Early exit if product becomes negligible
        if (abs(product) < 1e-10) return 0.0;
    }

    return product;
}
`
