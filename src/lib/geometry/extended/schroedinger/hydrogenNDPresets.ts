/**
 * Hydrogen ND presets for Schrödinger visualization
 *
 * Extends hydrogen orbitals to N dimensions using a hybrid approach:
 * - First 3 dimensions: Standard spherical harmonics Y_lm(θ,φ) for angular shape
 * - Extra dimensions (4+): Harmonic oscillator basis φ_n(x) for each extra dim
 * - Radial decay: Uses 3D hydrogen core radius r₃ = √(x₁² + x₂² + x₃²)
 *
 * The wavefunction formula is:
 * ψ_ND = R_nl(r₃) × Y_lm(θ,φ) × ∏_{j=4}^{D} φ_{nj}(xj)
 *
 * This gives a physically meaningful visualization of "what would a hydrogen
 * atom look like if the electron could move in D spatial dimensions".
 */

import { HydrogenNDPresetName } from '../types'

/**
 * Hydrogen ND preset configuration
 */
export interface HydrogenNDPreset {
  /** Display name (e.g., "2pz + 4D") */
  name: string
  /** Human-readable description */
  description: string
  /** Principal quantum number n (shell) for 3D hydrogen part */
  n: number
  /** Azimuthal quantum number l (shape) for 3D hydrogen part */
  l: number
  /** Magnetic quantum number m (orientation) for 3D hydrogen part */
  m: number
  /** Whether to use real spherical harmonics (px/py/pz vs complex) */
  useReal: boolean
  /** Suggested Bohr radius scale for visualization */
  bohrRadiusScale: number
  /** Target dimension for this preset (3-11) */
  dimension: number
  /** Quantum numbers for extra dimensions (dims 4-11), 8 values */
  extraDimN: number[]
  /** Frequencies for extra dimensions (dims 4-11), 8 values */
  extraDimOmega: number[]
}

/**
 * Named hydrogen ND presets
 *
 * Naming convention: {orbital}_{dimension}d
 * e.g., '2pz_4d' = 2pz orbital extended to 4 dimensions
 *
 * Extra dimension quantum numbers:
 * - n=0: Ground state (Gaussian, localized)
 * - n=1: First excited state (one node)
 * - n=2+: Higher excited states (more structure)
 */
export const HYDROGEN_ND_PRESETS: Record<HydrogenNDPresetName, HydrogenNDPreset> = {
  // ============================================
  // 4D Presets (1 extra dimension)
  // ============================================
  '2pz_4d': {
    name: '2pz + 4D Ground',
    description: '2pz dumbbell with ground state in 4th dimension',
    n: 2,
    l: 1,
    m: 0,
    useReal: true,
    bohrRadiusScale: 1.5,
    dimension: 4,
    extraDimN: [0, 0, 0, 0, 0, 0, 0, 0],
    extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  },
  '3dz2_4d': {
    name: '3dz² + 4D Ground',
    description: '3dz² donut with ground state in 4th dimension',
    n: 3,
    l: 2,
    m: 0,
    useReal: true,
    bohrRadiusScale: 2.0,
    dimension: 4,
    extraDimN: [0, 0, 0, 0, 0, 0, 0, 0],
    extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  },

  // ============================================
  // 5D Presets (2 extra dimensions)
  // ============================================
  '2pz_5d': {
    name: '2pz + 5D Mixed',
    description: '2pz with n=1 excited state in dim 4, ground in dim 5',
    n: 2,
    l: 1,
    m: 0,
    useReal: true,
    bohrRadiusScale: 1.5,
    dimension: 5,
    extraDimN: [1, 0, 0, 0, 0, 0, 0, 0],
    extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  },
  '3dz2_5d': {
    name: '3dz² + 5D',
    description: '3dz² donut with ground states in extra dimensions',
    n: 3,
    l: 2,
    m: 0,
    useReal: true,
    bohrRadiusScale: 2.0,
    dimension: 5,
    extraDimN: [0, 0, 0, 0, 0, 0, 0, 0],
    extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  },

  // ============================================
  // 6D Presets (3 extra dimensions)
  // ============================================
  '2pz_6d': {
    name: '2pz + 6D',
    description: '2pz with ground states in all extra dimensions',
    n: 2,
    l: 1,
    m: 0,
    useReal: true,
    bohrRadiusScale: 1.5,
    dimension: 6,
    extraDimN: [0, 0, 0, 0, 0, 0, 0, 0],
    extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  },
  '3dz2_6d': {
    name: '3dz² + 6D',
    description: '3dz² donut extended to 6 dimensions',
    n: 3,
    l: 2,
    m: 0,
    useReal: true,
    bohrRadiusScale: 2.0,
    dimension: 6,
    extraDimN: [0, 0, 0, 0, 0, 0, 0, 0],
    extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  },
  '4fz3_6d': {
    name: '4fz³ + 6D',
    description: '4f orbital with triple dumbbell extended to 6D',
    n: 4,
    l: 3,
    m: 0,
    useReal: true,
    bohrRadiusScale: 2.5,
    dimension: 6,
    extraDimN: [0, 0, 0, 0, 0, 0, 0, 0],
    extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  },

  // ============================================
  // Custom - User-defined
  // ============================================
  custom: {
    name: 'Custom',
    description: 'User-defined quantum numbers',
    n: 2,
    l: 1,
    m: 0,
    useReal: true,
    bohrRadiusScale: 1.0,
    dimension: 4,
    extraDimN: [0, 0, 0, 0, 0, 0, 0, 0],
    extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  },
}

