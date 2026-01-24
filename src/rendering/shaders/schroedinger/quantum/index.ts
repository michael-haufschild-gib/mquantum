/**
 * Quantum math shader modules for Schrödinger wavefunction visualization
 *
 * Module order matters for GLSL dependencies:
 * 1. complex - basic complex number operations
 * 2. hermite - Hermite polynomials (no deps)
 * 3. ho1d - 1D harmonic oscillator (depends on hermite, uniforms)
 * 4. psi - wavefunction evaluation (depends on complex, ho1d)
 * 5. density - density field (depends on psi)
 */

export { complexMathBlock } from './complex.glsl'
export { hermiteBlock } from './hermite.glsl'
export { ho1dBlock } from './ho1d.glsl'
export { psiBlock } from './psi.glsl'
export { densityBlock } from './density.glsl'
