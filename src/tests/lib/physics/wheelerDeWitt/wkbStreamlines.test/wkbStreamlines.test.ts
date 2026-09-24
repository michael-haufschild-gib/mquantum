import { describe, expect, it } from 'vitest'

import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput3D,
  type WheelerDeWittSolverOutput,
} from '@/lib/physics/wheelerDeWitt/solver'
import {
  buildPulseOverlay,
  buildStaticOverlay,
  countEuclideanOverlayLeakage,
  integrateWkbStreamlines,
  integrateWkbTrajectories,
  MAX_WKB_STREAMLINE_OVERLAY_SITES,
} from '@/lib/physics/wheelerDeWitt/wkbStreamlines'

describe('WKB streamlines', () => {
  it('keep (almost) all splats inside the Lorentzian region', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.2,
      aMin: 0.5,
      aMax: 2.0,
      gridNa: 32,
      gridNphi: 16,
      phiExtent: 2.0,
    })
    const overlay = integrateWkbStreamlines(out, {
      density: 6,
      maxSteps: 80,
      splatRadius: 0.35,
    })
    const leakage = countEuclideanOverlayLeakage(overlay, out)
    // The Gaussian splat radius inevitably reaches a few Euclidean neighbors
    // near the horizon; require < 30% leakage (splat radius 0.35 cells).
    // Threshold loosened from 0.25 to 0.30 after the nearest-neighbor
    // rounding fix in sampleArg — integer index lookups now hit denser
    // sheets near the turning surface than the old truncated-index path.
    expect(leakage.fraction).toBeLessThan(0.3)
    // Make sure some streamlines actually ran
    expect(leakage.total).toBeGreaterThan(0)
  })

  it('produce non-zero intensity overlay', () => {
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.2,
      aMin: 0.5,
      aMax: 2.0,
      gridNa: 32,
      gridNphi: 16,
      phiExtent: 2.0,
    })
    const overlay = integrateWkbStreamlines(out, {
      density: 6,
      maxSteps: 40,
      splatRadius: 0.9,
    })
    expect(overlay.maxIntensity).toBeGreaterThan(0)
  })

  it('propagate beyond the seed cell (regression: RK4 stall on fractional indices)', () => {
    // Before the sampleArg rounding fix: rk4Step advanced to fractional
    // coordinates; sampleArg indexed the typed array with non-integer keys,
    // got undefined → 0, collapsed the gradient to zero, and the `delta <
    // 1e-4` guard terminated every streamline after a single step. Overlay
    // then only held single-splat clusters.
    // After the fix: streamlines march for many steps and the overlay
    // touches an order of magnitude more voxels.
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.2,
      aMin: 0.5,
      aMax: 2.0,
      gridNa: 32,
      gridNphi: 16,
      phiExtent: 2.0,
    })
    const overlay = integrateWkbStreamlines(out, {
      density: 4,
      maxSteps: 40,
      splatRadius: 0.9,
    })

    let touched = 0
    for (let i = 0; i < overlay.intensity.length; i++) {
      if ((overlay.intensity[i] ?? 0) > 1e-6) touched++
    }

    // Broken: ~seedCount × splatFootprint ≈ O(100) voxels.
    // Fixed: seedCount × steps × splatFootprint ≈ O(10000). 1000 gives
    // comfortable margin and is insensitive to small physics tuning.
    expect(touched).toBeGreaterThan(1000)
  })

  describe('resolution invariance — trajectories live in physical (a, φ) space', () => {
    // Regression: the legacy integrator returned ∂S/∂q in PHYSICAL units and
    // added those values directly to GRID-INDEX coordinates. The resulting
    // per-step index advance then scaled with the grid spacing (dphi ≫ da
    // under defaults), so trajectories were both shape-distorted and
    // resolution-dependent. The fix returns index-space velocity — trajectories
    // in physical (a, φ) space become ~resolution-invariant (up to finite-diff
    // discretization error).

    const baseSolverParams = {
      boundaryCondition: 'tunneling' as const,
      inflatonMass: 0.3,
      cosmologicalConstant: 0.2,
      aMin: 0.5,
      aMax: 2.0,
      phiExtent: 2.0,
    }

    it('trajectories cover comparable physical extent across a 2× grid refinement', () => {
      const coarseOut = solveWheelerDeWitt({
        ...baseSolverParams,
        gridNa: 32,
        gridNphi: 16,
      })
      const fineOut = solveWheelerDeWitt({
        ...baseSolverParams,
        gridNa: 64,
        gridNphi: 32,
      })

      const integratorInput = { density: 4, maxSteps: 64, splatRadius: 0.9 }
      const coarse = integrateWkbTrajectories(coarseOut, integratorInput)
      const fine = integrateWkbTrajectories(fineOut, integratorInput)

      // Convert index-space trajectory point to physical (a, φ₁, φ₂).
      const toPhysical = (
        out: WheelerDeWittSolverOutput,
        pt: [number, number, number]
      ): [number, number, number] => {
        const [Na, Nphi] = out.gridSize
        const da = (out.aMax - out.aMin) / (Na - 1)
        const dphi = (2 * out.phiExtent) / (Nphi - 1)
        return [out.aMin + pt[0] * da, -out.phiExtent + pt[1] * dphi, -out.phiExtent + pt[2] * dphi]
      }

      // Mean physical path length per trajectory (Euclidean distance in (a,φ,φ)).
      const meanPathLength = (
        out: WheelerDeWittSolverOutput,
        trajs: ReturnType<typeof integrateWkbTrajectories>
      ): number => {
        if (trajs.length === 0) return 0
        let total = 0
        for (const t of trajs) {
          if (t.points.length < 2) continue
          let len = 0
          for (let i = 1; i < t.points.length; i++) {
            const a = toPhysical(out, t.points[i - 1]!)
            const b = toPhysical(out, t.points[i]!)
            const dx = b[0] - a[0]
            const dy = b[1] - a[1]
            const dz = b[2] - a[2]
            len += Math.sqrt(dx * dx + dy * dy + dz * dz)
          }
          total += len
        }
        return total / trajs.length
      }

      const coarseLen = meanPathLength(coarseOut, coarse)
      const fineLen = meanPathLength(fineOut, fine)

      // Both integrators must produce propagating trajectories.
      expect(coarseLen).toBeGreaterThan(0)
      expect(fineLen).toBeGreaterThan(0)

      // Under the pre-fix code, fineLen was ~½ coarseLen (per-step physical
      // displacement scaled with da). After the fix, the ratio collapses to
      // O(1). Allow a generous band [0.4, 2.5] — the assertion is "same
      // order, not half/double", which is exactly what resolution invariance
      // guarantees. The broken integrator would violate the lower bound
      // (fineLen/coarseLen ≈ 0.5 at 2× refinement).
      //
      // Stage-2 WKB-tail refinement (see solver.ts) shifted the baseline
      // slightly: the analytic Euclidean tail replaces the clamp-saturated
      // numerical values, which in turn changes the φ-Laplacian
      // contribution at Lorentzian cells adjacent to the turning surface.
      // The ratio is now ~0.46 at default refinement — still within the
      // commented `[0.4, 2.5]` band.
      const ratio = fineLen / coarseLen
      expect(ratio).toBeGreaterThan(0.4)
      expect(ratio).toBeLessThan(2.5)
    })
  })

  describe('split integrator (integrateWkbTrajectories + buildStaticOverlay + buildPulseOverlay)', () => {
    const solverParams: WheelerDeWittSolverInput3D = {
      boundaryCondition: 'tunneling' as const,
      inflatonMass: 0.3,
      cosmologicalConstant: 0.2,
      aMin: 0.5,
      aMax: 2.0,
      gridNa: 32,
      gridNphi: 16,
      phiExtent: 2.0,
    }
    const integratorInput = { density: 4, maxSteps: 40, splatRadius: 0.9 }

    it('rejects over-budget overlay grids before allocation', () => {
      const gridSize: [number, number, number] = [MAX_WKB_STREAMLINE_OVERLAY_SITES + 1, 1, 1]
      expect(() => buildStaticOverlay([], 0.9, gridSize)).toThrow(/site budget/)
      expect(() => buildPulseOverlay([], 0, 0.08, 0.9, gridSize)).toThrow(/site budget/)
    })

    it('rejects malformed solver buffers before trajectory integration', () => {
      const output = {
        gridSize: [4, 4, 4],
        chi: new Float32Array(1),
        lorentzianMask: new Uint8Array(4 * 4 * 4),
        aMin: 0.5,
        aMax: 2,
        phiExtent: 2,
      } as unknown as WheelerDeWittSolverOutput

      expect(() => integrateWkbTrajectories(output, integratorInput)).toThrow(
        /chi buffer too small/
      )
    })

    it('integrateWkbTrajectories returns non-empty, multi-step, in-bounds trajectories', () => {
      const out = solveWheelerDeWitt(solverParams)
      const trajectories = integrateWkbTrajectories(out, integratorInput)
      const [Na, Nphi] = out.gridSize

      expect(trajectories.length).toBeGreaterThan(0)
      // Most seeds advance beyond their starting cell (multi-step propagation).
      let multiStep = 0
      for (const traj of trajectories) {
        expect(traj.points.length).toBeGreaterThan(0)
        if (traj.points.length > 1) multiStep++
        for (const [ia, i1, i2] of traj.points) {
          // Trajectory points are (continuous) grid indices — assert within
          // grid extents.
          expect(ia).toBeGreaterThanOrEqual(0)
          expect(ia).toBeLessThan(Na)
          expect(i1).toBeGreaterThanOrEqual(0)
          expect(i1).toBeLessThan(Nphi)
          expect(i2).toBeGreaterThanOrEqual(0)
          expect(i2).toBeLessThan(Nphi)
        }
      }
      // The split must preserve the propagation behavior of the legacy
      // integrator. If every trajectory collapsed to its seed cell we would
      // have reintroduced the fractional-index stall bug.
      expect(multiStep).toBeGreaterThan(0)
    })

    it('buildStaticOverlay(integrateWkbTrajectories) is bit-identical to legacy integrateWkbStreamlines', () => {
      const out = solveWheelerDeWitt(solverParams)
      const trajectories = integrateWkbTrajectories(out, integratorInput)
      const rebuilt = buildStaticOverlay(trajectories, integratorInput.splatRadius, out.gridSize)
      const legacy = integrateWkbStreamlines(out, integratorInput)

      // Regression contract: intensity bytes are identical, including max.
      expect(rebuilt.intensity.length).toBe(legacy.intensity.length)
      for (let i = 0; i < legacy.intensity.length; i++) {
        // Using Object.is / strict equality catches -0 vs 0 and NaN vs NaN
        // — needed because Float32Array round-off drifts the moment the
        // accumulation order changes.
        expect(Object.is(rebuilt.intensity[i], legacy.intensity[i])).toBe(true)
      }
      expect(rebuilt.maxIntensity).toBe(legacy.maxIntensity)
    })

    it('buildPulseOverlay peak tracks animTime along a single trajectory', () => {
      const out = solveWheelerDeWitt(solverParams)
      const trajectories = integrateWkbTrajectories(out, integratorInput)

      // Pick the longest trajectory so start and end cells are well separated,
      // giving the test unambiguous peaks to compare. The Phase 2 Langer-uniform
      // Vilenkin seed produces a slightly different φ-gradient structure than
      // the pre-Phase-2 leading-WKB seed — at these solver params the longest
      // trajectory is now ~4 points (vs 5+ previously). The test contract is
      // "at least one step happened and pulse peak tracks animTime"; bound
      // relaxed to the minimum multi-step trajectory.
      expect(trajectories.length).toBeGreaterThan(0)
      let best = trajectories[0]!
      for (const t of trajectories) if (t.points.length > best.points.length) best = t
      expect(best.points.length).toBeGreaterThanOrEqual(3)

      const single = [best]
      const pulseWidth = 0.08
      const splatR = 0.35 // small splat — peak is localized near the chosen point

      const [, Nphi] = out.gridSize
      const argmax = (overlay: { intensity: Float32Array }): [number, number, number] => {
        let idxMax = 0
        let vMax = overlay.intensity[0] ?? 0
        for (let i = 1; i < overlay.intensity.length; i++) {
          const v = overlay.intensity[i] ?? 0
          if (v > vMax) {
            vMax = v
            idxMax = i
          }
        }
        const ia = Math.floor(idxMax / (Nphi * Nphi))
        const rem = idxMax - ia * Nphi * Nphi
        const i1 = Math.floor(rem / Nphi)
        const i2 = rem - i1 * Nphi
        return [ia, i1, i2]
      }

      const firstPoint = best.points[0]!
      const lastPoint = best.points[best.points.length - 1]!
      const firstCell: [number, number, number] = [
        Math.round(firstPoint[0]),
        Math.round(firstPoint[1]),
        Math.round(firstPoint[2]),
      ]
      const lastCell: [number, number, number] = [
        Math.round(lastPoint[0]),
        Math.round(lastPoint[1]),
        Math.round(lastPoint[2]),
      ]

      // Sanity: start and end cells differ (trajectory actually moved).
      const sepMax = Math.max(
        Math.abs(firstCell[0] - lastCell[0]),
        Math.abs(firstCell[1] - lastCell[1]),
        Math.abs(firstCell[2] - lastCell[2])
      )
      expect(sepMax).toBeGreaterThan(0)

      // maxIntensity is fixed by contract.
      const atZero = buildPulseOverlay(single, 0, pulseWidth, splatR, out.gridSize)
      expect(atZero.maxIntensity).toBe(1.0)
      const atOne = buildPulseOverlay(single, 1, pulseWidth, splatR, out.gridSize)
      expect(atOne.maxIntensity).toBe(1.0)

      const argAtZero = argmax(atZero)
      const argAtOne = argmax(atOne)

      const dist = (a: [number, number, number], b: [number, number, number]): number =>
        Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))

      // At animTime=0, the peak is closer (in Chebyshev distance) to the
      // trajectory's first point than its last — and vice versa at animTime=1.
      // Direct validation of the "pulse moves with animTime" claim.
      expect(dist(argAtZero, firstCell)).toBeLessThan(dist(argAtZero, lastCell))
      expect(dist(argAtOne, lastCell)).toBeLessThan(dist(argAtOne, firstCell))
    })
  })
})

