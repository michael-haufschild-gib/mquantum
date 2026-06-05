/**
 * Verifies the Neumann ghost-cell rule at the four φ-grid corners.
 *
 * The solver's `phiLaplacianAt` applies a zero-flux Neumann boundary
 * by treating out-of-grid neighbours as equal to the centre cell.
 * Getting the reduction wrong at the corners (say, treating only one
 * axis as Neumann and the other as Dirichlet) would leak χ amplitude
 * at the corner cells and propagate that asymmetry into the interior
 * leapfrog.
 *
 * The contract asserted here: a constant-in-φ seed evolves under the
 * Neumann-ghost φ-Laplacian with zero φ-contribution at every cell,
 * including the corners. Any regression that accidentally switched
 * one direction back to Dirichlet ghost (`χ_ghost = 0`) would produce
 * a non-zero `∇²_φ χ` at the affected corner cells — a constant seed
 * would then spuriously evolve along φ.
 */

import { describe, expect, it } from 'vitest'

import type { WdwBoundaryField } from '@/lib/physics/wheelerDeWitt/boundaryConditions'
import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'

/**
 * Build a constant-in-φ initial slab. `χ(a_min, φ) = 1`, `∂_a χ = 0`.
 * Under a pure zero-flux Neumann stencil, `∇²_φ` of a constant is 0
 * at every cell including the four corners.
 */
function flatSlab(Nphi: number): WdwBoundaryField {
  const size = 2 * Nphi * Nphi
  const chi = new Float32Array(size)
  const chiDeriv = new Float32Array(size)
  for (let i = 0; i < Nphi * Nphi; i++) {
    chi[2 * i] = 1.0
    chi[2 * i + 1] = 0.0
  }
  return { chi, chiDeriv }
}

describe('WDW Neumann ghost φ-stencil — corner cells', () => {
  it('preserves a constant-in-φ seed to machine precision at every corner', () => {
    // Λ = 0, m = 0 → V(φ) = 0 everywhere → U(a, φ) = −c_U·a² is
    // constant in φ. Under these conditions the WdW PDE reduces to
    //   χ'' = U·χ
    // and the solution retains its φ-independence provided the
    // φ-Laplacian does not leak amplitude at the grid edges.
    //
    // We inject a constant-in-φ slab via `customBoundary` (so the
    // BC generator does not get in the way) and `disableSponge`
    // (so the sponge doesn't damp the corners).
    const Nphi = 17
    const Na = 32
    const output = solveWheelerDeWitt({
      boundaryCondition: 'noBoundary',
      inflatonMass: 0,
      cosmologicalConstant: 0,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: Na,
      gridNphi: Nphi,
      phiExtent: 3.5,
      customBoundary: flatSlab(Nphi),
      disableSponge: true,
    })

    // Measure φ-variance at every a-slab: the constant seed must
    // remain flat within numerical noise.
    const slab = Nphi * Nphi
    const corners: Array<[number, number]> = [
      [0, 0],
      [0, Nphi - 1],
      [Nphi - 1, 0],
      [Nphi - 1, Nphi - 1],
    ]
    const centre: [number, number] = [Math.floor(Nphi / 2), Math.floor(Nphi / 2)]
    for (let ia = 0; ia < Na; ia++) {
      const centreIdx = 2 * (ia * slab + centre[0] * Nphi + centre[1])
      const cRe = output.chi[centreIdx]!
      for (const [i1, i2] of corners) {
        const cornerIdx = 2 * (ia * slab + i1 * Nphi + i2)
        const reC = output.chi[cornerIdx]!
        // Neumann stencil preserves a constant — corner and centre
        // must agree to numerical precision.
        expect(Math.abs(reC - cRe)).toBeLessThan(1e-4)
      }
    }
  })
})
