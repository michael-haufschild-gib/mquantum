/** Minimum supported dimension for quantum visualization. */
export const MIN_DIMENSION = 2

/** Maximum supported dimension for quantum visualization. */
export const MAX_DIMENSION = 11

/**
 * Human-readable axis labels for dimension indices.
 * With MAX_DIMENSION = 11, indices 0..10 are currently used.
 */
export const AXIS_LABELS = ['x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'o'] as const

/**
 * All power-of-2 grid size options for lattice compute modes.
 * Individual modes filter this list based on their max grid per dimension.
 */
export const ALL_GRID_SIZE_OPTIONS = [
  { value: '2', label: '2' },
  { value: '4', label: '4' },
  { value: '8', label: '8' },
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
  { value: '128', label: '128' },
]
