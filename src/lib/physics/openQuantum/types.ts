/**
 * Open Quantum Systems — Type definitions
 *
 * Density matrix representation and Lindblad master equation types
 * for modeling decoherence, relaxation, and thermal effects.
 */

// ---------------------------------------------------------------------------
// Visualization modes
// ---------------------------------------------------------------------------

/** Available density-matrix-aware color algorithms */
export type OpenQuantumVisualizationMode = 'density' | 'purityMap' | 'entropyMap' | 'coherenceMap'

const OPEN_QUANTUM_VISUALIZATION_MODES: readonly OpenQuantumVisualizationMode[] = [
  'density',
  'purityMap',
  'entropyMap',
  'coherenceMap',
]

const OPEN_QUANTUM_DEPHASING_MODELS = ['none', 'uniform'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Return true when a runtime value is a supported open-quantum visualization mode. */
export function isOpenQuantumVisualizationMode(
  value: unknown
): value is OpenQuantumVisualizationMode {
  return (
    typeof value === 'string' &&
    OPEN_QUANTUM_VISUALIZATION_MODES.includes(value as OpenQuantumVisualizationMode)
  )
}

/** Return true when a runtime value is a supported open-quantum dephasing model. */
export function isOpenQuantumDephasingModel(value: unknown): value is 'none' | 'uniform' {
  return (
    typeof value === 'string' &&
    OPEN_QUANTUM_DEPHASING_MODELS.includes(value as (typeof OPEN_QUANTUM_DEPHASING_MODELS)[number])
  )
}

function finiteNumberInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function finiteIntegerInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function finiteNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.floor(value))
}

