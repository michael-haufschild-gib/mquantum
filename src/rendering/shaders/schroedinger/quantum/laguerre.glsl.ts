/**
 * Associated Laguerre Polynomial evaluation
 *
 * Associated Laguerre polynomials L^α_k(x) appear in the radial part
 * of hydrogen atom wavefunctions:
 *   R_nl(r) ∝ ρ^l · L^{2l+1}_{n-l-1}(ρ) · e^{-ρ/2}
 *
 * Recurrence relation (numerically stable for GPU):
 *   L^α_0(x) = 1
 *   L^α_1(x) = 1 + α - x
 *   (k+1)L^α_{k+1}(x) = (2k + 1 + α - x)L^α_k(x) - (k + α)L^α_{k-1}(x)
 *
 * @see https://mathworld.wolfram.com/AssociatedLaguerrePolynomial.html
 */
export const laguerreBlock = `
// ============================================
// Associated Laguerre Polynomial L^α_k(x)
// ============================================

// Maximum supported degree for Laguerre polynomials
// For hydrogen orbitals: k = n - l - 1, so for n=7, l=0: k=6
#define MAX_LAGUERRE_K 7

/**
 * Evaluate associated Laguerre polynomial L^α_k(x)
 *
 * Uses three-term recurrence relation for numerical stability.
 * This is more efficient than direct summation on GPU.
 *
 * @param k - Polynomial degree (non-negative integer)
 * @param alpha - Associated parameter (typically 2l+1 for hydrogen)
 * @param x - Evaluation point (typically ρ = 2r/na₀)
 * @return L^α_k(x)
 */
float laguerre(int k, float alpha, float x) {
    // Handle edge cases
    if (k < 0) return 0.0;
    if (k == 0) return 1.0;

    // L^α_1(x) = 1 + α - x
    float L0 = 1.0;
    float L1 = 1.0 + alpha - x;
    if (k == 1) return L1;

    // Clamp k to prevent infinite loops
    int kClamped = min(k, MAX_LAGUERRE_K);

    // Three-term recurrence
    float Lkm1 = L0;
    float Lk = L1;

    for (int i = 1; i < kClamped; i++) {
        float fi = float(i);
        // (k+1)L_{k+1} = (2k + 1 + α - x)L_k - (k + α)L_{k-1}
        float Lkp1 = ((2.0 * fi + 1.0 + alpha - x) * Lk - (fi + alpha) * Lkm1) / (fi + 1.0);
        Lkm1 = Lk;
        Lk = Lkp1;
    }

    return Lk;
}

/**
 * Evaluate associated Laguerre polynomial with damping for visualization
 *
 * High-degree polynomials can have large oscillations. This version
 * applies mild damping to keep values reasonable for volume rendering.
 *
 * @param k - Polynomial degree
 * @param alpha - Associated parameter
 * @param x - Evaluation point
 * @return Damped L^α_k(x)
 */
float laguerreDamped(int k, float alpha, float x) {
    float L = laguerre(k, alpha, x);
    // Damping factor to reduce oscillation amplitude at high k
    float damp = 1.0 / (1.0 + 0.05 * float(k * k));
    return damp * L;
}
`
