import { describe, expect, it } from 'vitest'

import { solveWheelerDeWitt } from '@/lib/physics/wheelerDeWitt/solver'
import {
  buildPulseOverlay,
  buildStaticOverlay,
  countEuclideanOverlayLeakage,
  integrateWkbStreamlines,
  integrateWkbTrajectories,
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
        out: ReturnType<typeof solveWheelerDeWitt>,
        pt: [number, number, number]
      ): [number, number, number] => {
        const [Na, Nphi] = out.gridSize
        const da = (out.aMax - out.aMin) / (Na - 1)
        const dphi = (2 * out.phiExtent) / (Nphi - 1)
        return [out.aMin + pt[0] * da, -out.phiExtent + pt[1] * dphi, -out.phiExtent + pt[2] * dphi]
      }

      // Mean physical path length per trajectory (Euclidean distance in (a,φ,φ)).
      const meanPathLength = (
        out: ReturnType<typeof solveWheelerDeWitt>,
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
      const ratio = fineLen / coarseLen
      expect(ratio).toBeGreaterThan(0.5)
      expect(ratio).toBeLessThan(2.5)
    })
  })

  describe('split integrator (integrateWkbTrajectories + buildStaticOverlay + buildPulseOverlay)', () => {
    const solverParams = {
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
      // giving the test unambiguous peaks to compare.
      expect(trajectories.length).toBeGreaterThan(0)
      let best = trajectories[0]!
      for (const t of trajectories) if (t.points.length > best.points.length) best = t
      expect(best.points.length).toBeGreaterThan(4)

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
