/**
 * Color algorithm name mappings for shader emission.
 *
 * Extracted from emission.wgsl.ts to stay under the 600-line limit.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/emissionConstants
 */

/** Human-readable names for color algorithm indices (used for feature tags). */
export const COLOR_ALG_NAMES: Record<number, string> = {
  0: 'LCH/Oklab',
  1: 'Multi-source',
  2: 'Radial',
  3: 'Phase',
  4: 'Mixed',
  5: 'Blackbody',
  6: 'Phase Cyclic Uniform',
  7: 'Phase Diverging',
  8: 'Domain Coloring Psi',
  9: 'Diverging',
  10: 'Relative Phase',
  11: 'Radial Distance',
  12: 'Hamiltonian Decomposition',
  13: 'Mode Character',
  14: 'Energy Flux',
  15: 'k-Space Occupation',
  16: 'Purity Map',
  17: 'Entropy Map',
  18: 'Coherence Map',
  19: 'Viridis',
  20: 'Inferno',
  21: 'Density Contours',
  22: 'Phase-Density',
  23: 'Particle/Antiparticle',
  24: 'Pauli Spin Density',
  25: 'Pauli Spin Expectation',
  26: 'Pauli Coherence',
  27: 'Quantum Potential Q(x) (Bohmian)',
  28: 'Vortex Density (topological charge)',
  // WDW ⊗ ζ suite — 4 shared measure-based algorithms (number-theoretic)
  29: 'ζ-Zero Count N(t)',
  30: 'Chebyshev ψ(x)',
  31: 'Mertens M(x)',
  32: 'Explicit-Formula Wave',
  // WDW ⊗ ζ suite — 10 mode-specific algorithms
  33: 'ξ Phase Carpet',
  34: 'Möbius Triad (μ)',
  35: 'Dilation xp Flow',
  36: 'WKB Action Fringes',
  37: 'Bose Occupation Heat',
  38: 'Purity Shells q^{w/2}',
  39: 'Causal Redshift',
  40: 'Geodesic Length Spectrum',
  41: 'p-adic Valuation',
  42: 'Li Positivity Sign',
  43: 'Cyclotomic φ(n)',
}

/** Numeric shader color algorithm indices, sorted for validation walkers. */
export const COLOR_ALGORITHM_INDICES = Object.freeze(
  Object.keys(COLOR_ALG_NAMES)
    .map((key) => Number.parseInt(key, 10))
    .sort((a, b) => a - b)
) as readonly number[]
