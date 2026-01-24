/**
 * Julia power helper functions
 * Provides optimized power calculations for Julia fractal iteration
 */
export const juliaPowerBlock = `
// ============================================
// Power animation helper for Julia
// Returns effective power value considering animation
// ============================================

float getEffectivePower() {
    float basePower = uPowerAnimationEnabled ? uAnimatedPower : uPower;
    return max(basePower, 2.0);
}

// ============================================
// Optimized Power Functions
// Fast paths for common Julia powers (2, 3, 4, 8)
// ============================================

// Fast power 2: r^2 and r^1
void fastPow2(float r, out float rPow, out float rPowMinus1) {
    rPowMinus1 = r;       // r^1
    rPow = r * r;         // r^2
}

// Fast power 3: r^3 and r^2
void fastPow3(float r, out float rPow, out float rPowMinus1) {
    float r2 = r * r;
    rPowMinus1 = r2;      // r^2
    rPow = r2 * r;        // r^3
}

// Fast power 4: r^4 and r^3
void fastPow4(float r, out float rPow, out float rPowMinus1) {
    float r2 = r * r;
    rPowMinus1 = r2 * r;  // r^3
    rPow = r2 * r2;       // r^4
}

// Fast power 8: r^8 and r^7 (classic Mandelbulb/Julia power)
void fastPow8(float r, out float rPow, out float rPowMinus1) {
    float r2 = r * r;
    float r4 = r2 * r2;
    rPowMinus1 = r4 * r2 * r;  // r^7
    rPow = r4 * r4;            // r^8
}

// Generic optimized power with fast paths for common values
// Returns r^pwr and r^(pwr-1) for derivative calculation
// OPT-C3: Shares log computation between powers
void optimizedPow(float r, float pwr, out float rPow, out float rPowMinus1) {
    // Fast paths for common Julia powers
    if (pwr == 2.0) {
        fastPow2(r, rPow, rPowMinus1);
    } else if (pwr == 3.0) {
        fastPow3(r, rPow, rPowMinus1);
    } else if (pwr == 4.0) {
        fastPow4(r, rPow, rPowMinus1);
    } else if (pwr == 8.0) {
        fastPow8(r, rPow, rPowMinus1);
    } else {
        // Generic path: share log computation
        float logR = log(max(r, EPS));
        rPow = exp(logR * pwr);
        rPowMinus1 = exp(logR * (pwr - 1.0));
    }
}
`
