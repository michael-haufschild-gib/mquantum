export const crystallineBlock = `
// Standard 3D Voronoi with 3x3x3 neighborhood for seamless cell boundaries
vec2 voronoi(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);

    float minDist = 1.0;
    float secondDist = 1.0;

    // Full 3x3x3 neighborhood required for seamless cell boundaries
    for (int k = -1; k <= 1; k++) {
        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec3 b = vec3(float(i), float(j), float(k));
                vec3 r = b - f + hash(p + b);
                float d = dot(r, r);

                if (d < minDist) {
                    secondDist = minDist;
                    minDist = d;
                } else if (d < secondDist) {
                    secondDist = d;
                }
            }
        }
    }

    return vec2(sqrt(minDist), sqrt(secondDist));
}

// Mode 4: Crystalline - Geometric Voronoi patterns with iridescent coloring
// Creates an elegant, abstract mathematical feel
vec3 getCrystalline(vec3 dir, float time) {
    vec3 p = dir * uScale * 3.0;

    // Very slow rotation of the entire pattern
    float rotAngle = time * 0.02;
    float c = cos(rotAngle);
    float s = sin(rotAngle);
    p.xz = mat2(c, -s, s, c) * p.xz;

    // Add evolution offset
    p += uEvolution * 2.0;

    // Multi-layer voronoi for depth
    vec2 v1 = voronoi(p * 1.0);
    vec2 v2 = voronoi(p * 2.0 + 100.0);

    // Edge detection - creates the crystal facet lines
    float edge1 = smoothstep(0.02, 0.08, v1.y - v1.x);
    float edge2 = smoothstep(0.02, 0.06, v2.y - v2.x);

    // Cell value for color variation
    float cellValue = v1.x * 0.6 + v2.x * 0.4;

    // Iridescent color based on viewing angle
    float iridescence = dot(dir, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    iridescence += sin(cellValue * TAU + time * 0.1) * 0.2;

    vec3 col;
    if (uUsePalette > 0.5) {
        col = cosinePalette(iridescence, uPalA, uPalB, uPalC, uPalD);
        // Add subtle facet highlights
        col = mix(col * 0.3, col, edge1 * edge2);
        // Shimmer on edges using palette highlight color
        // PERF: Use multiplication instead of pow(x, 2.0)
        vec3 shimmerColor = cosinePalette(0.9, uPalA, uPalB, uPalC, uPalD);
        col += shimmerColor * 0.15 * (1.0 - edge1) * iridescence * iridescence;
    } else {
        col = mix(uColor1, uColor2, iridescence);
        col = mix(col * 0.2, col, edge1 * edge2);
        // Shimmer using secondary color
        // PERF: Use multiplication instead of pow(x, 2.0)
        col += uColor2 * 0.15 * (1.0 - edge1) * iridescence * iridescence;
    }

    return col;
}
`
