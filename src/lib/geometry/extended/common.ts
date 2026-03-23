/**
 * Shared types for extended n-dimensional quantum objects.
 *
 * Raymarching quality system, color modes, preset names, palette types,
 * quantum mode enum, and OpenQuantum re-exports.
 */

export type {
  OpenQuantumConfig,
  OpenQuantumVisualizationMode,
} from '@/lib/physics/openQuantum/types'
export { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/physics/openQuantum/types'

// ============================================================================
// Raymarching Quality System
// ============================================================================

/**
 * Unified raymarching quality presets for all raymarching object types.
 *
 * For Schrödinger, `sampleCount` is kept in sync with `raymarchQuality` for
 * backward compatibility. The mesh reads from `raymarchQuality` directly.
 */
export type RaymarchQuality = 'fast' | 'balanced' | 'quality' | 'ultra'

/**
 * Volumetric raymarch sample counts for Schrödinger.
 * Controls the number of samples taken along each ray through the quantum volume.
 * Higher values produce smoother gradients but reduce framerate.
 *
 * @see SchroedingerMesh for usage with screen coverage adaptation
 */
export const RAYMARCH_QUALITY_TO_SAMPLES: Record<RaymarchQuality, number> = {
  fast: 16, // Noticeable banding, fastest rendering
  balanced: 32, // Good balance for most hardware
  quality: 48, // Smooth gradients, moderate performance cost
  ultra: 64, // Maximum smoothness, may impact framerate
}

// ============================================================================
// Schroedinger Visual Configuration Types
// ============================================================================

/**
 * Color modes for Schroedinger quantum visualization
 * - density: Color based on probability density |ψ|²
 * - phase: Color based on wavefunction phase arg(ψ)
 * - mixed: Phase for hue, density for brightness
 * - palette: Cosine gradient palette based on density/phase
 * - blackbody: Physical temperature color based on density
 */
export type SchroedingerColorMode = 'density' | 'phase' | 'mixed' | 'palette' | 'blackbody'

/**
 * Named preset identifiers for quantum state configurations
 */
export type SchroedingerPresetName =
  | 'groundState'
  | 'firstExcited'
  | 'quantumBeat'
  | 'groundExcitedBeat'
  | 'highEnergy'
  | 'excitedTriad'
  | 'nearDegenerate'
  | 'isotropic'
  | 'nodalStructure'
  | 'richSuperposition'
  | 'custom'

/**
 * Color palette presets for Schroedinger visualization.
 */
export type SchroedingerPalette =
  | 'monochrome'
  | 'complement'
  | 'triadic'
  | 'analogous'
  | 'shifted'
  | 'nebula'
  | 'sunset'
  | 'aurora'
  | 'ocean'
  | 'fire'
  | 'ice'
  | 'forest'
  | 'plasma'

/**
 * Quality presets for Schroedinger computation
 */
export type SchroedingerQualityPreset = 'draft' | 'standard' | 'high' | 'ultra'

/**
 * Rendering styles for Schroedinger visualization
 * - rayMarching: Volumetric ray marching in shader (3D+ only)
 */
export type SchroedingerRenderStyle = 'rayMarching'

/**
 * Quantum physics mode for Schroedinger visualization
 * - harmonicOscillator: Cartesian-separable harmonic oscillator (default)
 * - hydrogenND: N-dimensional hydrogen orbital (hybrid: Y_lm for first 3D + HO for extra dims)
 * - freeScalarField: Real Klein-Gordon scalar field on a 1D-3D spatial lattice with leapfrog evolution
 */
export type SchroedingerQuantumMode =
  | 'harmonicOscillator'
  | 'hydrogenND'
  | 'hydrogenNDCoupled'
  | 'freeScalarField'
  | 'tdseDynamics'
  | 'becDynamics'
  | 'diracEquation'
  | 'quantumWalk'
