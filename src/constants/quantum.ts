/**
 * Shared quantum layout constants used by CPU preset code and WGSL shader builders.
 *
 * Keep these values synchronized with the WGSL uniform block generated in
 * `rendering/webgpu/shaders/schroedinger/uniforms.wgsl.ts`.
 */
export const SCHROEDINGER_MAX_DIM = 11
export const SCHROEDINGER_MAX_TERMS = 8
export const SCHROEDINGER_MAX_EXTRA_DIM = 8
