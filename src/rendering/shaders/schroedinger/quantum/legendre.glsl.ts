/**
 * Associated Legendre Polynomial evaluation
 *
 * Associated Legendre polynomials P^m_l(x) are the θ-dependent part
 * of spherical harmonics:
 *   Y_lm(θ, φ) ∝ P^{|m|}_l(cos θ) · e^{imφ}
 *
 * Recurrence relations used:
 *   P^m_m(x) = (-1)^m (2m-1)!! (1-x²)^{m/2}
 *   P^m_{m+1}(x) = x(2m+1) P^m_m(x)
 *   (l-m)P^m_l(x) = x(2l-1)P^m_{l-1}(x) - (l+m-1)P^m_{l-2}(x)
 *
 * @see https://en.wikipedia.org/wiki/Associated_Legendre_polynomials
 */
export const legendreBlock = `
// ============================================
// Associated Legendre Polynomial P^m_l(x)
// ============================================

// Maximum supported l for Legendre polynomials
// For hydrogen orbitals: l can be up to n-1, so for n=7: l=6
#define MAX_LEGENDRE_L 7

/**
 * Evaluate associated Legendre polynomial P^m_l(x)
 *
 * Uses upward recurrence from P^m_m, which is numerically stable for |x| <= 1.
 *
 * Note: This computes P^{|m|}_l(x). The Condon-Shortley phase factor
 * (-1)^m is included in the spherical harmonic normalization.
 *
 * @param l - Degree (l >= 0)
 * @param m - Order (|m| <= l)
 * @param x - Evaluation point (typically cos(θ), so |x| <= 1)
 * @return P^{|m|}_l(x)
 */
float legendre(int l, int m, float x) {
    int absM = abs(m);

    // Validate: |m| must be <= l
    if (absM > l) return 0.0;

    // Clamp x to valid range to avoid numerical issues
    x = clamp(x, -1.0, 1.0);

    // Compute (1 - x²)^{1/2} = sin(θ) for x = cos(θ)
    float somx2 = sqrt((1.0 - x) * (1.0 + x));

    // Start with P^m_m using the closed form:
    // P^m_m(x) = (-1)^m (2m-1)!! (1-x²)^{m/2}
    // We compute without the (-1)^m phase (handled in spherical harmonics)
    float pmm = 1.0;

    if (absM > 0) {
        // (2m-1)!! = 1·3·5·...·(2m-1)
        float fact = 1.0;
        for (int i = 1; i <= absM; i++) {
            pmm *= fact * somx2;
            fact += 2.0;
        }
        // Include (-1)^m Condon-Shortley phase
        if ((absM & 1) == 1) pmm = -pmm;
    }

    // If l == |m|, we're done
    if (l == absM) return pmm;

    // Compute P^m_{m+1} = x(2m+1) P^m_m
    float pmmp1 = x * (2.0 * float(absM) + 1.0) * pmm;

    // If l == |m| + 1, we're done
    if (l == absM + 1) return pmmp1;

    // Upward recurrence for l > |m| + 1:
    // (l-m)P^m_l = x(2l-1)P^m_{l-1} - (l+m-1)P^m_{l-2}
    float pll = pmmp1;

    for (int ll = absM + 2; ll <= min(l, MAX_LEGENDRE_L); ll++) {
        float fll = float(ll);
        float fm = float(absM);
        pll = (x * (2.0 * fll - 1.0) * pmmp1 - (fll + fm - 1.0) * pmm) / (fll - fm);
        pmm = pmmp1;
        pmmp1 = pll;
    }

    return pll;
}

/**
 * Compute P_l(x) - the regular Legendre polynomial (m=0 case)
 *
 * This is a simpler recurrence:
 *   P_0(x) = 1
 *   P_1(x) = x
 *   (l+1)P_{l+1}(x) = (2l+1)x P_l(x) - l P_{l-1}(x)
 *
 * @param l - Degree
 * @param x - Evaluation point
 * @return P_l(x)
 */
float legendreP(int l, float x) {
    if (l < 0) return 0.0;
    if (l == 0) return 1.0;
    if (l == 1) return x;

    float P0 = 1.0;
    float P1 = x;
    float Pl = P1;

    for (int i = 1; i < min(l, MAX_LEGENDRE_L); i++) {
        float fi = float(i);
        Pl = ((2.0 * fi + 1.0) * x * P1 - fi * P0) / (fi + 1.0);
        P0 = P1;
        P1 = Pl;
    }

    return Pl;
}
`
