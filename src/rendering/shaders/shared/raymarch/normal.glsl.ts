export const normalBlock = `
// High-quality normal calculation using central differences (6 SDF evaluations)
// Most accurate method, especially at sharp features
// Use for ultra-high quality static renders only
vec3 GetNormal(vec3 p) {
    float h = 0.0005;
    vec3 n = vec3(
        GetDist(p + vec3(h, 0, 0)) - GetDist(p - vec3(h, 0, 0)),
        GetDist(p + vec3(0, h, 0)) - GetDist(p - vec3(0, h, 0)),
        GetDist(p + vec3(0, 0, h)) - GetDist(p - vec3(0, 0, h))
    );
    // OPT-H9: inversesqrt normalization (saves sqrt + divide)
    float lenSq = dot(n, n);
    return lenSq > 1e-8 ? n * inversesqrt(lenSq) : vec3(0.0, 1.0, 0.0);
}

// PERF (OPT-FR-1): Tetrahedron normal calculation (4 SDF evaluations)
// Quality comparable to central differences but 33% fewer samples
// Uses symmetric tetrahedron vertices for balanced gradient estimation
// Reference: Inigo Quilez - https://iquilezles.org/articles/normalsSDF/
vec3 GetNormalTetra(vec3 p) {
    // Tetrahedron vertices (pre-normalized, sum to zero for symmetric sampling)
    const vec3 k0 = vec3( 1.0, -1.0, -1.0);
    const vec3 k1 = vec3(-1.0, -1.0,  1.0);
    const vec3 k2 = vec3(-1.0,  1.0, -1.0);
    const vec3 k3 = vec3( 1.0,  1.0,  1.0);

    float h = 0.0005;

    // Weighted sum of tetrahedron samples
    vec3 n = k0 * GetDist(p + h * k0) +
             k1 * GetDist(p + h * k1) +
             k2 * GetDist(p + h * k2) +
             k3 * GetDist(p + h * k3);

    // OPT-H9: inversesqrt normalization (saves sqrt + divide)
    float lenSq = dot(n, n);
    return lenSq > 1e-8 ? n * inversesqrt(lenSq) : vec3(0.0, 1.0, 0.0);
}

// Fast normal calculation using forward differences (4 SDF evaluations)
// ~33% faster than central differences but lower quality at sharp edges
// Kept for backwards compatibility; prefer GetNormalTetra for new code
vec3 GetNormalFast(vec3 p) {
    float h = 0.001;
    float d0 = GetDist(p);
    vec3 n = vec3(
        GetDist(p + vec3(h, 0, 0)) - d0,
        GetDist(p + vec3(0, h, 0)) - d0,
        GetDist(p + vec3(0, 0, h)) - d0
    );
    // OPT-H9: inversesqrt normalization (saves sqrt + divide)
    float lenSq = dot(n, n);
    return lenSq > 1e-8 ? n * inversesqrt(lenSq) : vec3(0.0, 1.0, 0.0);
}
`;
