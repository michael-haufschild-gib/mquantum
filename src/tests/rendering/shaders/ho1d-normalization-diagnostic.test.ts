/**
 * HO1D Normalization Parity Tests
 *
 * Validates that the canonical normalization in ho1d.wgsl.ts produces
 * correct, visible volume rendering output by comparing against:
 * - Analytical peak density for the quantum harmonic oscillator ground state
 * - Beer-Lambert alpha accumulation through a center ray
 * - Auto-compensation factor that restores visual parity
 *
 * These tests replaced a diagnostic-only file that used console.log for
 * output instead of assertions. Every test now verifies a concrete physical
 * or rendering property.
 */

import { describe, expect, it } from 'vitest'

import { generateQuantumPreset } from '@/lib/geometry/extended/schroedinger/presets'

// ============================================================================
// Reproduce WGSL math in TypeScript
// ============================================================================

/** Hermite polynomial H_n(u) — matches hermite.wgsl.ts coefficient LUT. */
function hermite(n: number, u: number): number {
  switch (n) {
    case 0:
      return 1
    case 1:
      return 2 * u
    case 2:
      return 4 * u * u - 2
    case 3:
      return 8 * u * u * u - 12 * u
    case 4: {
      const u2 = u * u
      return 16 * u2 * u2 - 48 * u2 + 12
    }
    case 5: {
      const u2 = u * u
      return 32 * u2 * u2 * u - 160 * u2 * u + 120 * u
    }
    case 6: {
      const u2 = u * u
      return 64 * u2 * u2 * u2 - 480 * u2 * u2 + 720 * u2 - 120
    }
    default:
      return 0
  }
}

const INV_PI = 1 / Math.PI
const HO_NORM = [
  1.0, 0.707106781187, 0.353553390593, 0.144337567297, 0.051031036308, 0.0161374306092,
  0.00465847495312,
]

/** Canonical normalization: (alpha^2/pi)^{1/4}, matches ho1d.wgsl.ts */
function ho1D_canonical(n: number, x: number, omega: number): number {
  if (n < 0 || n > 6) return 0
  const alpha = Math.sqrt(Math.max(omega, 0.01))
  const u = alpha * x
  const gauss = Math.exp(-0.5 * u * u)
  const H = hermite(n, u)
  const alphaNorm = Math.sqrt(Math.sqrt(alpha * alpha * INV_PI))
  const norm = HO_NORM[n]!
  return alphaNorm * norm * H * gauss
}

/** Old visual damping normalization (replaced by canonical). */
function ho1D_visual(n: number, x: number, omega: number): number {
  const alpha = Math.sqrt(Math.max(omega, 0.01))
  const u = alpha * x
  const gauss = Math.exp(-0.5 * u * u)
  const H = hermite(n, u)
  const damp = 1.0 / (1.0 + 0.15 * n * n)
  return damp * H * gauss
}

/** Compute 3D density: rho = |Sigma_k c_k * prod_j phi(n_kj, x_j, omega_j) * exp(-i E_k t)|^2 */
function computeDensity3D(
  x: number,
  y: number,
  z: number,
  t: number,
  preset: {
    termCount: number
    quantumNumbers: number[][]
    coefficients: [number, number][]
    energies: number[]
  },
  omega: number[],
  ho1DFunc: (n: number, x: number, omega: number) => number
): number {
  let psiRe = 0
  let psiIm = 0

  for (let k = 0; k < preset.termCount; k++) {
    const qn = preset.quantumNumbers[k]!
    const [cRe, cIm] = preset.coefficients[k]!
    const E = preset.energies[k]!

    const phi =
      ho1DFunc(qn[0]!, x, omega[0]!) *
      ho1DFunc(qn[1]!, y, omega[1]!) *
      ho1DFunc(qn[2]!, z, omega[2]!)

    const cosEt = Math.cos(E * t)
    const sinEt = Math.sin(E * t)

    const termRe = phi * (cRe * cosEt + cIm * sinEt)
    const termIm = phi * (cIm * cosEt - cRe * sinEt)

    psiRe += termRe
    psiIm += termIm
  }

  return psiRe * psiRe + psiIm * psiIm
}

