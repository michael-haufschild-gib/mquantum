export const powerBlock = `
// ============================================
// Power animation helper (Technique B)
// Returns effective power value considering animation and alternate power
// ============================================

float getEffectivePower() {
    // Start with base power (possibly animated)
    float basePower = uPowerAnimationEnabled ? uAnimatedPower : uPower;

    // Apply alternate power blending if enabled
    if (uAlternatePowerEnabled) {
        basePower = mix(basePower, uAlternatePowerValue, uAlternatePowerBlend);
    }

    // Clamp to minimum safe value
    return max(basePower, 2.0);
}

// ============================================
// Optimized Power Functions
// ============================================

// Fast integer power for common Mandelbulb power value (8)
// Uses only 3 multiplications instead of expensive pow()
// pow(r, 8) = r^8, pow(r, 7) = r^7 for derivative
void fastPow8(float r, out float rPow, out float rPowMinus1) {
    float r2 = r * r;
    float r4 = r2 * r2;
    rPowMinus1 = r4 * r2 * r;  // r^7
    rPow = rPowMinus1 * r;      // r^8
}

// Generic optimized power that uses fastPow8 when applicable
// Returns r^pwr and r^(pwr-1) for derivative calculation
void optimizedPow(float r, float pwr, out float rPow, out float rPowMinus1) {
    if (pwr == 8.0) {
        fastPow8(r, rPow, rPowMinus1);
    } else {
        // Use direct exponentiation for stability
        // pow(max(r, EPS), pwr-1.0) is more stable than rPow/r when r is small
        rPow = pow(r, pwr);
        rPowMinus1 = pow(max(r, EPS), pwr - 1.0);
    }
}
`
