/**
 * Tests for quantum mode switching and quantum number interdependencies.
 *
 * These setters contain critical physics constraints:
 * - Quantum numbers must satisfy 0 <= l < n, -l <= m <= l
 * - Changing n auto-clamps l and m to maintain validity
 * - Switching quantum modes forces dimension/representation constraints
 * - Mode switching triggers array resizing for compute modes
 *
 * Bugs here silently produce invalid physics states.
 */

import fc from 'fast-check'
import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

describe('quantum number interdependency clamping', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('setting n clamps l to n-1 when l >= n', () => {
    const store = useExtendedObjectStore.getState()
    // Start with n=5, l=4 (valid: l < n)
    store.setSchroedingerPrincipalQuantumNumber(5)
    store.setSchroedingerAzimuthalQuantumNumber(4)
    expect(useExtendedObjectStore.getState().schroedinger.azimuthalQuantumNumber).toBe(4)

    // Reduce n to 3 — l must clamp to n-1 = 2
    store.setSchroedingerPrincipalQuantumNumber(3)
    expect(useExtendedObjectStore.getState().schroedinger.azimuthalQuantumNumber).toBe(2)
  })

  it('setting n clamps m when l gets clamped', () => {
    const store = useExtendedObjectStore.getState()
    // Start with n=5, l=4, m=-3 (valid: -4 <= -3 <= 4)
    store.setSchroedingerPrincipalQuantumNumber(5)
    store.setSchroedingerAzimuthalQuantumNumber(4)
    store.setSchroedingerMagneticQuantumNumber(-3)
    expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(-3)

    // Reduce n to 2 → l clamps to 1 → m clamps to max(-1, min(1, -3)) = -1
    store.setSchroedingerPrincipalQuantumNumber(2)
    const s = useExtendedObjectStore.getState().schroedinger
    expect(s.principalQuantumNumber).toBe(2)
    expect(s.azimuthalQuantumNumber).toBe(1)
    expect(s.magneticQuantumNumber).toBe(-1)
  })

  it('setting l clamps m to [-l, l]', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerPrincipalQuantumNumber(5)
    store.setSchroedingerAzimuthalQuantumNumber(4)
    store.setSchroedingerMagneticQuantumNumber(4)

    // Reduce l to 2 → m clamps from 4 to 2
    store.setSchroedingerAzimuthalQuantumNumber(2)
    expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(2)
  })

  it('setting l clamps negative m correctly', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerPrincipalQuantumNumber(5)
    store.setSchroedingerAzimuthalQuantumNumber(4)
    store.setSchroedingerMagneticQuantumNumber(-4)

    // Reduce l to 1 → m clamps from -4 to -1
    store.setSchroedingerAzimuthalQuantumNumber(1)
    expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(-1)
  })

  it('n=1 forces l=0 and m=0', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerPrincipalQuantumNumber(5)
    store.setSchroedingerAzimuthalQuantumNumber(3)
    store.setSchroedingerMagneticQuantumNumber(2)

    store.setSchroedingerPrincipalQuantumNumber(1)
    const s = useExtendedObjectStore.getState().schroedinger
    expect(s.principalQuantumNumber).toBe(1)
    expect(s.azimuthalQuantumNumber).toBe(0)
    expect(s.magneticQuantumNumber).toBe(0)
  })

  it('raising |m| raises coupled-hydrogen angular chain entries to keep l(D-2) >= |m|', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerPrincipalQuantumNumber(5)
    store.setSchroedingerAzimuthalQuantumNumber(3)
    store.setSchroedingerAngularChainValue(0, 1)
    store.setSchroedingerAngularChainValue(1, 0)

    store.setSchroedingerMagneticQuantumNumber(-2)

    const s = useExtendedObjectStore.getState().schroedinger
    expect(s.magneticQuantumNumber).toBe(-2)
    expect(s.angularChain.slice(0, 2)).toEqual([2, 2])
  })

  it('refuses to lower coupled-hydrogen angular chain below |m|', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerPrincipalQuantumNumber(5)
    store.setSchroedingerAzimuthalQuantumNumber(3)
    store.setSchroedingerMagneticQuantumNumber(2)

    store.setSchroedingerAngularChainValue(0, 0)
    store.setSchroedingerAngularChainValue(1, 0)

    expect(useExtendedObjectStore.getState().schroedinger.angularChain.slice(0, 2)).toEqual([2, 2])
  })

  it('normalizes coupled-hydrogen angular chain through bulk config updates', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerQuantumMode('hydrogenNDCoupled')

    store.setSchroedingerConfig({
      principalQuantumNumber: 5,
      azimuthalQuantumNumber: 3,
      magneticQuantumNumber: 2,
      angularChain: [1, 0],
    })

    expect(useExtendedObjectStore.getState().schroedinger.angularChain.slice(0, 2)).toEqual([2, 2])
  })

  it('maintains invariant after arbitrary sequence of quantum number changes', () => {
    const store = useExtendedObjectStore.getState()
    const sequence: Array<[string, number]> = [
      ['n', 7],
      ['l', 6],
      ['m', -5],
      ['n', 3],
      ['m', 2],
      ['l', 0],
      ['n', 1],
      ['n', 4],
      ['l', 3],
      ['m', -3],
      ['l', 1],
      ['n', 2],
    ]

    for (const [field, value] of sequence) {
      if (field === 'n') store.setSchroedingerPrincipalQuantumNumber(value)
      else if (field === 'l') store.setSchroedingerAzimuthalQuantumNumber(value)
      else store.setSchroedingerMagneticQuantumNumber(value)

      const s = useExtendedObjectStore.getState().schroedinger
      // Invariant must hold after every step
      expect(s.principalQuantumNumber).toBeGreaterThanOrEqual(1)
      expect(s.principalQuantumNumber).toBeLessThanOrEqual(7)
      expect(s.azimuthalQuantumNumber).toBeGreaterThanOrEqual(0)
      expect(s.azimuthalQuantumNumber).toBeLessThan(s.principalQuantumNumber)
      expect(s.magneticQuantumNumber).toBeGreaterThanOrEqual(-s.azimuthalQuantumNumber)
      expect(s.magneticQuantumNumber).toBeLessThanOrEqual(s.azimuthalQuantumNumber)
    }
  })
})

