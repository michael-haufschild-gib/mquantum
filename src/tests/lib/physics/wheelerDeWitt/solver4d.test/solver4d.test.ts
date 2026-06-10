import { describe, expect, it } from 'vitest'

import { deWittBoundary } from '@/lib/physics/wheelerDeWitt/boundaryConditions'
import { wdwPotential } from '@/lib/physics/wheelerDeWitt/constants'
import { packWdwDensityGrid } from '@/lib/physics/wheelerDeWitt/densityGrid'
import {
  allocImplicitBulkScratch3D,
  solveADILaplacianNeumann3D,
} from '@/lib/physics/wheelerDeWitt/implicitBulk'
import type {
  WheelerDeWittSolverOutput,
  WheelerDeWittSolverOutput4D,
} from '@/lib/physics/wheelerDeWitt/solver'
import { phiLaplacianAt3D, solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'

function expectFiniteArray(values: ArrayLike<number>): void {
  for (let i = 0; i < values.length; i++) {
    expect(Number.isFinite(values[i]!)).toBe(true)
  }
}

describe('Wheeler-DeWitt 4D physics helpers', () => {
  it('adds φ3 with base mass while preserving the 3D potential formula', () => {
    const m = 0.4
    const alpha = 1.7
    const lambda = -0.2
    expect(wdwPotential(1, 2, m, lambda, alpha)).toBeCloseTo(
      0.5 * m * m * 1 * 1 + 0.5 * (m * alpha) ** 2 * 2 * 2 + lambda,
      12
    )
    expect(wdwPotential(1, 2, m, lambda, alpha, 3)).toBeCloseTo(
      0.5 * m * m * (1 * 1 + 3 * 3) + 0.5 * (m * alpha) ** 2 * 2 * 2 + lambda,
      12
    )
  })

  it('builds 4D DeWitt boundary buffers with Nphi³ cells and a φ3 Gaussian', () => {
    const boundary = deWittBoundary({
      Nphi: 3,
      phiExtent: 1,
      aMin: 0.1,
      mass: 0.3,
      lambda: 0,
      minisuperspaceDimension: 4,
    })
    expect(boundary.chi.length).toBe(2 * 3 ** 3)
    expect(boundary.chiDeriv.length).toBe(2 * 3 ** 3)

    const centerIdx = (1 * 3 + 1) * 3 + 1
    const phi3EdgeIdx = (1 * 3 + 1) * 3 + 0
    expect(boundary.chi[2 * centerIdx]).toBeCloseTo(0.1, 7)
    expect(boundary.chi[2 * phi3EdgeIdx]).toBeCloseTo(0.1 * Math.exp(-0.5), 7)
    expect(boundary.chiDeriv[2 * phi3EdgeIdx]).toBeCloseTo(Math.exp(-0.5), 7)
  })

  it('3-axis Neumann Laplacian annihilates constant complex fields on faces and corners', () => {
    const Nphi = 4
    const slab = new Float32Array(2 * Nphi ** 3)
    for (let idx = 0; idx < Nphi ** 3; idx++) {
      slab[2 * idx] = 2
      slab[2 * idx + 1] = -1
    }
    for (const [i1, i2, i3] of [
      [0, 0, 0],
      [0, 2, 3],
      [2, 2, 2],
      [3, 3, 3],
    ] as const) {
      const lap = phiLaplacianAt3D(slab, 0, i1, i2, i3, Nphi, 1)
      expect(lap.re).toBeCloseTo(0, 12)
      expect(lap.im).toBeCloseTo(0, 12)
    }
  })

  it('3-axis ADI preserves constant complex fields with finite output', () => {
    const Nphi = 4
    const rhs = new Float32Array(2 * Nphi ** 3)
    const out = new Float32Array(2 * Nphi ** 3)
    for (let idx = 0; idx < Nphi ** 3; idx++) {
      rhs[2 * idx] = 3
      rhs[2 * idx + 1] = -2
    }
    solveADILaplacianNeumann3D(rhs, out, Nphi, 0.25, allocImplicitBulkScratch3D(Nphi))
    expectFiniteArray(out)
    for (let idx = 0; idx < Nphi ** 3; idx++) {
      expect(out[2 * idx]).toBeCloseTo(3, 6)
      expect(out[2 * idx + 1]).toBeCloseTo(-2, 6)
    }
  })
})

describe('Wheeler-DeWitt 4D solver and density packing', () => {
  it('returns a finite [Na,Nphi,Nphi,Nphi] solve with masks and density', () => {
    const output = solveWheelerDeWitt({
      minisuperspaceDimension: 4,
      boundaryCondition: 'deWitt',
      inflatonMass: 0.15,
      cosmologicalConstant: 0,
      aMin: 0.1,
      aMax: 0.35,
      gridNa: 8,
      gridNphi: 4,
      phiExtent: 1.25,
    })
    expect(output.gridSize).toEqual([8, 4, 4, 4])
    expect(output.chi.length).toBe(2 * 8 * 4 ** 3)
    expect(output.lorentzianMask.length).toBe(8 * 4 ** 3)
    expect(output.bandKind.length).toBe(8 * 4 ** 3)
    expect(output.maxDensity).toBeGreaterThan(0)
    expectFiniteArray(output.chi)
  })

  it('packs different φ3 slices differently while preserving 3D packer behavior', () => {
    const output4d = makeSynthetic4dOutput()
    const low = packWdwDensityGrid(output4d, null, undefined, 4, 100, undefined, {
      phi3SliceNormalized: 0,
    })
    const high = packWdwDensityGrid(output4d, null, undefined, 4, 100, undefined, {
      phi3SliceNormalized: 1,
    })
    expect(Array.from(low.density)).not.toEqual(Array.from(high.density))

    const output3d = makeSynthetic3dOutput()
    const a = packWdwDensityGrid(output3d, null, undefined, 4, 100, undefined, {
      phi3SliceNormalized: 0,
    })
    const b = packWdwDensityGrid(output3d, null, undefined, 4, 100, undefined, {
      phi3SliceNormalized: 1,
    })
    expect(Array.from(a.density)).toEqual(Array.from(b.density))
  })

  it('falls back to the center φ3 slice for non-finite 4D packer input', () => {
    const output = makeSynthetic4dOutput()
    const baseline = packWdwDensityGrid(output, null, undefined, 4, 100, undefined, {
      phi3SliceNormalized: 0.5,
    })
    const nanSlice = packWdwDensityGrid(output, null, undefined, 4, 100, undefined, {
      phi3SliceNormalized: Number.NaN,
    })
    const infiniteSlice = packWdwDensityGrid(output, null, undefined, 4, 100, undefined, {
      phi3SliceNormalized: Number.POSITIVE_INFINITY,
    })

    expect(Array.from(nanSlice.density)).toEqual(Array.from(baseline.density))
    expect(Array.from(infiniteSlice.density)).toEqual(Array.from(baseline.density))
  })
})

function makeSynthetic4dOutput(): WheelerDeWittSolverOutput4D {
  const Na = 2
  const Nphi = 2
  const slab = Nphi ** 3
  const chi = new Float32Array(2 * Na * slab)
  for (let ia = 0; ia < Na; ia++) {
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        for (let i3 = 0; i3 < Nphi; i3++) {
          const idx = ia * slab + (i1 * Nphi + i2) * Nphi + i3
          chi[2 * idx] = 1 + 10 * i3
        }
      }
    }
  }
  return {
    chi,
    lorentzianMask: new Uint8Array(Na * slab).fill(1),
    bandKind: new Uint8Array(Na * slab),
    gridSize: [Na, Nphi, Nphi, Nphi],
    aMin: 0.1,
    aMax: 0.2,
    phiExtent: 1,
    maxDensity: 121,
    columnAiry: [],
  }
}

function makeSynthetic3dOutput(): WheelerDeWittSolverOutput {
  const Na = 2
  const Nphi = 2
  const slab = Nphi ** 2
  const chi = new Float32Array(2 * Na * slab)
  for (let i = 0; i < Na * slab; i++) chi[2 * i] = 1 + i
  return {
    chi,
    lorentzianMask: new Uint8Array(Na * slab).fill(1),
    bandKind: new Uint8Array(Na * slab),
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 0.2,
    phiExtent: 1,
    maxDensity: 16,
    columnAiry: [],
  }
}