/**
 * Get a hydrogen ND preset by name
 * @param name - The preset name
 * @returns The preset configuration
 */
export function getHydrogenNDPreset(name: HydrogenNDPresetName): HydrogenNDPreset {
  return HYDROGEN_ND_PRESETS[name] ?? HYDROGEN_ND_PRESETS['2pz_4d']
}

/**
 * Get presets grouped by dimension
 * @returns Record of dimension to array of presets
 */
export function getHydrogenNDPresetsGroupedByDimension(): Record<number, HydrogenNDPreset[]> {
  const groups: Record<number, HydrogenNDPreset[]> = {}

  for (const preset of Object.values(HYDROGEN_ND_PRESETS)) {
    if (preset.name === 'Custom') continue
    const dim = preset.dimension
    if (!groups[dim]) {
      groups[dim] = []
    }
    groups[dim].push(preset)
  }

  return groups
}

/**
 * Get presets with keys grouped by dimension, suitable for UI dropdowns
 * Returns Record<dimension, [presetKey, preset][]>
 * @returns Record of dimension to array of [key, preset] tuples
 */
export function getHydrogenNDPresetsWithKeysByDimension(): Record<
  number,
  [HydrogenNDPresetName, HydrogenNDPreset][]
> {
  const groups: Record<number, [HydrogenNDPresetName, HydrogenNDPreset][]> = {}

  for (const [key, preset] of Object.entries(HYDROGEN_ND_PRESETS) as [
    HydrogenNDPresetName,
    HydrogenNDPreset,
  ][]) {
    if (preset.name === 'Custom') continue
    const dim = preset.dimension
    if (!groups[dim]) {
      groups[dim] = []
    }
    groups[dim].push([key, preset])
  }

  return groups
}

/**
 * Get presets available for a specific dimension
 * Returns presets that match the dimension or have lower dimension (can be used with more dims)
 * @param dimension - The dimension to filter for
 * @returns Array of presets available for the dimension
 */
export function getPresetsForDimension(dimension: number): HydrogenNDPreset[] {
  return Object.values(HYDROGEN_ND_PRESETS).filter(
    (preset) => preset.name !== 'Custom' && preset.dimension <= dimension
  )
}

/**
 * Generate a label for hydrogen ND configuration
 * @param n - Principal quantum number
 * @param l - Angular momentum quantum number
 * @param m - Magnetic quantum number
 * @param dimension - Number of dimensions
 * @param extraDimN - Extra dimension quantum numbers
 * @returns Human-readable label string
 */
export function hydrogenNDToLabel(
  n: number,
  l: number,
  m: number,
  dimension: number,
  extraDimN: number[]
): string {
  // Get base orbital name
  const letters = ['s', 'p', 'd', 'f', 'g', 'h', 'i']
  const letter = letters[l] ?? `l=${l}`

  let baseName: string
  if (l === 0) {
    baseName = `${n}${letter}`
  } else if (l === 1) {
    if (m === 0) baseName = `${n}pz`
    else if (m === 1) baseName = `${n}px`
    else baseName = `${n}py`
  } else if (l === 2) {
    if (m === 0) baseName = `${n}dz²`
    else baseName = `${n}d`
  } else {
    baseName = `${n}${letter}`
  }

  // Add dimension info
  const extraCount = Math.max(0, dimension - 3)
  if (extraCount === 0) {
    return baseName
  }

  // Check if all extra dims are ground state
  const usedExtra = extraDimN.slice(0, extraCount)
  const allGround = usedExtra.every((n) => n === 0)

  if (allGround) {
    return `${baseName} + ${dimension}D`
  } else {
    const extraStr = usedExtra.map((n, i) => `n${i + 4}=${n}`).join(', ')
    return `${baseName} + ${dimension}D (${extraStr})`
  }
}
