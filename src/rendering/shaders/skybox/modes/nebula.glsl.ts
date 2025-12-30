export const nebulaBlock = `
// Mode 2: Nebula (Volumetric Clouds)
// Optimized nebula with reduced fbm calls for better performance
vec3 getNebula(vec3 dir, float time) {
    vec3 p = dir * uScale * 2.0;

    // Slow drift animation
    p.x -= time * 0.05;
    p.z += time * 0.03;

    // Evolution offset
    p += uEvolution * 3.0;

    // --- Single combined fbm for main structure ---
    // Reduced from 4 separate fbm calls to 2
    vec3 mainCoord = p * 0.7;
    mainCoord += vec3(time * 0.05, 0.0, time * 0.03);

    // Main density with 2 octaves (was 3)
    float mainDensity = fbm(mainCoord, 2);
    mainDensity = smoothstep(0.25, 0.75, mainDensity);

    // --- Detail layer with turbulence ---
    vec3 detailCoord = p * 1.5 + mainDensity * uTurbulence * 0.5;
    float detailDensity = fbm(detailCoord, 2); // 2 octaves (was 3)
    detailDensity = smoothstep(0.3, 0.7, detailDensity);

    // --- Bright knots (cheap noise instead of fbm) ---
    float knotNoise = noise(p * 3.0 + time * 0.05);
    float knots = pow(smoothstep(0.6, 0.9, knotNoise), 3.0) * uComplexity;

    // Combined density
    float totalDensity = mainDensity * 0.6 + detailDensity * 0.25 + knots * 0.25;

    // Simple dust absorption from main density variation
    float absorption = (1.0 - mainDensity) * detailDensity * 0.3;

    // Coloring
    vec3 col;
    if (uUsePalette > 0.5) {
        vec3 deepColor = cosinePalette(0.1, uPalA, uPalB, uPalC, uPalD) * 0.1;
        vec3 emissionColor = cosinePalette(mainDensity * 0.6 + 0.2, uPalA, uPalB, uPalC, uPalD);
        vec3 knotColor = cosinePalette(0.85, uPalA, uPalB, uPalC, uPalD) * 1.5;

        col = deepColor;
        col = mix(col, emissionColor, mainDensity * 0.8);
        col = mix(col, deepColor, absorption);
        col += knotColor * knots;
        col *= smoothstep(0.0, 0.4, totalDensity) * 0.7 + 0.3;
    } else {
        vec3 deepColor = uColor1 * 0.1;
        vec3 emissionColor = mix(uColor1, uColor2, mainDensity);
        vec3 knotColor = uColor2 * 1.5;

        col = deepColor;
        col = mix(col, emissionColor, mainDensity * 0.8);
        col = mix(col, deepColor, absorption);
        col += knotColor * knots;
        col *= smoothstep(0.0, 0.4, totalDensity) * 0.7 + 0.3;
    }

    return col;
}
`
