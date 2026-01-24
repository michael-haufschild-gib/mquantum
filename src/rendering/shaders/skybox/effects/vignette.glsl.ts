export const vignetteBlock = `
// Vignette
vec3 applyVignette(vec3 col, vec2 uv) {
    if (uVignette > 0.0) {
        float dist = distance(uv, vec2(0.5));
        float vig = smoothstep(0.4, 0.9, dist);
        col *= 1.0 - vig * uVignette;
    }
    return col;
}
`