describe('quantum mode switching', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('switching to TDSE forces position representation', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')

    store.setSchroedingerQuantumMode('tdseDynamics')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('switching to BEC forces dimension >= 3', () => {
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('becDynamics')
    expect(useGeometryStore.getState().dimension).toBeGreaterThanOrEqual(3)
  })

  it('switching to compute mode disables cross-section', () => {
    const store = useExtendedObjectStore.getState()
    // Enable cross-section in HO mode
    store.setSchroedingerQuantumMode('harmonicOscillator')
    store.setSchroedingerCrossSectionEnabled(true)
    expect(useExtendedObjectStore.getState().schroedinger.crossSectionEnabled).toBe(true)

    // Switch to TDSE — should disable cross-section
    store.setSchroedingerQuantumMode('tdseDynamics')
    expect(useExtendedObjectStore.getState().schroedinger.crossSectionEnabled).toBe(false)
  })

  it('cannot set momentum representation in compute modes', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerQuantumMode('tdseDynamics')

    store.setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')

    store.setSchroedingerRepresentation('wigner')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('switching modes back to HO restores representation freedom', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerQuantumMode('tdseDynamics')
    store.setSchroedingerQuantumMode('harmonicOscillator')

    store.setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')
  })

  it('blocks momentum representation for hydrogenNDCoupled (shader is position-only)', () => {
    const store = useExtendedObjectStore.getState()
    useGeometryStore.getState().setDimension(4)
    store.setSchroedingerQuantumMode('hydrogenNDCoupled')

    store.setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')

    // wigner should still work for coupled hydrogen
    store.setSchroedingerRepresentation('wigner')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('wigner')
  })

  it('blocks non-position representation for hydrogenND at dim=2', () => {
    const store = useExtendedObjectStore.getState()
    useGeometryStore.getState().setDimension(2)
    store.setSchroedingerQuantumMode('hydrogenND')

    store.setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')

    store.setSchroedingerRepresentation('wigner')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('allows non-position representation for hydrogenND at dim >= 3', () => {
    const store = useExtendedObjectStore.getState()
    useGeometryStore.getState().setDimension(3)
    store.setSchroedingerQuantumMode('hydrogenND')

    store.setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')
  })

  it('switching to hydrogenNDCoupled forces position if currently momentum', () => {
    const store = useExtendedObjectStore.getState()
    useGeometryStore.getState().setDimension(4)
    store.setSchroedingerQuantumMode('hydrogenND')
    store.setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')

    // Switching to coupled must force position — coupled shader is position-only for momentum
    store.setSchroedingerQuantumMode('hydrogenNDCoupled')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('switching to hydrogenNDCoupled preserves wigner representation', () => {
    const store = useExtendedObjectStore.getState()
    useGeometryStore.getState().setDimension(4)
    store.setSchroedingerQuantumMode('hydrogenND')
    store.setSchroedingerRepresentation('wigner')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('wigner')

    // Coupled hydrogen supports wigner — should be preserved
    store.setSchroedingerQuantumMode('hydrogenNDCoupled')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('wigner')
  })

  it('round-trip through all modes preserves config', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerPrincipalQuantumNumber(4)
    store.setSchroedingerAzimuthalQuantumNumber(2)
    store.setSchroedingerMagneticQuantumNumber(-1)

    const modes = [
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
      'freeScalarField',
      'harmonicOscillator',
    ] as const
    for (const mode of modes) {
      store.setSchroedingerQuantumMode(mode)
    }

    // After returning to HO mode, hydrogen quantum numbers should be preserved
    const s = useExtendedObjectStore.getState().schroedinger
    expect(s.principalQuantumNumber).toBe(4)
    expect(s.azimuthalQuantumNumber).toBe(2)
    expect(s.magneticQuantumNumber).toBe(-1)
  })

  it('bumps version on each mode switch', () => {
    const store = useExtendedObjectStore.getState()
    const v0 = useExtendedObjectStore.getState().schroedingerVersion
    store.setSchroedingerQuantumMode('tdseDynamics')
    const v1 = useExtendedObjectStore.getState().schroedingerVersion
    store.setSchroedingerQuantumMode('harmonicOscillator')
    const v2 = useExtendedObjectStore.getState().schroedingerVersion
    expect(v1).toBeGreaterThan(v0)
    expect(v2).toBeGreaterThan(v1)
  })
})

describe('hydrogen ND presets', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('loading a preset sets quantum numbers correctly', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerHydrogenNDPreset('3dz2_4d')
    const s = useExtendedObjectStore.getState().schroedinger
    expect(s.hydrogenNDPreset).toBe('3dz2_4d')
    expect(s.principalQuantumNumber).toBe(3)
    expect(s.azimuthalQuantumNumber).toBe(2)
    // Preset should satisfy quantum number constraints
    expect(s.azimuthalQuantumNumber).toBeLessThan(s.principalQuantumNumber)
    expect(Math.abs(s.magneticQuantumNumber)).toBeLessThanOrEqual(s.azimuthalQuantumNumber)
  })

  it('modifying quantum numbers after preset resets to custom', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerHydrogenNDPreset('2pz_4d')
    expect(useExtendedObjectStore.getState().schroedinger.hydrogenNDPreset).toBe('2pz_4d')

    store.setSchroedingerPrincipalQuantumNumber(5)
    expect(useExtendedObjectStore.getState().schroedinger.hydrogenNDPreset).toBe('custom')
  })

  it('setting preset to custom does not change quantum numbers', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerPrincipalQuantumNumber(5)
    store.setSchroedingerAzimuthalQuantumNumber(3)

    store.setSchroedingerHydrogenNDPreset('custom')
    const s = useExtendedObjectStore.getState().schroedinger
    expect(s.principalQuantumNumber).toBe(5)
    expect(s.azimuthalQuantumNumber).toBe(3)
  })
})

