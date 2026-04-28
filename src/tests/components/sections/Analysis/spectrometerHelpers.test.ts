/**
 * Tests for the TDSE spectrometer panel helpers.
 *
 * These pure helpers are the entire decision layer between simulator
 * state and the user-facing FFT plot. A regression in any of them
 * silently misleads the user: incompatible-potential warnings get
 * swallowed, status copy goes stale, the harmonic-overlay ladder
 * lands on the wrong frequencies, or the plot zooms past Nyquist into
 * the FFT's no-data region. The component file (.tsx) is exercised
 * through React tests; these are the underlying unit contracts.
 */

import { describe, expect, it } from 'vitest'

import {
  buildHarmonicOverlay,
  buildPlotData,
  deriveCaptureTiming,
  derivePotentialExpectationHint,
  deriveStatusMessage,
  HARMONIC_OVERLAY_LEVELS,
  HELLER_COMPATIBLE_POTENTIALS,
  isHellerCompatiblePotential,
} from '@/components/sections/Analysis/spectrometerHelpers'
import type { TdseConfig } from '@/lib/geometry/extended/types'

describe('isHellerCompatiblePotential', () => {
  it('returns true for the documented compatible set (bound-state potentials)', () => {
    for (const p of [
      'harmonicTrap',
      'becTrap',
      'finiteWell',
      'doubleWell',
      'periodicLattice',
      'radialDoubleWell',
      'coupledAnharmonic',
    ] as const) {
      expect(isHellerCompatiblePotential(p)).toBe(true)
    }
  })

  it('returns false for scattering / driven / continuum potentials', () => {
    for (const p of ['barrier', 'step', 'free', 'driven', 'doubleSlit'] as const) {
      expect(isHellerCompatiblePotential(p as TdseConfig['potentialType'])).toBe(false)
    }
  })

  it('exported set contains exactly the 7 compatible potentials, no extras or omissions', () => {
    expect(HELLER_COMPATIBLE_POTENTIALS).toEqual(
      new Set([
        'harmonicTrap',
        'becTrap',
        'finiteWell',
        'doubleWell',
        'periodicLattice',
        'radialDoubleWell',
        'coupledAnharmonic',
      ])
    )
  })
})

describe('deriveCaptureTiming', () => {
  it('returns NaNs when buffer is null', () => {
    const out = deriveCaptureTiming(null, 0)
    expect(out.tCaptured).toBeNaN()
    expect(out.deltaOmega).toBeNaN()
    expect(out.omegaNyquist).toBeNaN()
  })

  it('returns NaNs when buffer has fewer than 2 samples', () => {
    const buf = {
      times: new Float64Array([0]),
      capacity: 1,
      count: 1,
      head: 0,
    } as unknown as Parameters<typeof deriveCaptureTiming>[0]
    const out = deriveCaptureTiming(buf, 1)
    expect(out.tCaptured).toBeNaN()
  })

  it('computes Δω = 2π/T and ω_Nyquist = π/dt for a uniformly sampled buffer', () => {
    // 10 samples from t=0 to t=9 (uniform dt=1) → T=9, dt=1.
    const times = new Float64Array(10)
    for (let i = 0; i < 10; i++) times[i] = i
    const buf = { times, capacity: 10, count: 10, head: 0 } as unknown as Parameters<
      typeof deriveCaptureTiming
    >[0]
    const out = deriveCaptureTiming(buf, 10)
    expect(out.tCaptured).toBeCloseTo(9, 12)
    expect(out.deltaOmega).toBeCloseTo((2 * Math.PI) / 9, 12)
    expect(out.omegaNyquist).toBeCloseTo(Math.PI, 12)
  })

  it('reads first/last via the rolling-buffer head when buffer is full', () => {
    // Capacity 4, count 4, head=2 → ring is [t2, t3, t0, t1] in storage,
    // chronological sequence starts at index 2.
    const times = new Float64Array([10, 11, 5, 7]) // chronological: 5, 7, 10, 11
    const buf = {
      times,
      capacity: 4,
      count: 4,
      head: 2,
    } as unknown as Parameters<typeof deriveCaptureTiming>[0]
    const out = deriveCaptureTiming(buf, 4)
    expect(out.tCaptured).toBeCloseTo(11 - 5, 12)
  })

  it('returns NaNs when measured T is non-positive (clock went backward)', () => {
    const times = new Float64Array([5, 5]) // dt=0 ⇒ T=0 ⇒ NaN
    const buf = { times, capacity: 2, count: 2, head: 0 } as unknown as Parameters<
      typeof deriveCaptureTiming
    >[0]
    const out = deriveCaptureTiming(buf, 2)
    expect(out.tCaptured).toBeNaN()
  })
})

