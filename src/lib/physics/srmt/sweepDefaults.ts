import type { SrmtSweepKind } from './sweepTypes'

/** Default point count and range for one SRMT sweep kind. */
export interface SrmtSweepDefaultRange {
  points: number
  sweepMin: number
  sweepMax: number
}

/** Return the canonical UI/URL default range for an SRMT sweep kind. */
export function srmtSweepDefaultRange(
  kind: SrmtSweepKind,
  phiExtent: number
): SrmtSweepDefaultRange {
  switch (kind) {
    case 'cut':
      return { points: 17, sweepMin: 0.1, sweepMax: 0.9 }
    case 'mass':
      return { points: 9, sweepMin: 0.1, sweepMax: 1.5 }
    case 'lambda':
      // Straddles the AdS/dS boundary so one sweep exposes the regime change.
      return { points: 9, sweepMin: -0.5, sweepMax: 0.5 }
    case 'bc':
      return { points: 3, sweepMin: 0, sweepMax: 2 }
    case 'phiRef':
      // phiRef changes per-point landmarks, not the q-compute itself.
      return { points: 11, sweepMin: 0.05, sweepMax: Math.max(0.05, phiExtent - 0.05) }
    case 'rankCap':
      // Driver rounds and dedups integer rank caps across this cadence.
      return { points: 9, sweepMin: 8, sweepMax: 128 }
    case 'phiExtent':
      return { points: 5, sweepMin: 1.0, sweepMax: 3.0 }
    case 'gridNa':
      // a-axis convergence sweep; spans enough range to expose second-order behavior.
      return { points: 3, sweepMin: 128, sweepMax: 384 }
    case 'gridNphi':
      // phi-axis convergence sweep; conservative upper bound keeps CFL pressure bounded.
      return { points: 3, sweepMin: 32, sweepMax: 64 }
    case 'gridNphiCoupled':
      // Coupled phi/a grid sweep; caller co-scales gridNa to preserve CFL stability.
      return { points: 5, sweepMin: 32, sweepMax: 64 }
    default: {
      const exhaustive: never = kind
      throw new Error(`Unhandled SRMT sweep kind: ${exhaustive}`)
    }
  }
}
