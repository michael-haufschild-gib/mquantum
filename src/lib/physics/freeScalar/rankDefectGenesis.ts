/**
 * CPU oracle for the free-scalar rank-defect genesis initial condition.
 *
 * The GPU shader writes a globally null field pair: φ is odd along axis 0,
 * π is odd along axis 1, both under the same Gaussian envelope. The first
 * nonzero observable is the covariance orientation between field space and
 * lattice axes, which acts as the toy model's emergent clock direction.
 */

/** Parameters shared by the CPU oracle and preset-level invariant tests. */
export interface RankDefectGenesisParams {
  /** Spatial lattice dimensionality used by the seed. */
  latticeDim: number
  /** Grid size per active dimension. */
  gridSize: readonly number[]
  /** Lattice spacing per active dimension. */
  spacing: readonly number[]
  /** Center of the rank-completion envelope. */
  packetCenter: readonly number[]
  /** Gaussian width σ. */
  packetWidth: number
  /** Seed amplitude A. */
  packetAmplitude: number
  /** Scalar mass m used in the π frequency scale. */
  mass: number
}

/** Field values at one lattice sample. */
export interface RankDefectGenesisSample {
  /** Scalar field value φ. */
  phi: number
  /** Conjugate momentum value π. */
  pi: number
}

/** Low-order lattice moments used to validate the rank-defect seed. */
export interface RankDefectGenesisMoments {
  /** Sum of φ over all samples; should vanish on symmetric grids. */
  sumPhi: number
  /** Sum of π over all samples; should vanish on symmetric grids. */
  sumPi: number
  /** Quadratic seed energy Σ(φ² + π²). */
  energy: number
  /** First φ moment along axis 0. */
  phiAxis0: number
  /** First φ moment along axis 1. */
  phiAxis1: number
  /** First π moment along axis 0. */
  piAxis0: number
  /** First π moment along axis 1. */
  piAxis1: number
  /** Oriented covariance determinant defining the toy clock direction. */
  orientation: number
  /** Number of lattice samples accumulated. */
  samples: number
}

function coordFor(index: number, gridSize: number, spacing: number, center: number): number {
  const halfExtent = gridSize * spacing * 0.5
  return index * spacing - halfExtent + 0.5 * spacing - center
}

function sampleAtCoords(
  indices: readonly number[],
  params: RankDefectGenesisParams
): RankDefectGenesisSample {
  const dim = Math.max(1, Math.min(params.latticeDim, indices.length))
  const sigma = Math.max(Math.abs(params.packetWidth), 1e-6)
  let r2 = 0
  let x0 = 0
  let x1 = 0

  for (let d = 0; d < dim; d++) {
    const grid = params.gridSize[d] ?? 1
    const spacing = params.spacing[d] ?? 1
    const center = params.packetCenter[d] ?? 0
    const u = coordFor(indices[d] ?? 0, grid, spacing, center) / sigma
    r2 += u * u
    if (d === 0) x0 = u
    if (d === 1) x1 = u
  }

  const envelope = Math.exp(-0.5 * r2)
  const omega = Math.sqrt(Math.max(params.mass * params.mass + 2 / (sigma * sigma), 0))
  return {
    phi: params.packetAmplitude * x0 * envelope,
    pi: params.packetAmplitude * omega * x1 * envelope,
  }
}

/**
 * Sample the rank-defect genesis seed at one integer lattice coordinate.
 */
export function sampleRankDefectGenesis(
  indices: readonly number[],
  params: RankDefectGenesisParams
): RankDefectGenesisSample {
  return sampleAtCoords(indices, params)
}

/**
 * Compute low-order moments over the full lattice.
 */
export function computeRankDefectGenesisMoments(
  params: RankDefectGenesisParams
): RankDefectGenesisMoments {
  const dim = Math.max(1, params.latticeDim)
  const coords = Array.from({ length: dim }, () => 0)
  const extents = Array.from({ length: dim }, (_, d) =>
    Math.max(1, Math.floor(params.gridSize[d] ?? 1))
  )
  const total = extents.reduce((acc, n) => acc * n, 1)

  let sumPhi = 0
  let sumPi = 0
  let energy = 0
  let phiAxis0 = 0
  let phiAxis1 = 0
  let piAxis0 = 0
  let piAxis1 = 0

  for (let linear = 0; linear < total; linear++) {
    let rest = linear
    for (let d = dim - 1; d >= 0; d--) {
      const n = extents[d]!
      coords[d] = rest % n
      rest = Math.floor(rest / n)
    }

    const sample = sampleAtCoords(coords, params)
    const x0 = coordFor(
      coords[0] ?? 0,
      extents[0] ?? 1,
      params.spacing[0] ?? 1,
      params.packetCenter[0] ?? 0
    )
    const x1 = coordFor(
      coords[1] ?? 0,
      extents[1] ?? 1,
      params.spacing[1] ?? 1,
      params.packetCenter[1] ?? 0
    )
    sumPhi += sample.phi
    sumPi += sample.pi
    energy += sample.phi * sample.phi + sample.pi * sample.pi
    phiAxis0 += sample.phi * x0
    phiAxis1 += sample.phi * x1
    piAxis0 += sample.pi * x0
    piAxis1 += sample.pi * x1
  }

  return {
    sumPhi,
    sumPi,
    energy,
    phiAxis0,
    phiAxis1,
    piAxis0,
    piAxis1,
    orientation: phiAxis0 * piAxis1 - phiAxis1 * piAxis0,
    samples: total,
  }
}
