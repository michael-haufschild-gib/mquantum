/**
 * Diagnostic test: HO1D normalization change impact analysis.
 *
 * The ho1d.wgsl.ts normalization was changed from "visual damping" to "canonical".
 * This test computes peak densities with both approaches to determine if
 * the change could cause the volume rendering to produce invisible output.
 *
 * Context: The Schroedinger renderer shows "3 thin horizontal black lines"
 * instead of a volumetric Gaussian blob.
 */

import { describe, it, expect } from 'vitest'
import { generateQuantumPreset } from '@/lib/geometry/extended/schroedinger/presets'

// ============================================================================
// Reproduce WGSL math in TypeScript
// ============================================================================

/** Hermite polynomial H_n(u) - matches hermite.wgsl.ts */
function hermite(n: number, u: number): number {
  switch (n) {
    case 0: return 1
    case 1: return 2 * u
    case 2: return 4 * u * u - 2
    case 3: return 8 * u * u * u - 12 * u
    case 4: { const u2 = u * u; return 16 * u2 * u2 - 48 * u2 + 12 }
    case 5: { const u2 = u * u; return 32 * u2 * u2 * u - 160 * u2 * u + 120 * u }
    case 6: { const u2 = u * u; return 64 * u2 * u2 * u2 - 480 * u2 * u2 + 720 * u2 - 120 }
    default: return 0
  }
}

const INV_PI = 1 / Math.PI
const HO_NORM = [1.0, 0.707106781187, 0.353553390593, 0.144337567297, 0.0510310363080, 0.0161374306092, 0.00465847495312]

/** NEW canonical normalization (local code) */
function ho1D_canonical(n: number, x: number, omega: number): number {
  if (n < 0 || n > 6) return 0
  const alpha = Math.sqrt(Math.max(omega, 0.01))
  const u = alpha * x
  const gauss = Math.exp(-0.5 * u * u)
  const H = hermite(n, u)
  const alphaNorm = Math.sqrt(Math.sqrt(alpha * INV_PI))
  const norm = HO_NORM[n]
  return alphaNorm * norm * H * gauss
}

