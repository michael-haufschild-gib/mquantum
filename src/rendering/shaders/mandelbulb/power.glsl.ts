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
// OPT-SDF-2: Optimized Power Functions using Multiplication Chains
// Integer powers use chains instead of expensive pow()
// ============================================

// Generic optimized power that uses multiplication chains for integer powers
// Returns r^pwr and r^(pwr-1) for derivative calculation
void optimizedPow(float r, float pwr, out float rPow, out float rPowMinus1) {
    // OPT-SDF-2: Check for integer powers and use multiplication chains
    // This avoids expensive pow() calls for common Mandelbulb powers
    // OPT-SDF-2b: Use else-if chain to avoid evaluating all comparisons

    // Power 2: r^2, r^1 (2 muls)
    if (pwr == 2.0) {
        rPowMinus1 = r;
        rPow = r * r;
    }
    // Power 3: r^3, r^2 (2 muls)
    else if (pwr == 3.0) {
        float r2 = r * r;
        rPowMinus1 = r2;
        rPow = r2 * r;
    }
    // Power 4: r^4, r^3 (3 muls)
    else if (pwr == 4.0) {
        float r2 = r * r;
        rPowMinus1 = r2 * r;
        rPow = r2 * r2;
    }
    // Power 5: r^5, r^4 (4 muls)
    else if (pwr == 5.0) {
        float r2 = r * r;
        float r4 = r2 * r2;
        rPowMinus1 = r4;
        rPow = r4 * r;
    }
    // Power 6: r^6, r^5 (4 muls)
    else if (pwr == 6.0) {
        float r2 = r * r;
        float r3 = r2 * r;
        rPowMinus1 = r3 * r2;
        rPow = r3 * r3;
    }
    // Power 7: r^7, r^6 (4 muls)
    else if (pwr == 7.0) {
        float r2 = r * r;
        float r3 = r2 * r;
        float r6 = r3 * r3;
        rPowMinus1 = r6;
        rPow = r6 * r;
    }
    // Power 8: r^8, r^7 (4 muls) - most common Mandelbulb power
    else if (pwr == 8.0) {
        float r2 = r * r;
        float r4 = r2 * r2;
        rPowMinus1 = r4 * r2 * r;  // r^7
        rPow = r4 * r4;             // r^8
    }
    // Power 9: r^9, r^8 (5 muls)
    else if (pwr == 9.0) {
        float r2 = r * r;
        float r4 = r2 * r2;
        float r8 = r4 * r4;
        rPowMinus1 = r8;
        rPow = r8 * r;
    }
    // Power 10: r^10, r^9 (5 muls)
    else if (pwr == 10.0) {
        float r2 = r * r;
        float r4 = r2 * r2;
        float r5 = r4 * r;
        rPowMinus1 = r5 * r4;
        rPow = r5 * r5;
    }
    // Fallback: Use pow() for non-integer or very high powers
    else {
        rPow = pow(r, pwr);
        rPowMinus1 = pow(max(r, EPS), pwr - 1.0);
    }
}
`;