describe('deriveStatusMessage', () => {
  const base = {
    enabled: true,
    hamiltonianTimeDependent: false,
    sampleCount: 100,
    bufferFull: false,
    minSamples: 50,
    computeAttempted: false,
    spectrumEmpty: false,
    potentialIncompatible: false,
  }

  it('time-dependent Hamiltonian wins highest priority (overrides everything)', () => {
    const msg = deriveStatusMessage({ ...base, hamiltonianTimeDependent: true })
    expect(msg.label).toMatch(/time-dependent Hamiltonian/i)
  })

  it('disabled with incompatible potential shows the warning hint', () => {
    const msg = deriveStatusMessage({
      ...base,
      enabled: false,
      potentialIncompatible: true,
    })
    expect(msg.label).toMatch(/no bound states/i)
    expect(msg.dotClass).toMatch(/warning/)
  })

  it('disabled with compatible potential shows the plain idle message', () => {
    const msg = deriveStatusMessage({ ...base, enabled: false })
    expect(msg.label).toBe('Idle')
  })

  it('compute attempted but spectrum empty signals capture corruption', () => {
    const msg = deriveStatusMessage({
      ...base,
      computeAttempted: true,
      spectrumEmpty: true,
    })
    expect(msg.label).toMatch(/Capture corrupted/)
  })

  it('insufficient samples show "Collecting N / M"', () => {
    const msg = deriveStatusMessage({ ...base, sampleCount: 25, minSamples: 50 })
    expect(msg.label).toBe('Collecting… 25 / 50 samples')
  })

  it('buffer full shows the rolling-window message', () => {
    const msg = deriveStatusMessage({ ...base, bufferFull: true })
    expect(msg.label).toMatch(/Buffer full/)
  })

  it('happy path shows "Ready — N samples"', () => {
    const msg = deriveStatusMessage({ ...base, sampleCount: 256 })
    expect(msg.label).toBe('Ready — 256 samples')
    expect(msg.dotClass).toMatch(/success/)
  })
})

describe('derivePotentialExpectationHint', () => {
  it.each([
    ['harmonicTrap', /equally spaced/],
    ['finiteWell', /bound-state peaks/],
    ['doubleWell', /tunnelling doublets/],
    ['periodicLattice', /Bloch-band/],
    ['radialDoubleWell', /near-degenerate/],
    ['coupledAnharmonic', /Anharmonic ladder/],
    ['becTrap', /Harmonic-trap eigenlevels shifted/],
    ['barrier', /Scattering potential/],
    ['driven', /disarmed/],
    ['doubleSlit', /scattering/i],
    ['andersonDisorder', /Disordered/],
  ] as const)('hints for %s match the documented copy', (potential, pattern) => {
    const hint = derivePotentialExpectationHint(potential as TdseConfig['potentialType'])
    expect(hint).toMatch(pattern)
  })

  it('returns null for "custom" (no canonical claim) and unknown values', () => {
    expect(derivePotentialExpectationHint('custom')).toBeNull()
    expect(
      derivePotentialExpectationHint('nonexistent' as unknown as TdseConfig['potentialType'])
    ).toBeNull()
  })
})