describe('extra dimension quantum numbers', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('clamps individual extra dim quantum numbers to [0, 6]', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerExtraDimQuantumNumber(0, -1)
    expect(useExtendedObjectStore.getState().schroedinger.extraDimQuantumNumbers[0]).toBe(0)

    store.setSchroedingerExtraDimQuantumNumber(0, 10)
    expect(useExtendedObjectStore.getState().schroedinger.extraDimQuantumNumbers[0]).toBe(6)
  })

  it('rejects out-of-range dimension index', () => {
    const store = useExtendedObjectStore.getState()
    const before = [...useExtendedObjectStore.getState().schroedinger.extraDimQuantumNumbers]
    store.setSchroedingerExtraDimQuantumNumber(-1, 3)
    store.setSchroedingerExtraDimQuantumNumber(8, 3)
    expect(useExtendedObjectStore.getState().schroedinger.extraDimQuantumNumbers).toEqual(before)
  })

  it('bulk set clamps and pads to 8 elements', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerExtraDimQuantumNumbers([1, 2, 3])
    const nums = useExtendedObjectStore.getState().schroedinger.extraDimQuantumNumbers
    expect(nums).toHaveLength(8)
    expect(nums[0]).toBe(1)
    expect(nums[1]).toBe(2)
    expect(nums[2]).toBe(3)
    expect(nums[3]).toBe(0)
  })

  it('clamps extra dim omega to [0.1, 2.0]', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerExtraDimOmega(0, 0.01)
    expect(useExtendedObjectStore.getState().schroedinger.extraDimOmega[0]).toBe(0.1)

    store.setSchroedingerExtraDimOmega(0, 5.0)
    expect(useExtendedObjectStore.getState().schroedinger.extraDimOmega[0]).toBe(2.0)
  })
})

