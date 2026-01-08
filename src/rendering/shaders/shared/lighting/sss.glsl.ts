export const sssBlock = `
// ============================================
// Subsurface Scattering Approximation
// ============================================

// PERF: Fast hash for screen-space noise (SSS jitter)
// Uses integer operations instead of expensive sin()
float sssHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Fast "Wrap Lighting" SSS Approximation for SDF/Volumetric objects
// approximating translucency when backlit
// jitter: 0.0-1.0 adds screen-space noise to distortion for softer results
// fragCoord: gl_FragCoord.xy for noise seed
vec3 computeSSS(vec3 lightDir, vec3 viewDir, vec3 normal, float distortion, float power, float thickness, float jitter, vec2 fragCoord) {
    // Apply jitter: perturb distortion with screen-space noise
    float noise = sssHash(fragCoord * 0.1) * 2.0 - 1.0; // -1 to 1
    float jitteredDistortion = distortion * (1.0 + noise * jitter);

    vec3 halfSum = lightDir + normal * jitteredDistortion;
    float halfLen = length(halfSum);
    // Guard against zero-length vector (rare edge case)
    vec3 halfVec = halfLen > 0.0001 ? halfSum / halfLen : vec3(0.0, 1.0, 0.0);
    // Guard pow() with clamped base and ensure power > 0
    float dotVal = clamp(dot(viewDir, -halfVec), 0.0, 1.0);
    float safePower = max(power, 0.001);
    float trans = pow(max(dotVal, 0.0001), safePower);
    // Attenuate by thickness (simulated by density or depth)
    return vec3(trans) * exp(-thickness);
}
`;
