/**
 * TDSE Diagnostics — CPU-side analysis of GPU readback data
 *
 * Processes the diagnostic scalars read back from the GPU norm reduction
 * (totalNorm, maxDensity) and maintains a rolling history for drift tracking
 * and reflection/transmission coefficient estimation.
 *
 * @module lib/physics/tdse/diagnostics
 */

/** Snapshot of TDSE diagnostic observables at a single time step */
export interface TdseDiagnosticsSnapshot {
  /** Simulation time at which this snapshot was taken */
  simTime: number
  /** Total norm ||psi||^2 (should be ~1.0 for unitary evolution) */
  totalNorm: number
  /** Maximum probability density max(|psi(x)|^2) */
  maxDensity: number
  /** Fractional norm drift from initial: (norm - norm0) / norm0 */
  normDrift: number
}

/**
 * Computes fractional norm drift from a history of snapshots.
 *
 * @param history - Array of diagnostic snapshots in chronological order
 * @returns Fractional drift (norm_latest - norm_first) / norm_first, or 0 if history is empty
 */
export function normDriftFromHistory(history: TdseDiagnosticsSnapshot[]): number {
  if (history.length < 2) return 0
  const norm0 = history[0]!.totalNorm
  if (norm0 === 0) return 0
  const normN = history[history.length - 1]!.totalNorm
  return (normN - norm0) / norm0
}

/**
 * Estimates reflection and transmission coefficients from spatial norm partitioning.
 *
 * For a 1D barrier problem, R + T should be approximately 1 (minus absorber losses).
 * This requires the wavefunction data itself (not just the norm scalar), so it takes
 * pre-computed left/right norm fractions as inputs.
 *
 * @param normLeft - Norm of psi in the region x < barrierCenter
 * @param normRight - Norm of psi in the region x >= barrierCenter
 * @returns Object with R (reflection) and T (transmission) coefficients
 */
export function computeReflectionTransmission(
  normLeft: number,
  normRight: number,
): { R: number; T: number } {
  const total = normLeft + normRight
  if (total === 0) return { R: 0, T: 0 }
  return {
    R: normLeft / total,
    T: normRight / total,
  }
}

/**
 * Rolling buffer of diagnostic snapshots with fixed capacity.
 * Oldest entries are evicted when capacity is exceeded.
 */
export class TdseDiagnosticsHistory {
  private buffer: TdseDiagnosticsSnapshot[] = []
  private readonly capacity: number

  constructor(capacity = 300) {
    this.capacity = capacity
  }

  /** Push a new snapshot, evicting the oldest if at capacity */
  push(snapshot: TdseDiagnosticsSnapshot): void {
    if (this.buffer.length >= this.capacity) {
      this.buffer.shift()
    }
    this.buffer.push(snapshot)
  }

  /** Get the full history array (read-only reference) */
  getHistory(): readonly TdseDiagnosticsSnapshot[] {
    return this.buffer
  }

  /** Get the latest snapshot, or null if empty */
  getLatest(): TdseDiagnosticsSnapshot | null {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1]! : null
  }

  /** Compute fractional norm drift from first to latest entry */
  getNormDrift(): number {
    return normDriftFromHistory(this.buffer as TdseDiagnosticsSnapshot[])
  }

  /** Clear all history */
  clear(): void {
    this.buffer = []
  }

  /** Number of stored snapshots */
  get length(): number {
    return this.buffer.length
  }
}
