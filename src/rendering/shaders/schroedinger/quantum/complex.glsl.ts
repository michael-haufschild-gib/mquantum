/**
 * Complex number utilities for Schrödinger wavefunction computation
 * Used for representing ψ(x,t) as complex (re, im) pairs
 */
export const complexMathBlock = `
// ============================================
// Complex Number Operations
// ============================================

// Complex multiplication: (a + bi)(c + di) = (ac - bd) + (ad + bc)i
vec2 cmul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Complex conjugate: (a + bi)* = a - bi
vec2 cconj(vec2 z) {
    return vec2(z.x, -z.y);
}

// Complex modulus squared: |z|² = a² + b²
float cmod2(vec2 z) {
    return dot(z, z);
}

// Complex exponential of imaginary: e^(iθ) = cos(θ) + i·sin(θ)
vec2 cexp_i(float theta) {
    return vec2(cos(theta), sin(theta));
}

// Complex exponential: e^(a + bi) = e^a (cos(b) + i·sin(b))
vec2 cexp(vec2 z) {
    float ea = exp(z.x);
    return vec2(ea * cos(z.y), ea * sin(z.y));
}

// Scale complex by real: c·z
vec2 cscale(float c, vec2 z) {
    return c * z;
}

// Complex addition (just vec2 add, but named for clarity)
vec2 cadd(vec2 a, vec2 b) {
    return a + b;
}
`
