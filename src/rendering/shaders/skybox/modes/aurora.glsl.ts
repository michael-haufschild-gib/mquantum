export const auroraBlock = `
// Mode 1: Aurora (Flowing Vertical Curtains)
// Optimized aurora with single curtain layer for better performance
vec3 getAurora(vec3 dir, float time) {
    // Spherical coordinates for proper curtain mapping
    float theta = atan(dir.x, dir.z); // Horizontal angle
    float phi = asin(clamp(dir.y, -1.0, 1.0)); // Vertical angle

    // Aurora vertical coverage controlled by uAuroraCurtainHeight
    float heightLow = mix(-0.2, 0.1, uAuroraCurtainHeight);
    float heightHigh = mix(0.3, 0.8, uAuroraCurtainHeight);
    float auroraHeight = smoothstep(heightLow, heightHigh, dir.y);

    // Wave frequency multiplier for curtain density
    float waveFreq = uAuroraWaveFrequency;

    // Single optimized curtain layer combining primary and secondary ribbons
    // Use only integer multipliers of theta for seamless wrapping
    float h1 = theta * 3.0 + uEvolution * TAU;
    float wave1 = sin(h1 + time * 0.3) * cos(theta * 2.0 + time * 0.2);

    // Primary fold with turbulence
    float fold1 = sin(phi * 8.0 * waveFreq + wave1 * 2.0 * uTurbulence + time * 0.5);
    float curtain = smoothstep(0.0, 0.8, fold1) * smoothstep(1.0, 0.3, fold1);

    // Add secondary detail via simple modulation (cheaper than second full layer)
    float detail = sin(phi * 12.0 * waveFreq + theta * 5.0 + time * 0.7) * 0.3;
    curtain += detail * smoothstep(0.2, 0.6, curtain);

    // Simple pulsing glow (single sin instead of dual)
    float pulseGlow = 1.0 + sin(time * 0.18 + theta * 2.0) * 0.15;

    // Vertical fade
    float verticalFade = pow(clamp(dir.y + 0.2, 0.0, 1.0), 0.5);
    float bottomFade = smoothstep(-0.3, 0.2, dir.y);

    // Combined intensity
    float intensity = curtain * verticalFade * bottomFade * pulseGlow * uScale;

    float v = clamp(intensity, 0.0, 1.0);

    // Dark sky background
    vec3 nightSky = vec3(0.02, 0.02, 0.05);

    // Color Mapping
    vec3 auroraColor;
    float colorShift = sin(time * 0.08) * 0.1; // Subtle color drift

    if (uUsePalette > 0.5) {
        float paletteT = v * 0.7 + 0.15 + colorShift;
        auroraColor = cosinePalette(paletteT, uPalA, uPalB, uPalC, uPalD);

        // Vertical color variation
        float heightColor = smoothstep(0.0, 0.6, dir.y);
        vec3 topColor = cosinePalette(0.8, uPalA, uPalB, uPalC, uPalD);
        auroraColor = mix(auroraColor, topColor, heightColor * 0.4);
    } else {
        float gradientT = clamp(smoothstep(0.0, 0.5, dir.y) + colorShift, 0.0, 1.0);
        auroraColor = mix(uColor1, uColor2, gradientT);
    }

    // Final composite
    vec3 col = mix(nightSky, auroraColor, intensity * auroraHeight * 1.5);

    return col;
}
`
