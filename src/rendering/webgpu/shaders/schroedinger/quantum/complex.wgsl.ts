/**
 * WGSL Complex number utilities for Schrödinger wavefunction computation
 *
 * Used for representing ψ(x,t) as complex (re, im) pairs.
 * Port of GLSL quantum/complex.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/schroedinger/quantum/complex.wgsl
 */

export const complexMathBlock = /* wgsl */ `
// ============================================
// Complex Number Operations
// ============================================

// Complex multiplication: (a + bi)(c + di) = (ac - bd) + (ad + bc)i
fn cmul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// Complex conjugate: (a + bi)* = a - bi
fn cconj(z: vec2f) -> vec2f {
  return vec2f(z.x, -z.y);
}

// Complex modulus squared: |z|² = a² + b²
fn cmod2(z: vec2f) -> f32 {
  return dot(z, z);
}

// Complex exponential of imaginary: e^(iθ) = cos(θ) + i·sin(θ)
fn cexp_i(theta: f32) -> vec2f {
  return vec2f(cos(theta), sin(theta));
}

// Complex exponential: e^(a + bi) = e^a (cos(b) + i·sin(b))
fn cexp(z: vec2f) -> vec2f {
  let ea = exp(z.x);
  return vec2f(ea * cos(z.y), ea * sin(z.y));
}

// Scale complex by real: c·z
fn cscale(c: f32, z: vec2f) -> vec2f {
  return c * z;
}

// Complex addition (just vec2f add, but named for clarity)
fn cadd(a: vec2f, b: vec2f) -> vec2f {
  return a + b;
}
`
