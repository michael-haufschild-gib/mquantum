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
// Only fast-path power=8 (most common) to avoid branch cascade overhead
// ============================================

// Fast integer power for common Mandelbulb power value (8)
// Uses only 4 multiplications instead of expensive pow()
void fastPow8(float r, out float rPow, out float rPowMinus1) {
    float r2 = r * r;
    float r4 = r2 * r2;
    rPowMinus1 = r4 * r2 * r;  // r^7
    rPow = r4 * r4;             // r^8
}

// Generic optimized power - fast path for power=8, pow() for others
// Returns r^pwr and r^(pwr-1) for derivative calculation
void optimizedPow(float r, float pwr, out float rPow, out float rPowMinus1) {
    if (pwr == 8.0) {
        fastPow8(r, rPow, rPowMinus1);
    } else {
        rPow = pow(r, pwr);
        rPowMinus1 = pow(max(r, EPS), pwr - 1.0);
    }
}
`;
