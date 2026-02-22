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
export type OpenQuantumVisualizationMode =
  | 'density'
  | 'purityMap'
  | 'entropyMap'
  | 'coherenceMap'

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