/** OLD visual damping normalization (remote/working code) */
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
  x: number, y: number, z: number, t: number,
  preset: ReturnType<typeof generateQuantumPreset>,
  omega: number[],
  ho1DFunc: (n: number, x: number, omega: number) => number
): number {
  let psiRe = 0
  let psiIm = 0

  for (let k = 0; k < preset.termCount; k++) {
    const qn = preset.quantumNumbers[k]
    const [cRe, cIm] = preset.coefficients[k]
    const E = preset.energies[k]

    // Product of 1D eigenfunctions
    const phi = ho1DFunc(qn[0], x, omega[0])
               * ho1DFunc(qn[1], y, omega[1])
               * ho1DFunc(qn[2], z, omega[2])

    // Time factor: e^{-iEt}
    const cosEt = Math.cos(E * t)
    const sinEt = Math.sin(E * t)

    // c_k * phi * exp(-iEt) = (cRe + i*cIm) * phi * (cosEt - i*sinEt)
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

describe('HO1D Normalization Diagnostic', () => {
  // Default config values
  const SEED = 42
  const DIM = 3
  const TERM_COUNT = 1
  const MAX_N = 6
  const SPREAD = 0.01
  const DENSITY_GAIN = 2.0
  const SAMPLE_COUNT = 32
  const BOUND_R = 2.0

  const preset = generateQuantumPreset(SEED, DIM, TERM_COUNT, MAX_N, SPREAD)

  it('should log the default quantum state from seed=42', () => {
    console.log('=== DEFAULT QUANTUM STATE (seed=42) ===')
    console.log('termCount:', preset.termCount)
    console.log('omega:', preset.omega)
    console.log('quantumNumbers:', preset.quantumNumbers)
    console.log('coefficients:', preset.coefficients)
    console.log('energies:', preset.energies)

    expect(preset.termCount).toBe(1)
    expect(preset.quantumNumbers.length).toBe(1)
    expect(preset.quantumNumbers[0].length).toBe(3)
  })

  it('should compare peak density: canonical vs visual normalization', () => {
    const omega = preset.omega

    // Scan over a grid to find peak density
    const GRID = 40
    let peakCanonical = 0
    let peakVisual = 0
    let peakPos = [0, 0, 0]

    for (let ix = 0; ix < GRID; ix++) {
      for (let iy = 0; iy < GRID; iy++) {
        for (let iz = 0; iz < GRID; iz++) {
          const x = -BOUND_R + (ix / (GRID - 1)) * 2 * BOUND_R
          const y = -BOUND_R + (iy / (GRID - 1)) * 2 * BOUND_R
          const z = -BOUND_R + (iz / (GRID - 1)) * 2 * BOUND_R

          const rhoC = computeDensity3D(x, y, z, 0, preset, omega, ho1D_canonical)
          const rhoV = computeDensity3D(x, y, z, 0, preset, omega, ho1D_visual)

          if (rhoC > peakCanonical) {
            peakCanonical = rhoC
            peakPos = [x, y, z]
          }
          if (rhoV > peakVisual) peakVisual = rhoV
        }
      }
    }

    console.log('=== PEAK DENSITY COMPARISON ===')
    console.log('Peak density (canonical/NEW):', peakCanonical.toExponential(4))
    console.log('Peak density (visual/OLD):   ', peakVisual.toExponential(4))
    console.log('Ratio (new/old):             ', (peakCanonical / peakVisual).toFixed(4))
    console.log('Peak position:               ', peakPos.map(v => v.toFixed(2)))

    // Both should produce non-zero density
    expect(peakCanonical).toBeGreaterThan(0)
    expect(peakVisual).toBeGreaterThan(0)
  })

  it('should simulate volume raymarching alpha accumulation along center ray', () => {
    const omega = preset.omega
    const stepLen = (2 * BOUND_R) / SAMPLE_COUNT

    // March a ray through the center (x=0, y=0, z varies from -BOUND_R to +BOUND_R)
    let transmittanceCanonical = 1.0
    let transmittanceVisual = 1.0
    let accColorCanonical = 0
    let accColorVisual = 0

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const z = -BOUND_R + (i + 0.5) * stepLen

      const rhoC = computeDensity3D(0, 0, z, 0, preset, omega, ho1D_canonical)
      const rhoV = computeDensity3D(0, 0, z, 0, preset, omega, ho1D_visual)

      const alphaC = computeAlpha(rhoC, stepLen, DENSITY_GAIN)
      const alphaV = computeAlpha(rhoV, stepLen, DENSITY_GAIN)

      accColorCanonical += transmittanceCanonical * alphaC
      accColorVisual += transmittanceVisual * alphaV

      transmittanceCanonical *= (1 - alphaC)
      transmittanceVisual *= (1 - alphaV)
    }

    const totalAlphaCanonical = 1 - transmittanceCanonical
    const totalAlphaVisual = 1 - transmittanceVisual

    console.log('=== VOLUME RAYMARCHING THROUGH CENTER ===')
    console.log('Total alpha (canonical/NEW):', totalAlphaCanonical.toFixed(6))
    console.log('Total alpha (visual/OLD):   ', totalAlphaVisual.toFixed(6))
    console.log('Acc color (canonical/NEW):  ', accColorCanonical.toFixed(6))
    console.log('Acc color (visual/OLD):     ', accColorVisual.toFixed(6))
    console.log('')

    // Discard threshold in shader is alpha < 0.01
    console.log('Would be DISCARDED (canonical)?', totalAlphaCanonical < 0.01 ? 'YES - INVISIBLE!' : 'no - visible')
    console.log('Would be DISCARDED (visual)?   ', totalAlphaVisual < 0.01 ? 'YES - INVISIBLE!' : 'no - visible')

    // The canonical normalization should still produce visible output
    // If this fails, the normalization change is the root cause
    if (totalAlphaCanonical < 0.01) {
      console.error('!!! CANONICAL NORMALIZATION PRODUCES INVISIBLE OUTPUT !!!')
      console.error('This is likely the root cause of the "3 thin black lines" bug.')
    }

    // We just want to know - don't assert yet
    expect(true).toBe(true)
  })

  it('should compare ho1D peak values per quantum number', () => {
    console.log('=== ho1D PEAK VALUE COMPARISON (omega=1.0) ===')
    console.log('n | canonical peak | visual peak | ratio')
    console.log('--|----------------|-------------|------')

    for (let n = 0; n <= 6; n++) {
      // Scan x to find peak of |phi_n(x)|
      let peakC = 0
      let peakV = 0
      for (let ix = 0; ix < 1000; ix++) {
        const x = -4 + ix * 0.008
        peakC = Math.max(peakC, Math.abs(ho1D_canonical(n, x, 1.0)))
        peakV = Math.max(peakV, Math.abs(ho1D_visual(n, x, 1.0)))
      }
      const ratio = peakC / peakV
      console.log(`${n} | ${peakC.toExponential(4).padStart(14)} | ${peakV.toExponential(4).padStart(11)} | ${ratio.toFixed(4)}`)
    }
  })

  it('should simulate with ADAPTIVE stepping (matching actual shader)', () => {
    const omega = preset.omega
    const baseStepLen = (2 * BOUND_R) / SAMPLE_COUNT

    // March rays at different offsets from center
    const offsets = [
      { label: 'center (0,0)', x: 0, y: 0 },
      { label: 'slight off (0.3, 0)', x: 0.3, y: 0 },
      { label: 'moderate off (0.7, 0)', x: 0.7, y: 0 },
      { label: 'edge (1.2, 0)', x: 1.2, y: 0 },
      { label: 'far (1.8, 0)', x: 1.8, y: 0 },
    ]

    console.log('=== ADAPTIVE STEPPING RAYMARCHING ===')
    console.log('offset           | alpha(NEW) | alpha(OLD) | NEW visible?')
    console.log('-----------------|------------|------------|-------------')

    for (const { label, x, y } of offsets) {
      let transC = 1.0, transV = 1.0
      let t = -BOUND_R

      // Simulate sphere intersection
      const r2 = x * x + y * y
      if (r2 >= BOUND_R * BOUND_R) {
        console.log(`${label.padEnd(17)}| no sphere intersection`)
        continue
      }
      const tHalf = Math.sqrt(BOUND_R * BOUND_R - r2)
      const tNear = -tHalf
      const tFar = tHalf
      t = tNear

      let steps = 0
      while (t < tFar && steps < SAMPLE_COUNT) {
        const z = t
        const rhoC = computeDensity3D(x, y, z, 0, preset, omega, ho1D_canonical)
        const rhoV = computeDensity3D(x, y, z, 0, preset, omega, ho1D_visual)

        // sCenter = log(rho) for adaptive stepping
        const sC = rhoC > 1e-20 ? Math.log(rhoC) : -46
        const sV = rhoV > 1e-20 ? Math.log(rhoV) : -46

        // Adaptive step multiplier (matching shader)
        let multC = 1.0
        if (sC < -12) multC = 4.0
        else if (sC < -8) multC = 2.0

        let multV = 1.0
        if (sV < -12) multV = 4.0
        else if (sV < -8) multV = 2.0

        const adaptStepC = Math.min(baseStepLen * multC, tFar - t)
        const adaptStepV = Math.min(baseStepLen * multV, tFar - t)

        // Use the CANONICAL adaptive step for BOTH to simulate the actual shader
        // (shader doesn't know about "old" normalization)
        const alphaC = computeAlpha(rhoC, adaptStepC, DENSITY_GAIN)
        const alphaV = computeAlpha(rhoV, adaptStepV, DENSITY_GAIN)

        transC *= (1 - alphaC)
        transV *= (1 - alphaV)

        // Use canonical adaptive step for stepping (shader uses one path)
        t += adaptStepC
        steps++
      }

      const totalC = 1 - transC
      const totalV = 1 - transV
      const visC = totalC < 0.01 ? 'DISCARDED' : `visible (${totalC.toFixed(3)})`
      console.log(`${label.padEnd(17)}| ${totalC.toFixed(6).padStart(10)} | ${totalV.toFixed(6).padStart(10)} | ${visC}`)
    }
  })

  it('should verify the 3D density product for all-zeros quantum state', () => {
    // n=(0,0,0) is the ground state - should be a simple Gaussian
    const omega = [1.0, 1.0, 1.0]
    const groundPreset = {
      termCount: 1,
      omega,
      quantumNumbers: [[0, 0, 0]],
      coefficients: [[1.0, 0.0]] as [number, number][],
      energies: [1.5], // E = sum(omega * (n+0.5)) = 3 * 0.5 = 1.5
    }

    const rhoCenterC = computeDensity3D(0, 0, 0, 0, groundPreset, omega, ho1D_canonical)
    const rhoCenterV = computeDensity3D(0, 0, 0, 0, groundPreset, omega, ho1D_visual)

    console.log('=== GROUND STATE (0,0,0) CENTER DENSITY ===')
    console.log('Canonical (new):', rhoCenterC.toExponential(6))
    console.log('Visual (old):   ', rhoCenterV.toExponential(6))
    console.log('Ratio:          ', (rhoCenterC / rhoCenterV).toFixed(4))

    // Theoretical canonical peak: (alpha/pi)^(3/2) = (1/pi)^(3/2) = 0.1795
    console.log('Theoretical canonical:', Math.pow(1/Math.PI, 1.5).toExponential(6))
  })

  it('should verify auto-compensation restores visual density', () => {
    const omega = preset.omega

    // === Reproduce the renderer's computeCanonicalCompensation() ===
    function computeCanonicalCompensation(
      p: ReturnType<typeof generateQuantumPreset>,
      dim: number
    ): number {
      if (p.termCount === 0) return 1.0

      // Find dominant term
      let dominantIdx = 0
      let maxMag = 0
      for (let k = 0; k < p.termCount; k++) {
        const [cRe, cIm] = p.coefficients[k]
        const mag = cRe * cRe + cIm * cIm
        if (mag > maxMag) { maxMag = mag; dominantIdx = k }
      }

      const qn = p.quantumNumbers[dominantIdx]
      let ratioProduct = 1.0
      for (let j = 0; j < Math.min(dim, qn.length); j++) {
        const n = qn[j]
        if (n < 0 || n > 6) continue
        const alpha = Math.sqrt(Math.max(p.omega[j] ?? 1.0, 0.01))
        const alphaNorm = Math.sqrt(Math.sqrt(alpha * INV_PI))
        const norm = HO_NORM[n]
        const damp = 1.0 / (1.0 + 0.15 * n * n)
        const ratio = damp / (alphaNorm * norm)
        ratioProduct *= ratio * ratio
      }
      return ratioProduct
    }

    const compensation = computeCanonicalCompensation(preset, DIM)
    const userDensityGain = DENSITY_GAIN // 2.0
    const effectiveDensityGain = userDensityGain * compensation

    console.log('=== AUTO-COMPENSATION VERIFICATION ===')
    console.log('Compensation factor:', compensation.toFixed(4))
    console.log('User densityGain:   ', userDensityGain)
    console.log('Effective densityGain:', effectiveDensityGain.toFixed(4))

    // Now raycast center with the effective gain
    const stepLen = (2 * BOUND_R) / SAMPLE_COUNT
    let transCompensated = 1.0
    let transOld = 1.0

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const z = -BOUND_R + (i + 0.5) * stepLen
      const rhoC = computeDensity3D(0, 0, z, 0, preset, omega, ho1D_canonical)
      const rhoV = computeDensity3D(0, 0, z, 0, preset, omega, ho1D_visual)

      const alphaCompensated = computeAlpha(rhoC, stepLen, effectiveDensityGain)
      const alphaOld = computeAlpha(rhoV, stepLen, userDensityGain)

      transCompensated *= (1 - alphaCompensated)
      transOld *= (1 - alphaOld)
    }

    const totalCompensated = 1 - transCompensated
    const totalOld = 1 - transOld

    console.log('Total alpha (compensated canonical):', totalCompensated.toFixed(6))
    console.log('Total alpha (old visual):           ', totalOld.toFixed(6))
    console.log('Match ratio:                        ', (totalCompensated / totalOld).toFixed(4))

    // The compensated canonical should produce similar visual output to the old visual
    // Allow some tolerance since compensation uses dominant-term approximation
    expect(totalCompensated).toBeGreaterThan(0.5) // Was 0.106 without compensation
    expect(totalCompensated / totalOld).toBeGreaterThan(0.8) // Within 20%
    expect(totalCompensated / totalOld).toBeLessThan(1.2)
  })
})
