export const sunBlock = `
// Sun Glow (Directional Light)
// PERF: Use multiplications instead of pow(x, 8.0)
vec3 applySun(vec3 col, vec3 dir) {
    if (uSunIntensity > 0.0) {
        // Guard against zero-length sun position
        float sunLen = length(uSunPosition);
        vec3 sunDir = sunLen > 0.0001 ? uSunPosition / sunLen : vec3(0.0, 1.0, 0.0);
        float sunDot = max(0.0, dot(dir, sunDir));
        // sharp glow: sunDot^8 = (sunDot^2)^2)^2
        float s2 = sunDot * sunDot;
        float s4 = s2 * s2;
        float sunGlow = s4 * s4;
        col += vec3(1.0, 0.9, 0.7) * sunGlow * uSunIntensity;
    }
    return col;
}
`