describe('buildHarmonicOverlay', () => {
  it('returns null for non-harmonic potentials', () => {
    for (const p of ['barrier', 'step', 'doubleWell', 'free'] as const) {
      expect(buildHarmonicOverlay(p as TdseConfig['potentialType'], 1, 3, undefined)).toBeNull()
    }
  })

  it('returns null when omega is zero, negative, or non-finite', () => {
    expect(buildHarmonicOverlay('harmonicTrap', 0, 3, undefined)).toBeNull()
    expect(buildHarmonicOverlay('harmonicTrap', -1, 3, undefined)).toBeNull()
    expect(buildHarmonicOverlay('harmonicTrap', NaN, 3, undefined)).toBeNull()
    expect(buildHarmonicOverlay('harmonicTrap', Infinity, 3, undefined)).toBeNull()
  })

  it('produces an 8-level isotropic 3D ladder with the documented formula E_n = ω(n + D/2)', () => {
    const overlay = buildHarmonicOverlay('harmonicTrap', 1.5, 3, undefined)!
    expect(overlay.omegas).toHaveLength(HARMONIC_OVERLAY_LEVELS)
    expect(overlay.labels).toHaveLength(HARMONIC_OVERLAY_LEVELS)
    for (let n = 0; n < HARMONIC_OVERLAY_LEVELS; n++) {
      expect(overlay.omegas[n]!).toBeCloseTo(1.5 * (n + 1.5), 12)
      expect(overlay.labels[n]).toBe(n)
    }
    expect(overlay.caption).toBe('Theory: E_n / ℏ = ω·(n + 3/2)')
  })

  it('handles becTrap the same way as harmonicTrap (both produce ladders)', () => {
    const overlay = buildHarmonicOverlay('becTrap', 1, 3, undefined)!
    expect(overlay.omegas).toHaveLength(HARMONIC_OVERLAY_LEVELS)
    expect(overlay.omegas[0]).toBeCloseTo(1 * 1.5, 12)
  })

  it('returns null when trapAnisotropy is non-uniform (anisotropic trap has no single ladder)', () => {
    expect(buildHarmonicOverlay('harmonicTrap', 1, 3, [1.0, 1.5])).toBeNull()
    expect(buildHarmonicOverlay('harmonicTrap', 1, 3, [1.0, 1.0, 0.5])).toBeNull()
  })

  it('treats uniform anisotropy as isotropic and scales the effective frequency', () => {
    // Uniform 2× anisotropy → effective omega = 2.0 → first level at 2.0 * (0 + 1.5) = 3.0
    const overlay = buildHarmonicOverlay('harmonicTrap', 1, 3, [2.0, 2.0, 2.0])!
    expect(overlay.omegas[0]).toBeCloseTo(3.0, 12)
  })

  it('treats anisotropy within 0.1% of uniform as still isotropic', () => {
    // 1.0001 vs 1.0 — within 1e-3 tolerance per source.
    const overlay = buildHarmonicOverlay('harmonicTrap', 1, 3, [1.0, 1.0001])!
    expect(overlay.omegas).toHaveLength(HARMONIC_OVERLAY_LEVELS)
    expect(overlay.omegas[0]).toBeCloseTo(1 * 1.5, 6)
  })

  it('caption embeds the dimension correctly for higher D', () => {
    const overlay = buildHarmonicOverlay('harmonicTrap', 1, 5, undefined)!
    expect(overlay.caption).toContain('5/2')
  })
})

describe('buildPlotData', () => {
  const geom = { padL: 10, padT: 10, areaW: 200, areaH: 100 }

  it('returns null when spectrum is null', () => {
    expect(buildPlotData(null, null, geom)).toBeNull()
  })

  it('returns null when spectrum power array is empty', () => {
    expect(
      buildPlotData(
        {
          omega: new Float64Array(0),
          power: new Float64Array(0),
          peaks: [],
        } as unknown as Parameters<typeof buildPlotData>[0],
        null,
        geom
      )
    ).toBeNull()
  })

  it('returns null when max power is zero (all-flat spectrum)', () => {
    const omega = new Float64Array([0, 1, 2, 3])
    const power = new Float64Array([0, 0, 0, 0])
    const result = buildPlotData(
      { omega, power, peaks: [] } as unknown as Parameters<typeof buildPlotData>[0],
      null,
      geom
    )
    expect(result).toBeNull()
  })

  it('produces a polyline string and zero-length tick array for flat-with-one-peak spectrum', () => {
    const omega = new Float64Array([0, 1, 2, 3])
    const power = new Float64Array([0, 1, 0.5, 0.1])
    const result = buildPlotData(
      {
        omega,
        power,
        peaks: [{ omega: 1, power: 1 }],
      } as unknown as Parameters<typeof buildPlotData>[0],
      null,
      geom
    )!
    expect(result.polyline.length).toBeGreaterThan(0)
    expect(result.peakMarkers.length).toBe(1)
  })

  it('clips overlay lines to the chosen omegaMax (no off-canvas labels)', () => {
    const omega = new Float64Array([0, 1, 2, 3, 4, 5])
    const power = new Float64Array([0.1, 1, 0.5, 0.3, 0.2, 0.1])
    const overlay = {
      omegas: [1, 2, 3, 100], // last value far past Nyquist
      labels: [0, 1, 2, 3],
      caption: 'test',
    }
    const result = buildPlotData(
      {
        omega,
        power,
        peaks: [{ omega: 1, power: 1 }],
      } as unknown as Parameters<typeof buildPlotData>[0],
      overlay,
      geom
    )!
    // The 100 overlay line should be clipped.
    expect(result.overlayLines.length).toBeLessThan(overlay.omegas.length)
  })
})
