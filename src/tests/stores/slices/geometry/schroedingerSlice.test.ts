/**
 * Tests for schroedingerSlice — quantum number validation,
 * mode switching, and clamping behavior.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('schroedingerSlice — quantum number constraints', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
  })

  function getSchroedinger() {
    return useExtendedObjectStore.getState().schroedinger
  }

  describe('setSchroedingerPrincipalQuantumNumber', () => {
    it('clamps n to [1, 7]', () => {
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(0)
      expect(getSchroedinger().principalQuantumNumber).toBe(1)

      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(10)
      expect(getSchroedinger().principalQuantumNumber).toBe(7)
    })

    it('floors fractional n values', () => {
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(3.9)
      expect(getSchroedinger().principalQuantumNumber).toBe(3)
    })

    it('cascades l down when n decreases: l clamped to n-1', () => {
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(5)
      useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(4)
      expect(getSchroedinger().azimuthalQuantumNumber).toBe(4)

      // Decrease n to 3 → l should clamp to 2
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(3)
      expect(getSchroedinger().azimuthalQuantumNumber).toBe(2)
    })

    it('cascades m down when l decreases due to n change', () => {
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(5)
      useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(4)
      useExtendedObjectStore.getState().setSchroedingerMagneticQuantumNumber(3)
      expect(getSchroedinger().magneticQuantumNumber).toBe(3)

      // Decrease n to 3 → l clamps to 2 → m clamps to 2
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(3)
      expect(getSchroedinger().azimuthalQuantumNumber).toBe(2)
      expect(getSchroedinger().magneticQuantumNumber).toBe(2)
    })

    it('ignores NaN', () => {
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(3)
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(Number.NaN)
      expect(getSchroedinger().principalQuantumNumber).toBe(3)
    })

    it('marks preset as custom', () => {
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(4)
      expect(getSchroedinger().hydrogenNDPreset).toBe('custom')
    })
  })

  describe('setSchroedingerAzimuthalQuantumNumber', () => {
    it('clamps l to [0, n-1]', () => {
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(3)

      useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(-1)
      expect(getSchroedinger().azimuthalQuantumNumber).toBe(0)

      useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(5)
      expect(getSchroedinger().azimuthalQuantumNumber).toBe(2) // n-1 = 2
    })

    it('cascades m when l decreases', () => {
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(5)
      useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(4)
      useExtendedObjectStore.getState().setSchroedingerMagneticQuantumNumber(-3)

      // Decrease l to 2 → m clamps from -3 to -2
      useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(2)
      expect(getSchroedinger().magneticQuantumNumber).toBe(-2)
    })
  })

  describe('setSchroedingerMagneticQuantumNumber', () => {
    it('clamps m to [-l, l]', () => {
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(4)
      useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(2)

      useExtendedObjectStore.getState().setSchroedingerMagneticQuantumNumber(-5)
      expect(getSchroedinger().magneticQuantumNumber).toBe(-2)

      useExtendedObjectStore.getState().setSchroedingerMagneticQuantumNumber(5)
      expect(getSchroedinger().magneticQuantumNumber).toBe(2)

      useExtendedObjectStore.getState().setSchroedingerMagneticQuantumNumber(0)
      expect(getSchroedinger().magneticQuantumNumber).toBe(0)
    })
  })
})

describe('schroedingerSlice — scale clamping', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('setSchroedingerScale clamps to [0.1, 2.0]', () => {
    useExtendedObjectStore.getState().setSchroedingerScale(0.01)
    expect(useExtendedObjectStore.getState().schroedinger.scale).toBe(0.1)

    useExtendedObjectStore.getState().setSchroedingerScale(5.0)
    expect(useExtendedObjectStore.getState().schroedinger.scale).toBe(2.0)

    useExtendedObjectStore.getState().setSchroedingerScale(1.5)
    expect(useExtendedObjectStore.getState().schroedinger.scale).toBe(1.5)
  })

  it('setSchroedingerScale ignores NaN and Infinity', () => {
    useExtendedObjectStore.getState().setSchroedingerScale(1.0)
    useExtendedObjectStore.getState().setSchroedingerScale(Number.NaN)
    expect(useExtendedObjectStore.getState().schroedinger.scale).toBe(1.0)

    useExtendedObjectStore.getState().setSchroedingerScale(Number.POSITIVE_INFINITY)
    expect(useExtendedObjectStore.getState().schroedinger.scale).toBe(1.0)
  })
})

describe('schroedingerSlice — mode switching', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
  })

  it('switching to BEC forces dimension >= 3', () => {
    useGeometryStore.getState().setDimension(2)

    useExtendedObjectStore.getState().setSchroedingerQuantumMode('becDynamics')
    expect(useGeometryStore.getState().dimension).toBeGreaterThanOrEqual(3)
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('becDynamics')
  })

  it('TDSE forces dimension 3 minimum (no 2D grid rendering path)', () => {
    useGeometryStore.getState().setDimension(2)

    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
    expect(useGeometryStore.getState().dimension).toBe(3)
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
  })

  it('switching to freeScalarField resets representation to position', () => {
    // Set to momentum first
    useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')

    // Switch to freeScalarField → should force position
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('compute modes block momentum/wigner representation', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')

    // Trying to set momentum should be a no-op
    useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')

    useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('analytic modes allow momentum representation', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
    useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')
  })
})

describe('schroedingerSlice — dimension initialization contract', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
  })

  it('clamps direct finite initialization dimensions to supported bounds', () => {
    const store = useExtendedObjectStore.getState()

    store.initializeSchroedingerForDimension(100)
    expect(useExtendedObjectStore.getState().schroedinger.center).toHaveLength(MAX_DIMENSION)
    expect(useExtendedObjectStore.getState().schroedinger.parameterValues).toHaveLength(
      MAX_DIMENSION - 3
    )

    store.initializeSchroedingerForDimension(1)
    expect(useExtendedObjectStore.getState().schroedinger.center).toHaveLength(MIN_DIMENSION)
    expect(useExtendedObjectStore.getState().schroedinger.parameterValues).toHaveLength(0)
  })

  it('ignores non-finite direct initialization dimensions without throwing', () => {
    const store = useExtendedObjectStore.getState()
    store.initializeSchroedingerForDimension(4)
    const before = useExtendedObjectStore.getState().schroedinger

    expect(() => store.initializeSchroedingerForDimension(Number.NaN)).not.toThrow()
    expect(() => store.initializeSchroedingerForDimension(Number.POSITIVE_INFINITY)).not.toThrow()

    const after = useExtendedObjectStore.getState().schroedinger
    expect(after.center).toEqual(before.center)
    expect(after.parameterValues).toEqual(before.parameterValues)
  })

  it('ignores non-finite direct compute lattice sync dimensions without throwing', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerQuantumMode('freeScalarField')
    store.syncActiveComputeModeLatticeDim(4)
    const before = useExtendedObjectStore.getState().schroedinger.freeScalar

    expect(() => store.syncActiveComputeModeLatticeDim(Number.NaN)).not.toThrow()
    expect(() => store.syncActiveComputeModeLatticeDim(Number.NEGATIVE_INFINITY)).not.toThrow()

    const after = useExtendedObjectStore.getState().schroedinger.freeScalar
    expect(after.latticeDim).toBe(before.latticeDim)
    expect(after.gridSize).toEqual(before.gridSize)
    expect(after.spacing).toEqual(before.spacing)
  })
})

describe('schroedingerSlice — clamped setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('setSchroedingerDensityGain clamps to [0.1, 5.0]', () => {
    useExtendedObjectStore.getState().setSchroedingerDensityGain(0.01)
    expect(useExtendedObjectStore.getState().schroedinger.densityGain).toBe(0.1)

    useExtendedObjectStore.getState().setSchroedingerDensityGain(10)
    expect(useExtendedObjectStore.getState().schroedinger.densityGain).toBe(5.0)
  })

  it('setSchroedingerSampleCount clamps to [16, 128]', () => {
    useExtendedObjectStore.getState().setSchroedingerSampleCount(1)
    expect(useExtendedObjectStore.getState().schroedinger.sampleCount).toBe(16)

    useExtendedObjectStore.getState().setSchroedingerSampleCount(500)
    expect(useExtendedObjectStore.getState().schroedinger.sampleCount).toBe(128)
  })

  it('setSchroedingerMomentumScale clamps to [0.1, 4.0]', () => {
    useExtendedObjectStore.getState().setSchroedingerMomentumScale(0.01)
    expect(useExtendedObjectStore.getState().schroedinger.momentumScale).toBe(0.1)

    useExtendedObjectStore.getState().setSchroedingerMomentumScale(10)
    expect(useExtendedObjectStore.getState().schroedinger.momentumScale).toBe(4.0)
  })

  it('setSchroedingerBohrRadiusScale clamps and rejects NaN', () => {
    useExtendedObjectStore.getState().setSchroedingerBohrRadiusScale(1.5)
    expect(useExtendedObjectStore.getState().schroedinger.bohrRadiusScale).toBe(1.5)

    useExtendedObjectStore.getState().setSchroedingerBohrRadiusScale(Number.NaN)
    expect(useExtendedObjectStore.getState().schroedinger.bohrRadiusScale).toBe(1.5)
  })

  it('setSchroedingerTermCount clamps to [1, 8]', () => {
    useExtendedObjectStore.getState().setSchroedingerTermCount(0)
    expect(useExtendedObjectStore.getState().schroedinger.termCount).toBe(1)

    useExtendedObjectStore.getState().setSchroedingerTermCount(20)
    expect(useExtendedObjectStore.getState().schroedinger.termCount).toBe(8)
  })

  it('setSchroedingerConfig sanitizes harmonic oscillator scalar controls', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerConfig({
      seed: 42.9,
      termCount: 99,
      maxQuantumNumber: 99,
      frequencySpread: -2,
    })

    expect(useExtendedObjectStore.getState().schroedinger.seed).toBe(42)
    expect(useExtendedObjectStore.getState().schroedinger.termCount).toBe(8)
    expect(useExtendedObjectStore.getState().schroedinger.maxQuantumNumber).toBe(6)
    expect(useExtendedObjectStore.getState().schroedinger.frequencySpread).toBe(0)

    store.setSchroedingerConfig({
      seed: Number.NaN,
      termCount: Number.POSITIVE_INFINITY,
      maxQuantumNumber: Number.NEGATIVE_INFINITY,
      frequencySpread: Number.NaN,
    })

    expect(useExtendedObjectStore.getState().schroedinger.seed).toBe(42)
    expect(useExtendedObjectStore.getState().schroedinger.termCount).toBe(8)
    expect(useExtendedObjectStore.getState().schroedinger.maxQuantumNumber).toBe(6)
    expect(useExtendedObjectStore.getState().schroedinger.frequencySpread).toBe(0)
  })

  it('version increments on each state change', () => {
    const v1 = useExtendedObjectStore.getState().schroedingerVersion
    useExtendedObjectStore.getState().setSchroedingerScale(1.5)
    const v2 = useExtendedObjectStore.getState().schroedingerVersion
    expect(v2).toBeGreaterThan(v1)
  })
})

describe('schroedingerSlice — quantum mode transitions', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
  })

  function getSchroedinger() {
    return useExtendedObjectStore.getState().schroedinger
  }

  const ALL_MODES = [
    'harmonicOscillator',
    'hydrogenND',
    'tdseDynamics',
    'becDynamics',
    'diracEquation',
    'quantumWalk',
    'freeScalarField',
  ] as const

  it('can switch to every quantum mode without error', () => {
    for (const mode of ALL_MODES) {
      useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
      expect(getSchroedinger().quantumMode).toBe(mode)
    }
  })

  it('switching to becDynamics has valid bec config', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('becDynamics')
    const bec = getSchroedinger().bec
    expect(bec.interactionStrength).toBeGreaterThanOrEqual(0)
    expect(bec.trapOmega).toBeGreaterThan(0)
  })

  it('switching to diracEquation has valid dirac config', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('diracEquation')
    const dirac = getSchroedinger().dirac
    expect(dirac.mass).toBeGreaterThan(0)
  })

  it('switching to quantumWalk sets quantumMode correctly', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('quantumWalk')
    expect(getSchroedinger().quantumMode).toBe('quantumWalk')
  })

  it('switching to hydrogenND sets quantumMode correctly', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')
    expect(getSchroedinger().quantumMode).toBe('hydrogenND')
  })

  it('round-trip: HO → TDSE → HO preserves harmonic oscillator state', () => {
    useExtendedObjectStore.getState().setSchroedingerTermCount(4)
    const originalTermCount = getSchroedinger().termCount
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
    expect(getSchroedinger().termCount).toBe(originalTermCount)
  })

  it('switching to freeScalarField forces position representation', () => {
    useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')
    expect(getSchroedinger().representation).toBe('position')
  })

  it('setSchroedingerDensityGain clamps and rejects NaN', () => {
    useExtendedObjectStore.getState().setSchroedingerDensityGain(5.0)
    expect(getSchroedinger().densityGain).toBe(5.0)

    useExtendedObjectStore.getState().setSchroedingerDensityGain(Number.NaN)
    expect(getSchroedinger().densityGain).toBe(5.0)
  })

  it('setSchroedingerIsoThreshold clamps to valid range', () => {
    useExtendedObjectStore.getState().setSchroedingerIsoThreshold(-3)
    expect(getSchroedinger().isoThreshold).toBe(-3)

    // Should clamp to [-6, 0] range
    useExtendedObjectStore.getState().setSchroedingerIsoThreshold(-10)
    expect(getSchroedinger().isoThreshold).toBe(-6)

    useExtendedObjectStore.getState().setSchroedingerIsoThreshold(5)
    expect(getSchroedinger().isoThreshold).toBe(0)
  })
})