function booleanOrFallback(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

// ---------------------------------------------------------------------------
// Density matrix
// ---------------------------------------------------------------------------

/**
 * K×K complex density matrix stored as a flat Float64Array.
 *
 * Layout: row-major, K×K×2 (re, im pairs).
 *   element (k, l) → index 2*(k*K + l) for real part, +1 for imaginary.
 */
export interface DensityMatrix {
  /** Number of basis states (1–14) */
  readonly K: number
  /** K×K×2 row-major complex elements */
  readonly elements: Float64Array
}

// ---------------------------------------------------------------------------
// Configuration persisted in store / presets
// ---------------------------------------------------------------------------

/** Persistent configuration for the open quantum system feature */
export interface OpenQuantumConfig {
  /** Master toggle */
  enabled: boolean
  /** Integration timestep (0.001–0.1) */
  dt: number
  /** Sub-steps per frame (1–10) */
  substeps: number
  /** Dephasing rate γ_φ (0–5) */
  dephasingRate: number
  /** Relaxation rate γ_down (0–5) */
  relaxationRate: number
  /** Thermal excitation rate γ_up (0–5) */
  thermalUpRate: number
  /** Toggle individual channels */
  dephasingEnabled: boolean
  relaxationEnabled: boolean
  thermalEnabled: boolean
  /**
   * Monotonic reset token for re-initializing density-matrix state from
   * the current pure coefficients without changing user parameters.
   */
  resetToken: number
  /** Active visualization mode */
  visualizationMode: OpenQuantumVisualizationMode

  // --- Hydrogen-specific (ignored for HO mode) ---

  /** Bath temperature in Kelvin (0.1–100000, default 300) */
  bathTemperature: number
  /** Overall coupling multiplier for transition rates (0.01–100, default 1.0) */
  couplingScale: number
  /** Pure dephasing model: 'none' or 'uniform' (default 'uniform') */
  dephasingModel: 'none' | 'uniform'
  /** Maximum principal quantum number for hydrogen basis (1–3, default 2) */
  hydrogenBasisMaxN: number
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export const DEFAULT_OPEN_QUANTUM_CONFIG: OpenQuantumConfig = {
  enabled: false,
  dt: 0.01,
  substeps: 4,
  dephasingRate: 0.5,
  relaxationRate: 0.0,
  thermalUpRate: 0.0,
  dephasingEnabled: true,
  relaxationEnabled: false,
  thermalEnabled: false,
  resetToken: 0,
  visualizationMode: 'density',
  bathTemperature: 300,
  couplingScale: 1.0,
  dephasingModel: 'uniform',
  hydrogenBasisMaxN: 2,
}

/** Sanitize loaded or programmatic open-quantum config before physics use. */
export function sanitizeOpenQuantumConfig(input: unknown): OpenQuantumConfig {
  const raw = isRecord(input) ? input : {}
  const defaults = DEFAULT_OPEN_QUANTUM_CONFIG

  return {
    enabled: booleanOrFallback(raw.enabled, defaults.enabled),
    dt: finiteNumberInRange(raw.dt, defaults.dt, 0.001, 0.1),
    substeps: finiteIntegerInRange(raw.substeps, defaults.substeps, 1, 10),
    dephasingRate: finiteNumberInRange(raw.dephasingRate, defaults.dephasingRate, 0, 5),
    relaxationRate: finiteNumberInRange(raw.relaxationRate, defaults.relaxationRate, 0, 5),
    thermalUpRate: finiteNumberInRange(raw.thermalUpRate, defaults.thermalUpRate, 0, 5),
    dephasingEnabled: booleanOrFallback(raw.dephasingEnabled, defaults.dephasingEnabled),
    relaxationEnabled: booleanOrFallback(raw.relaxationEnabled, defaults.relaxationEnabled),
    thermalEnabled: booleanOrFallback(raw.thermalEnabled, defaults.thermalEnabled),
    resetToken: finiteNonNegativeInteger(raw.resetToken, defaults.resetToken),
    visualizationMode: isOpenQuantumVisualizationMode(raw.visualizationMode)
      ? raw.visualizationMode
      : defaults.visualizationMode,
    bathTemperature: finiteNumberInRange(
      raw.bathTemperature,
      defaults.bathTemperature,
      0.1,
      100000
    ),
    couplingScale: finiteNumberInRange(raw.couplingScale, defaults.couplingScale, 0.01, 100),
    dephasingModel: isOpenQuantumDephasingModel(raw.dephasingModel)
      ? raw.dephasingModel
      : defaults.dephasingModel,
    hydrogenBasisMaxN: finiteIntegerInRange(
      raw.hydrogenBasisMaxN,
      defaults.hydrogenBasisMaxN,
      1,
      3
    ),
  }
}

// ---------------------------------------------------------------------------
// Lindblad channel
// ---------------------------------------------------------------------------

/**
 * Sparse representation of a rank-1 Lindblad operator L = amplitude * |row⟩⟨col|.
 *
 * For rank-1 operators the dissipator D[L](ρ) reduces to O(K²) work.
 */
export interface LindbladChannel {
  /** Row index of the ket |row⟩ */
  row: number
  /** Column index of the bra ⟨col| */
  col: number
  /** Complex amplitude (re, im) — includes √γ factor */
  amplitudeRe: number
  amplitudeIm: number
}

// ---------------------------------------------------------------------------
// Diagnostic metrics
// ---------------------------------------------------------------------------

/** Observable metrics computed from the current density matrix */
export interface OpenQuantumMetrics {
  /** Tr(ρ²) ∈ [1/K, 1] — 1 for pure states */
  purity: number
  /** 1 − Tr(ρ²) */
  linearEntropy: number
  /** −Tr(ρ ln ρ) — requires eigendecomposition */
  vonNeumannEntropy: number
  /** Σ_{k≠l} |ρ_{kl}| — total off-diagonal magnitude */
  coherenceMagnitude: number
  /** Re(ρ_{00}) — ground state population */
  groundPopulation: number
  /** Tr(ρ) — should be ≈1; deviation indicates numerical drift */
  trace: number
}
