/**
 * CPU-side 1D potential profile computation for the energy diagram HUD.
 *
 * Evaluates V(x) along axis 0 for each potential type, matching the
 * GPU WGSL implementation in tdsePotential.wgsl.ts.
 *
 * @module lib/physics/tdse/potentialProfile
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'

/**
 * Compute V(x) for the given potential type and config at position x along axis 0.
 */
export function evaluatePotential1D(x: number, config: TdseConfig): number {
  switch (config.potentialType) {
    case 'free':
      return 0

    case 'barrier': {
      const halfW = config.barrierWidth * 0.5
      return Math.abs(x - config.barrierCenter) < halfW ? config.barrierHeight : 0
    }

    case 'step':
      return x > config.barrierCenter ? config.stepHeight : 0

    case 'finiteWell': {
      // WGSL centers well at origin (abs(pos0)), not at barrierCenter
      const halfW = config.wellWidth * 0.5
      return Math.abs(x) < halfW ? -config.wellDepth : 0
    }

    case 'harmonicTrap':
      return 0.5 * config.mass * config.harmonicOmega * config.harmonicOmega * x * x

    case 'driven': {
      // Static component only (time-dependent part not shown)
      const halfW = config.barrierWidth * 0.5
      return Math.abs(x - config.barrierCenter) < halfW ? config.barrierHeight : 0
    }

    case 'doubleSlit': {
      const halfT = config.wallThickness * 0.5
      return Math.abs(x - config.barrierCenter) < halfT ? config.wallHeight : 0
    }

    case 'periodicLattice': {
      const phase = (Math.PI * x) / config.latticePeriod
      const cosVal = Math.cos(phase)
      return config.latticeDepth * cosVal * cosVal
    }

    case 'doubleWell': {
      const a = config.doubleWellSeparation
      const lam = config.doubleWellLambda
      const eps = config.doubleWellAsymmetry
      const x2a2 = x * x - a * a
      return lam * x2a2 * x2a2 - eps * x
    }

    default:
      return 0
  }
}

/** A sampled 1D potential profile */
export interface PotentialProfile1D {
  /** x positions */
  xs: number[]
  /** V(x) values */
  vs: number[]
  /** Minimum V value */
  vMin: number
  /** Maximum V value */
  vMax: number
}

/**
 * Collect the x-positions where the potential has discontinuities.
 * We insert explicit sample points just inside and outside each edge
 * so rectangular features render as crisp boxes in the SVG plot.
 */
function getDiscontinuityEdges(config: TdseConfig): number[] {
  const EPS = 1e-6
  const edges: number[] = []

  const addEdge = (x: number) => {
    edges.push(x - EPS, x + EPS)
  }

  switch (config.potentialType) {
    case 'barrier':
    case 'driven': {
      const halfW = config.barrierWidth * 0.5
      addEdge(config.barrierCenter - halfW)
      addEdge(config.barrierCenter + halfW)
      break
    }
    case 'step':
      addEdge(config.barrierCenter)
      break
    case 'finiteWell': {
      const halfW = config.wellWidth * 0.5
      addEdge(-halfW)
      addEdge(halfW)
      break
    }
    case 'doubleSlit': {
      const halfT = config.wallThickness * 0.5
      addEdge(config.barrierCenter - halfT)
      addEdge(config.barrierCenter + halfT)
      break
    }
    // harmonicTrap and periodicLattice are smooth — no sharp edges
    default:
      break
  }

  return edges
}

/**
 * Sample the 1D potential profile along axis 0.
 *
 * Uses uniform sampling plus explicit points at discontinuities
 * so that narrow rectangular barriers render as visible boxes.
 *
 * @param config - TDSE configuration
 * @param numSamples - Number of uniform sample points (default 200)
 * @returns Sampled profile with x and V(x) arrays plus bounds
 */
export function samplePotentialProfile(
  config: TdseConfig,
  numSamples = 200,
): PotentialProfile1D {
  const gridSize0 = config.gridSize[0] ?? 64
  const spacing0 = config.spacing[0] ?? 0.1
  const halfExtent = gridSize0 * spacing0 * 0.5

  // Collect all x sample positions: uniform grid + discontinuity edges
  const positions = new Set<number>()
  for (let i = 0; i < numSamples; i++) {
    const t = i / (numSamples - 1)
    positions.add(-halfExtent + t * 2 * halfExtent)
  }

  // Add edge points (only those within domain)
  for (const ex of getDiscontinuityEdges(config)) {
    if (ex > -halfExtent && ex < halfExtent) {
      positions.add(ex)
    }
  }

  // Sort and evaluate
  const sortedX = Array.from(positions).sort((a, b) => a - b)
  const xs: number[] = []
  const vs: number[] = []
  let vMin = Infinity
  let vMax = -Infinity

  for (const x of sortedX) {
    const v = evaluatePotential1D(x, config)
    xs.push(x)
    vs.push(v)
    if (v < vMin) vMin = v
    if (v > vMax) vMax = v
  }

  return { xs, vs, vMin, vMax }
}

/**
 * Compute kinetic energy of the initial wavepacket.
 * E_kinetic = ℏ² |k₀|² / (2m)
 */
export function computePacketKineticEnergy(config: TdseConfig): number {
  const k0 = config.packetMomentum
  let k2 = 0
  for (let i = 0; i < k0.length; i++) {
    const ki = k0[i] ?? 0
    k2 += ki * ki
  }
  return (config.hbar * config.hbar * k2) / (2 * config.mass)
}
