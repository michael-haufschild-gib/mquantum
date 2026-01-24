export const horizonBlock = `
// Mode 5: Horizon Gradient - Clean Studio Environment
// Professional presentation backdrop with smooth multi-band gradient
vec3 getHorizonGradient(vec3 dir, float time) {
    // Vertical position: -1 (bottom) to 1 (top)
    float y = dir.y;

    // Gradient contrast affects zone sharpness
    float contrastMod = 0.5 + uHorizonGradientContrast * 1.0; // 0.5-1.5

    // Create distinct gradient zones for studio look
    // Zone 1: Floor reflection zone (bottom third)
    // Zone 2: Horizon band (middle - the "infinity curve")
    // Zone 3: Upper backdrop (top half)

    float floorZone = smoothstep(-1.0, -0.2 * contrastMod, y);
    float horizonZone = 1.0 - abs(y) * (1.0 + contrastMod * 0.5);
    horizonZone = pow(max(0.0, horizonZone), 1.5 + contrastMod);
    float upperZone = smoothstep(-0.1 * contrastMod, 0.8 * contrastMod, y);

    // Subtle seamless gradient curve (no harsh transitions)
    float gradientPos = y * 0.5 + 0.5;
    gradientPos = pow(clamp(gradientPos, 0.0, 1.0), 0.8 + uComplexity * 0.4);

    // Very subtle horizontal sweep for depth (like studio lighting)
    float sweep = sin(dir.x * PI * 0.5) * 0.05;
    gradientPos += sweep * (1.0 - abs(y));

    // Animation Layer 1: Subtle slow breathing animation
    float breathe = sin(time * 0.2) * 0.02;
    gradientPos += breathe * horizonZone;

    // Animation Layer 2: Color temperature pulse (warm/cool shift)
    float tempPulse = sin(time * 0.12) * 0.08 + sin(time * 0.07) * 0.04;

    // Animation Layer 3: Light sweep across horizon
    float sweepAngle = mod(time * 0.15, TAU);
    float lightSweep = sin(atan(dir.x, dir.z) - sweepAngle);
    lightSweep = pow(max(0.0, lightSweep), 8.0) * 0.15 * horizonZone;

    // Animation Layer 4: Ambient brightness variation
    float ambientPulse = sin(time * 0.1 + dir.x * 0.5) * 0.03 + 1.0;

    vec3 col;
    if (uUsePalette > 0.5) {
        // 4-point gradient for smooth studio look
        // Apply temperature pulse to palette sampling
        vec3 floorColor = cosinePalette(0.1 + tempPulse * 0.1, uPalA, uPalB, uPalC, uPalD) * 0.6;
        vec3 horizonColor = cosinePalette(0.4 + tempPulse * 0.05, uPalA, uPalB, uPalC, uPalD);
        vec3 midColor = cosinePalette(0.6, uPalA, uPalB, uPalC, uPalD);
        vec3 topColor = cosinePalette(0.85 - tempPulse * 0.05, uPalA, uPalB, uPalC, uPalD);

        // Smooth 4-zone blend
        col = mix(floorColor, horizonColor, floorZone);
        col = mix(col, midColor, smoothstep(-0.1, 0.3, y));
        col = mix(col, topColor, upperZone);

        // Add subtle horizon glow (the "infinity" effect)
        col += horizonColor * horizonZone * 0.2 * uScale;

        // Add light sweep highlight
        vec3 sweepColor = cosinePalette(0.95, uPalA, uPalB, uPalC, uPalD);
        col += sweepColor * lightSweep;
    } else {
        // Two-color mode: color1 = floor/dark, color2 = top/light
        // Apply temperature modulation via interpolation shift
        float tempShift = tempPulse * 0.1;
        vec3 floorColor = uColor1 * (0.5 + tempShift);
        vec3 horizonColor = mix(uColor1, uColor2, 0.5 + tempShift);
        vec3 topColor = uColor2 * (1.0 - tempShift * 0.5);

        col = mix(floorColor, horizonColor, floorZone);
        col = mix(col, topColor, upperZone);
        col += horizonColor * horizonZone * 0.15 * uScale;

        // Add light sweep highlight
        col += mix(uColor1, uColor2, 0.8) * lightSweep;
    }

    // Apply ambient pulse
    col *= ambientPulse;

    // Premium film-like micro-texture (very subtle)
    // Skip when complexity is near zero
    if (uComplexity > 0.01) {
        float microTexture = noise(dir * 50.0) * 0.015 * uComplexity;
        col += microTexture;
    }

    // Soft radial falloff from center (spotlight feel)
    // Controlled by uHorizonSpotlightFocus
    float spotlightStrength = 0.05 + uHorizonSpotlightFocus * 0.25; // 0.05-0.30
    float spotlight = 1.0 - length(vec2(dir.x, dir.z)) * spotlightStrength;
    float spotlightMin = 0.7 + (1.0 - uHorizonSpotlightFocus) * 0.25; // 0.7-0.95
    col *= max(spotlightMin, spotlight);

    return col;
}
`
