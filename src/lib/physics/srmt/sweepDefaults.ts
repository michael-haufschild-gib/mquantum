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
      return { points: 9, sweepMin: -0.5, sweepMax: 0.5 }
    case 'bc':
      return { points: 3, sweepMin: 0, sweepMax: 2 }
    case 'phiRef':
      return { points: 11, sweepMin: 0.05, sweepMax: Math.max(0.05, phiExtent - 0.05) }
    case 'rankCap':
      return { points: 9, sweepMin: 8, sweepMax: 128 }
    case 'phiExtent':
      return { points: 5, sweepMin: 1.0, sweepMax: 3.0 }
    case 'gridNa':
      return { points: 3, sweepMin: 128, sweepMax: 384 }
    case 'gridNphi':
      return { points: 3, sweepMin: 32, sweepMax: 64 }
    case 'gridNphiCoupled':
      return { points: 5, sweepMin: 32, sweepMax: 64 }
  }
}