/** Beer-Lambert alpha: 1 - exp(-densityGain * rho * stepLen) */
function computeAlpha(rho: number, stepLen: number, densityGain: number): number {
  return 1 - Math.exp(-densityGain * rho * stepLen)
}

// ============================================================================
// Tests
// ============================================================================

describe('HO1D canonical normalization', () => {
  const SEED = 41
  const DIM = 3
  const TERM_COUNT = 1
  const MAX_N = 6
  const SPREAD = 0.01
  const DENSITY_GAIN = 2.0
  const SAMPLE_COUNT = 32
  const BOUND_R = 2.0

  const preset = generateQuantumPreset(SEED, DIM, TERM_COUNT, MAX_N, SPREAD)

  it('generates a valid single-term 3D quantum preset from seed 41', () => {
    expect(preset.termCount).toBe(1)
    expect(preset.quantumNumbers).toHaveLength(1)
    expect(preset.quantumNumbers[0]).toHaveLength(3)
    expect(preset.coefficients).toHaveLength(1)
    expect(preset.energies).toHaveLength(1)
    // Omega array should have 3 entries for 3D
    expect(preset.omega).toHaveLength(3)
    for (const w of preset.omega) {
      expect(w).toBeGreaterThan(0)
    }
  })

  it('produces non-zero peak density for both normalization schemes', () => {
    const omega = preset.omega
    const GRID = 40

    let peakCanonical = 0
    let peakVisual = 0

    for (let ix = 0; ix < GRID; ix++) {
      for (let iy = 0; iy < GRID; iy++) {
        for (let iz = 0; iz < GRID; iz++) {
          const x = -BOUND_R + (ix / (GRID - 1)) * 2 * BOUND_R
          const y = -BOUND_R + (iy / (GRID - 1)) * 2 * BOUND_R
          const z = -BOUND_R + (iz / (GRID - 1)) * 2 * BOUND_R

          const rhoC = computeDensity3D(x, y, z, 0, preset, omega, ho1D_canonical)
          const rhoV = computeDensity3D(x, y, z, 0, preset, omega, ho1D_visual)

          if (rhoC > peakCanonical) peakCanonical = rhoC
          if (rhoV > peakVisual) peakVisual = rhoV
        }
      }
    }

    expect(peakCanonical).toBeGreaterThan(1e-10)
    expect(peakVisual).toBeGreaterThan(1e-10)
    // Canonical and visual peaks should be within a few orders of magnitude
    expect(Math.log10(peakCanonical / peakVisual)).toBeGreaterThan(-3)
    expect(Math.log10(peakCanonical / peakVisual)).toBeLessThan(3)
  })

  it('canonical normalization produces visible alpha (above discard threshold)', () => {
    const omega = preset.omega
    const stepLen = (2 * BOUND_R) / SAMPLE_COUNT

    let transmittanceCanonical = 1.0
    let transmittanceVisual = 1.0

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const z = -BOUND_R + (i + 0.5) * stepLen

      const rhoC = computeDensity3D(0, 0, z, 0, preset, omega, ho1D_canonical)
      const rhoV = computeDensity3D(0, 0, z, 0, preset, omega, ho1D_visual)

      const alphaC = computeAlpha(rhoC, stepLen, DENSITY_GAIN)
      const alphaV = computeAlpha(rhoV, stepLen, DENSITY_GAIN)

      transmittanceCanonical *= 1 - alphaC
      transmittanceVisual *= 1 - alphaV
    }

    const totalAlphaCanonical = 1 - transmittanceCanonical
    const totalAlphaVisual = 1 - transmittanceVisual

    // Canonical normalization must exceed the shader's 0.01 discard threshold
    expect(totalAlphaCanonical).toBeGreaterThan(0.01)
    // Visual normalization should also be visible
    expect(totalAlphaVisual).toBeGreaterThan(0.01)
  })

  it('ho1D peak values are finite and non-zero for all quantum numbers n=0..6', () => {
    for (let n = 0; n <= 6; n++) {
      let peakC = 0
      let peakV = 0
      for (let ix = 0; ix < 1000; ix++) {
        const x = -4 + ix * 0.008
        peakC = Math.max(peakC, Math.abs(ho1D_canonical(n, x, 1.0)))
        peakV = Math.max(peakV, Math.abs(ho1D_visual(n, x, 1.0)))
      }

      expect(peakC).toBeGreaterThan(0)
      expect(peakV).toBeGreaterThan(0)
      expect(Number.isFinite(peakC)).toBe(true)
      expect(Number.isFinite(peakV)).toBe(true)
    }
  })

  it('ground state (0,0,0) center density matches analytical value (omega/pi)^{3/2}', () => {
    const omega = [1.0, 1.0, 1.0]
    const groundPreset = {
      termCount: 1,
      omega,
      quantumNumbers: [[0, 0, 0]],
      coefficients: [[1.0, 0.0]] as [number, number][],
      energies: [1.5],
    }

    const rhoCenterC = computeDensity3D(0, 0, 0, 0, groundPreset, omega, ho1D_canonical)

    // Theoretical: |psi_0(0)|^2 in 3D = (omega/pi)^{3/2} for omega=1
    const theoretical = Math.pow(1 / Math.PI, 1.5)
    expect(rhoCenterC).toBeCloseTo(theoretical, 4)
  })

  it('auto-compensation restores visual parity within 20%', () => {
    const omega = preset.omega

    // Reproduce the renderer's computeCanonicalCompensation()
    function computeCanonicalCompensation(
      p: ReturnType<typeof generateQuantumPreset>,
      dim: number
    ): number {
      if (p.termCount === 0) return 1.0

      let dominantIdx = 0
      let maxMag = 0
      for (let k = 0; k < p.termCount; k++) {
        const [cRe, cIm] = p.coefficients[k]!
        const mag = cRe * cRe + cIm * cIm
        if (mag > maxMag) {
          maxMag = mag
          dominantIdx = k
        }
      }

      const qn = p.quantumNumbers[dominantIdx]!
      let ratioProduct = 1.0
      for (let j = 0; j < Math.min(dim, qn.length); j++) {
        const n = qn[j]!
        if (n < 0 || n > 6) continue
        const alpha = Math.sqrt(Math.max(p.omega[j] ?? 1.0, 0.01))
        const alphaNorm = Math.sqrt(Math.sqrt(alpha * alpha * INV_PI))
        const norm = HO_NORM[n]!
        const damp = 1.0 / (1.0 + 0.15 * n * n)
        const ratio = damp / (alphaNorm * norm)
        ratioProduct *= ratio * ratio
      }
      return ratioProduct
    }

    const compensation = computeCanonicalCompensation(preset, DIM)
    const effectiveDensityGain = DENSITY_GAIN * compensation

    expect(compensation).toBeGreaterThan(0)
    expect(Number.isFinite(compensation)).toBe(true)

    const stepLen = (2 * BOUND_R) / SAMPLE_COUNT
    let transCompensated = 1.0
    let transOld = 1.0

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const z = -BOUND_R + (i + 0.5) * stepLen
      const rhoC = computeDensity3D(0, 0, z, 0, preset, omega, ho1D_canonical)
      const rhoV = computeDensity3D(0, 0, z, 0, preset, omega, ho1D_visual)

      const alphaCompensated = computeAlpha(rhoC, stepLen, effectiveDensityGain)
      const alphaOld = computeAlpha(rhoV, stepLen, DENSITY_GAIN)

      transCompensated *= 1 - alphaCompensated
      transOld *= 1 - alphaOld
    }

    const totalCompensated = 1 - transCompensated
    const totalOld = 1 - transOld

    // Compensated canonical should produce visible output
    expect(totalCompensated).toBeGreaterThan(0.5)
    // Should match old visual output within 20%
    expect(totalCompensated / totalOld).toBeGreaterThan(0.8)
    expect(totalCompensated / totalOld).toBeLessThan(1.2)
  })
})