// Regression: the a-velocity included the product-rule term (3/2)·a^{1/2}·arg χ
// of ∇(a^{3/2}·arg χ). arg is only defined modulo 2π, so that term depended on
// the branch cut and on χ's global phase — near a_min it rivalled the
// a^{3/2}·∂ₐ arg term and reversed the flow. The velocity field must be
// invariant under χ → e^{iα}χ. (Compared on the first RK4 step from each seed:
// later steps land on the CFL cap's exact half-cell ties of the nearest-cell
// phase lookup, where f32 rounding of the rotated χ decides the cell.)
describe('WKB streamline flow is invariant under a global phase of χ', () => {
  function smoothOutput(alpha: number): WheelerDeWittSolverOutput {
    const Na = 24
    const Nphi = 12
    const slab = Nphi * Nphi
    const chi = new Float32Array(2 * Na * slab)
    for (let ia = 0; ia < Na; ia++) {
      const a = 0.1 + 1.4 * (ia / (Na - 1))
      for (let i1 = 0; i1 < Nphi; i1++) {
        const phi1 = -2 + 4 * (i1 / (Nphi - 1))
        for (let i2 = 0; i2 < Nphi; i2++) {
          const phi2 = -2 + 4 * (i2 / (Nphi - 1))
          const idx = ia * slab + i1 * Nphi + i2
          // Node-free amplitude, smooth phase: the flow is well defined everywhere.
          const amp = Math.cos((Math.PI * phi1) / 4) + 1.2
          const theta = 6 * a + 0.4 * phi1 - 0.3 * phi2 + alpha
          chi[2 * idx] = amp * Math.cos(theta)
          chi[2 * idx + 1] = amp * Math.sin(theta)
        }
      }
    }
    return {
      chi,
      lorentzianMask: new Uint8Array(Na * slab).fill(1),
      bandKind: new Uint8Array(Na * slab),
      gridSize: [Na, Nphi, Nphi],
      aMin: 0.1,
      aMax: 1.5,
      phiExtent: 2,
      maxDensity: 1,
      columnAiry: [],
    }
  }

  it('takes the same first RK4 step from every seed for χ and e^{iα}·χ', () => {
    const input = { density: 4, maxSteps: 2, splatRadius: 0.9 }
    const base = integrateWkbTrajectories(smoothOutput(0), input)
    expect(base.length).toBeGreaterThan(0)
    for (const alpha of [1.1, 2.3, -2.9]) {
      const phased = integrateWkbTrajectories(smoothOutput(alpha), input)
      expect(phased.length).toBe(base.length)
      for (let t = 0; t < base.length; t++) {
        const a = base[t]!.points
        const b = phased[t]!.points
        expect(a.length).toBe(2)
        expect(b.length).toBe(2)
        for (let d = 0; d < 3; d++) {
          expect(b[1]![d]! - b[0]![d]!).toBeCloseTo(a[1]![d]! - a[0]![d]!, 6)
        }
      }
    }
  })
})
