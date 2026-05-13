/**
 * Stochastic Decoherence Engine — Integration Math Tests
 *
 * Tests the mathematical invariants of the stochastic decoherence engine
 * as fixed in the plan review: IPR convention, N-D distance, expectation
 * subtraction, branch decomposition, and sweep accumulation.
 *
 * These are CPU-side tests using the reference implementations that mirror
 * the GPU shaders. Each test answers: "What bug would make this fail?"
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  branchEntropy,
  branchPurity,
  spatialBranchPartition,
} from '@/lib/physics/stochastic/branchDecomposition'
import {
  inverseParticipationRatio,
  iprFromDensity,
  normalizedIPR,
} from '@/lib/physics/stochastic/ipr'
import { generateCollapseCenters } from '@/lib/physics/stochastic/localizationKernel'
import {
  applyLocalizationStep1D,
  applyLocalizationStepND,
  computeParticipationRatio,
  renormalize,
} from '@/lib/physics/stochastic/localizationOperator'
import { gammaForStep, useMonitoringSweepStore } from '@/stores/diagnostics/monitoringSweepStore'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uniformPsi(n: number) {
  const amp = 1 / Math.sqrt(n)
  return { psiRe: new Float64Array(n).fill(amp), psiIm: new Float64Array(n).fill(0) }
}

function gaussianPsi1D(n: number, center: number, sigma: number, spacing: number) {
  const psiRe = new Float64Array(n)
  const psiIm = new Float64Array(n)
  const halfExtent = n * spacing * 0.5
  for (let i = 0; i < n; i++) {
    const x = i * spacing - halfExtent
    psiRe[i] = Math.exp(-((x - center) ** 2) / (4 * sigma * sigma))
  }
  renormalize(psiRe, psiIm)
  return { psiRe, psiIm }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  IPR Convention (Fix 4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('IPR convention: 1/Σp² (1=localized, N=delocalized)', () => {
  it('three equal peaks → IPR = 3', () => {
    const N = 256
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    psiRe[10] = 1 / Math.sqrt(3)
    psiRe[50] = 1 / Math.sqrt(3)
    psiRe[100] = 1 / Math.sqrt(3)
    expect(inverseParticipationRatio(psiRe, psiIm)).toBeCloseTo(3, 8)
  })

  it('IPR monotonically increases as distribution becomes more uniform', () => {
    // delta(1) → 2-peaks(2) → 4-peaks(4) → uniform(N)
    const N = 64
    const iprs: number[] = []

    for (const nPeaks of [1, 2, 4, 8, 16]) {
      const psiRe = new Float64Array(N)
      const psiIm = new Float64Array(N)
      const amp = 1 / Math.sqrt(nPeaks)
      for (let k = 0; k < nPeaks; k++) {
        psiRe[Math.floor((k * N) / nPeaks)] = amp
      }
      iprs.push(inverseParticipationRatio(psiRe, psiIm))
    }

    for (let i = 1; i < iprs.length; i++) {
      expect(iprs[i], `${i + 1} peaks > ${i} peaks`).toBeGreaterThan(iprs[i - 1]!)
    }
  })

  it('normalizedIPR ∈ (0, 1] for any non-zero wavefunction', () => {
    // Random wavefunction
    const N = 64
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      psiRe[i] = Math.sin(i * 0.7)
      psiIm[i] = Math.cos(i * 1.3)
    }
    const nipr = normalizedIPR(psiRe, psiIm)
    expect(nipr).toBeGreaterThan(0)
    expect(nipr).toBeLessThanOrEqual(1.0 + 1e-10)
  })

  it('iprFromDensity matches inverseParticipationRatio', () => {
    const N = 128
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      psiRe[i] = Math.cos(i * 0.3)
      psiIm[i] = Math.sin(i * 0.5)
    }
    const ipr1 = inverseParticipationRatio(psiRe, psiIm)
    const density = new Float64Array(N)
    for (let i = 0; i < N; i++) density[i] = psiRe[i]! ** 2 + psiIm[i]! ** 2
    const ipr2 = iprFromDensity(density)
    expect(Math.abs(ipr1 - ipr2)).toBeLessThan(1e-10)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  N-D Localization Distance (Fix 6)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('N-D localization: distance uses all dimensions', () => {
  it('4D localization produces different result than 3D-truncated for same config', () => {
    // 4D grid: 4×4×4×4 = 256 sites
    const gridSize = [4, 4, 4, 4]
    const spacing = [1.0, 1.0, 1.0, 1.0]
    const { psiRe: psi3dRe, psiIm: psi3dIm } = uniformPsi(256)
    const { psiRe: psi4dRe, psiIm: psi4dIm } = uniformPsi(256)

    // Center at (1,1,1,2) — the 4th coordinate matters
    const center4d = { position: [1, 1, 1, 2], noise: 1.5 }
    const center3d = { position: [1, 1, 1], noise: 1.5 }

    // Apply 4D localization (all dims used)
    applyLocalizationStepND(psi4dRe, psi4dIm, gridSize, spacing, 4, [center4d], 1.0, 1.0, 0.1)

    // Apply "3D" localization on same grid (only 3 dims in center)
    applyLocalizationStepND(psi3dRe, psi3dIm, gridSize, spacing, 4, [center3d], 1.0, 1.0, 0.1)

    // Results should differ because 4D center has extra distance info
    let maxDiff = 0
    for (let i = 0; i < 256; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(psi4dRe[i]! - psi3dRe[i]!))
    }
    expect(maxDiff, 'N-D distance distinguishes dim-4 position').toBeGreaterThan(1e-6)
  })

  it('3D N-D path matches 1D path for 1D grid', () => {
    const n = 32
    const { psiRe: re1d, psiIm: im1d } = uniformPsi(n)
    const { psiRe: reNd, psiIm: imNd } = uniformPsi(n)

    const centers = generateCollapseCenters(2, [n], [0.1], 1, 42, 0)

    applyLocalizationStep1D(re1d, im1d, n, 0.1, centers, 1.0, 2.0, 0.005)
    applyLocalizationStepND(reNd, imNd, [n], [0.1], 1, centers, 1.0, 2.0, 0.005)

    for (let i = 0; i < n; i++) {
      expect(Math.abs(re1d[i]! - reNd[i]!)).toBeLessThan(1e-12)
      expect(Math.abs(im1d[i]! - imNd[i]!)).toBeLessThan(1e-12)
    }
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Branch Decomposition (Fixes 1, 3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('branch decomposition: partition tracks branch plane', () => {
  it('moving branch plane shifts population split', () => {
    const n = 64
    const spacing = 0.1
    const { psiRe, psiIm } = gaussianPsi1D(n, 0.5, 0.3, spacing)

    // Plane at 0: packet (center=0.5) is mostly on the right
    const p0 = spatialBranchPartition(psiRe, psiIm, [n], [spacing], 1, 0)
    expect(p0.populationB, 'positive-center → right-heavy at plane=0').toBeGreaterThan(
      p0.populationA
    )

    // Plane at 1.0 (beyond the packet): most density is on the left
    const p1 = spatialBranchPartition(psiRe, psiIm, [n], [spacing], 1, 1.0)
    expect(p1.populationA, 'plane beyond packet → left-heavy').toBeGreaterThan(p1.populationB)
  })

  it('branchPurity = 0.5 when populations are equal (minimum)', () => {
    // branchPurity = p_A² + p_B², minimum at equal split: 0.25 + 0.25 = 0.5
    expect(branchPurity(0.5, 0.5)).toBeCloseTo(0.5, 10)
  })

  it('branchPurity = 1 when all density on one side (maximum)', () => {
    expect(branchPurity(1.0, 0.0)).toBeCloseTo(1, 10)
    expect(branchPurity(0.0, 1.0)).toBeCloseTo(1, 10)
  })

  it('branchPurity increases as populations become more asymmetric', () => {
    expect(branchPurity(0.7, 0.3)).toBeGreaterThan(branchPurity(0.5, 0.5))
    expect(branchPurity(0.9, 0.1)).toBeGreaterThan(branchPurity(0.7, 0.3))
  })

  it('branchEntropy maximal when populations are equal', () => {
    // Maximum binary entropy = ln(2) at p=0.5
    const eqEntropy = branchEntropy(0.5, 0.5)
    const asymEntropy = branchEntropy(0.9, 0.1)
    expect(eqEntropy).toBeGreaterThan(asymEntropy)
    expect(eqEntropy).toBeCloseTo(Math.log(2), 5)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Localization Dynamics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('localization dynamics: IPR response to γ', () => {
  it('IPR decreases monotonically with increasing γ (more localization)', () => {
    const n = 64
    const spacing = 0.1

    function runGamma(gamma: number): number {
      const { psiRe, psiIm } = uniformPsi(n)
      for (let step = 0; step < 40; step++) {
        const centers = generateCollapseCenters(4, [n], [spacing], 1, 42, step)
        applyLocalizationStep1D(psiRe, psiIm, n, spacing, centers, gamma, 2.0, 0.005)
        renormalize(psiRe, psiIm)
      }
      // Use the new IPR convention: 1/Σp² (higher = more delocalized)
      return inverseParticipationRatio(psiRe, psiIm)
    }

    const gammas = [0.1, 0.5, 1.0, 2.0, 5.0]
    const iprs = gammas.map(runGamma)

    // IPR should decrease (more localized) as γ increases
    for (let i = 1; i < iprs.length; i++) {
      expect(
        iprs[i],
        `IPR at γ=${gammas[i]} (${iprs[i]!.toFixed(2)}) ≤ IPR at γ=${gammas[i - 1]} (${iprs[i - 1]!.toFixed(2)})`
      ).toBeLessThanOrEqual(iprs[i - 1]! * 1.05) // 5% tolerance for stochastic noise
    }
  })

  it('Σp² (old convention) is reciprocal of new IPR', () => {
    const n = 64
    const { psiRe, psiIm } = uniformPsi(n)
    for (let step = 0; step < 20; step++) {
      const centers = generateCollapseCenters(4, [n], [0.1], 1, 42, step)
      applyLocalizationStep1D(psiRe, psiIm, n, 0.1, centers, 1.0, 2.0, 0.005)
      renormalize(psiRe, psiIm)
    }

    const pr = computeParticipationRatio(psiRe, psiIm) // Σp²
    const ipr = inverseParticipationRatio(psiRe, psiIm) // 1/Σp²

    expect(Math.abs(pr * ipr - 1), 'Σp² × (1/Σp²) = 1').toBeLessThan(1e-8)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Monitoring Sweep Store (Fix 5)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('monitoring sweep: time-averaged IPR', () => {
  beforeEach(() => {
    useMonitoringSweepStore.getState().reset()
  })

  it('tick accumulates IPR samples and averages on step completion', () => {
    const cfg = { gammaMin: 1.0, gammaMax: 3.0, steps: 2, timePerStep: 1.0 }
    useMonitoringSweepStore.getState().startSweep(cfg)

    // Tick 1: sets start time, records first sample
    useMonitoringSweepStore.getState().tick(1.0, 100, 0.01)
    // Tick 2: accumulates, still waiting
    useMonitoringSweepStore.getState().tick(1.3, 80, 0.02)
    // Tick 3: accumulates, still waiting
    useMonitoringSweepStore.getState().tick(1.6, 60, 0.03)
    // Tick 4: enough time elapsed → completes step with time-averaged IPR
    useMonitoringSweepStore.getState().tick(2.0, 40, 0.04)

    const state = useMonitoringSweepStore.getState()
    expect(state.results).toHaveLength(1)
    // Average of [100, 80, 60, 40] = 70
    expect(state.results[0]!.ipr).toBeCloseTo(70)
    // Average of [0.01, 0.02, 0.03, 0.04] = 0.025
    expect(state.results[0]!.normDrift).toBeCloseTo(0.025)
  })

  it('gammaForStep produces evenly spaced values', () => {
    const cfg = { gammaMin: 0, gammaMax: 10, steps: 11, timePerStep: 1 }
    for (let i = 0; i <= 10; i++) {
      expect(gammaForStep(cfg, i)).toBeCloseTo(i)
    }
  })

  it('sweep completes with correct number of results', () => {
    const cfg = { gammaMin: 0.1, gammaMax: 0.9, steps: 3, timePerStep: 0.5 }
    useMonitoringSweepStore.getState().startSweep(cfg)

    // Drive all 3 steps to completion
    let t = 1.0
    for (let step = 0; step < 3; step++) {
      useMonitoringSweepStore.getState().tick(t, 50 - step * 10, 0.01)
      t += 0.6 // > timePerStep
      useMonitoringSweepStore.getState().tick(t, 50 - step * 10, 0.01)
      t += 0.1
    }

    const state = useMonitoringSweepStore.getState()
    expect(state.status).toBe('complete')
    expect(state.results).toHaveLength(3)
    // Gammas should be ascending
    expect(state.results[0]!.gamma).toBeLessThan(state.results[1]!.gamma)
    expect(state.results[1]!.gamma).toBeLessThan(state.results[2]!.gamma)
  })

  it('abort clears accumulator state', () => {
    const cfg = { gammaMin: 1.0, gammaMax: 3.0, steps: 5, timePerStep: 1.0 }
    useMonitoringSweepStore.getState().startSweep(cfg)
    useMonitoringSweepStore.getState().tick(1.0, 50, 0.01) // start step
    useMonitoringSweepStore.getState().abort()

    const state = useMonitoringSweepStore.getState()
    expect(state.status).toBe('idle')
    expect(state.iprAccumulator).toEqual([])
    expect(state.normDriftAccumulator).toEqual([])
  })
})