describe('quantum number invariant — property-based', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('invariant 0 <= l < n, -l <= m <= l holds for arbitrary operation sequences', () => {
    type Op = { type: 'n' | 'l' | 'm'; value: number }
    const arbOp: fc.Arbitrary<Op> = fc.oneof(
      fc.integer({ min: -2, max: 10 }).map((v) => ({ type: 'n' as const, value: v })),
      fc.integer({ min: -2, max: 10 }).map((v) => ({ type: 'l' as const, value: v })),
      fc.integer({ min: -10, max: 10 }).map((v) => ({ type: 'm' as const, value: v }))
    )
    const arbOps = fc.array(arbOp, { minLength: 1, maxLength: 20 })

    fc.assert(
      fc.property(arbOps, (ops) => {
        useExtendedObjectStore.getState().reset()
        const store = useExtendedObjectStore.getState()

        for (const op of ops) {
          if (op.type === 'n') store.setSchroedingerPrincipalQuantumNumber(op.value)
          else if (op.type === 'l') store.setSchroedingerAzimuthalQuantumNumber(op.value)
          else store.setSchroedingerMagneticQuantumNumber(op.value)

          const s = useExtendedObjectStore.getState().schroedinger
          // Invariant must hold after EVERY operation
          expect(s.principalQuantumNumber).toBeGreaterThanOrEqual(1)
          expect(s.principalQuantumNumber).toBeLessThanOrEqual(7)
          expect(s.azimuthalQuantumNumber).toBeGreaterThanOrEqual(0)
          expect(s.azimuthalQuantumNumber).toBeLessThan(s.principalQuantumNumber)
          expect(s.magneticQuantumNumber).toBeGreaterThanOrEqual(-s.azimuthalQuantumNumber)
          expect(s.magneticQuantumNumber).toBeLessThanOrEqual(s.azimuthalQuantumNumber)
        }
      }),
      { numRuns: 100 }
    )
  })
})
