/**
 * WGSL Shader Types
 *
 * Type definitions shared across WGSL shader modules.
 *
 * @module rendering/webgpu/shaders/types
 */

/**
 * Color algorithm for compile-time optimization
 * When specified, only the required color module(s) are included
 */
export type ColorAlgorithm =
  | 0 // LCH/Oklab perceptual
  | 1 // Multi-source (Cosine)
  | 2 // Radial (Cosine)
  | 3 // Phase/Angular (HSL, wavefunction phase)
  | 4 // Mixed Phase+Distance (HSL, default)
  | 5 // Blackbody (analytic, no user color params)
  | 6 // Perceptually uniform cyclic phase map (Oklab)
  | 7 // Signed diverging phase map (HSL)
  | 8 // Domain coloring for wavefunctions (HSL + log-modulus contours)
  | 9 // Zero-centered diverging map for Re/Im(psi)
  | 10 // Relative phase to spatial reference arg(conj(psi_ref)*psi)
  | 11 // Radial distance spectral
  | 12 // Hamiltonian decomposition (K/G/V fractions)
  | 13 // Mode character map (wave-like vs mass-dominated)
  | 14 // Energy flux map (S direction + magnitude)
  | 15 // k-Space occupation map (FFT-based)
  | 16 // Purity map (global purity → saturation)
  | 17 // Entropy map (global von Neumann entropy → diverging scale)
  | 18 // Coherence map (spatial coherence fraction → color)
  | 19 // Viridis (perceptually uniform scientific colormap)
  | 20 // Inferno (high-contrast scientific colormap)
  | 21 // Density contours (isodensity lines on viridis ramp)
  | 22 // Phase-density composite (hue=phase, brightness=density)
  | 23 // Particle/antiparticle split (Dirac dual-channel)
  | 24 // Pauli spin density (cyan=spin-up, magenta=spin-down)
  | 25 // Pauli spin expectation (diverging blue/red for ⟨σ_z⟩)
  | 26 // Pauli coherence (off-diagonal spinor coherence)

