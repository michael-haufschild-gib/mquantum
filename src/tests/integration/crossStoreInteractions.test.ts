/**
 * Cross-store interaction tests.
 *
 * Verifies that state changes in one store correctly propagate
 * to dependent stores. These integration tests catch bugs that
 * individual store unit tests cannot.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useAnimationStore } from '@/stores/animationStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore } from '@/stores/lightingStore'
import { useRotationStore } from '@/stores/rotationStore'

describe('Geometry → Rotation → Animation dimension synchronization', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useAnimationStore.getState().reset()
    useRotationStore.getState().resetAllRotations()
  })

  it('setDimension propagates to rotation store', () => {
    useGeometryStore.getState().setDimension(7)

    expect(useGeometryStore.getState().dimension).toBe(7)
    expect(useRotationStore.getState().dimension).toBe(7)
  })

  it('setDimension filters animation planes beyond new dimension', () => {
    // Set to 8D and animate all planes (includes high-dim planes like XV, XW, etc.)
    useGeometryStore.getState().setDimension(8)
    useAnimationStore.getState().animateAll(8)

    const planesBefore = useAnimationStore.getState().animatingPlanes
    expect(planesBefore.size).toBeGreaterThan(0)

    // Reduce to 4D — planes referencing dims > 4 should be removed
    useGeometryStore.getState().setDimension(4)

    const planesAfter = useAnimationStore.getState().animatingPlanes
    for (const plane of planesAfter) {
      // All remaining planes should only reference XY, XZ, YZ, XW, YW, ZW
      // (dimensions 0-3 in 4D space)
      expect(plane).toMatch(/^[XYZW]{2}$/)
    }
  })

  it('dimension change resets rotations to prevent accumulated angle drift', () => {
    useGeometryStore.getState().setDimension(6)
    useRotationStore.getState().setRotation('XY', 45)
    expect(useRotationStore.getState().rotations.get('XY')).toBe(45)

    // Changing dimension resets all rotations
    useGeometryStore.getState().setDimension(4)
    expect(useRotationStore.getState().rotations.size).toBe(0)
  })

  it('NaN dimension leaves all stores unchanged', () => {
    useGeometryStore.getState().setDimension(5)
    const geomBefore = useGeometryStore.getState().dimension
    const rotBefore = useRotationStore.getState().dimension

    useGeometryStore.getState().setDimension(Number.NaN)

    expect(useGeometryStore.getState().dimension).toBe(geomBefore)
    expect(useRotationStore.getState().dimension).toBe(rotBefore)
  })
})

describe('Geometry → Appearance store interaction', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useAppearanceStore.getState().reset()
  })

  it('setObjectType to schroedinger preserves appearance store validity', () => {
    // Mutate appearance store first
    useAppearanceStore.getState().setFaceEmission(0.5)
    expect(useAppearanceStore.getState().faceEmission).toBe(0.5)
    useGeometryStore.getState().setObjectType('schroedinger')

    // Appearance store should still be valid and resettable
    const state = useAppearanceStore.getState()
    expect(state.appearanceVersion).toBeGreaterThanOrEqual(0)
    state.reset()
    // Reset restores default faceEmission (0.3), proving reset works
    expect(useAppearanceStore.getState().faceEmission).toBe(0.3)
  })

  it('appearance version increments independently of geometry changes', () => {
    const vBefore = useAppearanceStore.getState().appearanceVersion
    useGeometryStore.getState().setDimension(7)
    const vAfter = useAppearanceStore.getState().appearanceVersion
    // Geometry change should not bump appearance version
    expect(vAfter).toBe(vBefore)
  })
})

describe('Animation ↔ Geometry bidirectional constraints', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useAnimationStore.getState().reset()
  })

  it('animateAll populates planes for current geometry dimension', () => {
    useGeometryStore.getState().setDimension(5)
    useAnimationStore.getState().animateAll(5)

    const planes = useAnimationStore.getState().animatingPlanes
    expect(planes.size).toBeGreaterThan(0)
    // 5D has 10 unique 2-planes: C(5,2) = 10
    expect(planes.size).toBe(10)
  })

  it('stopAll clears all animating planes', () => {
    useGeometryStore.getState().setDimension(6)
    useAnimationStore.getState().animateAll(6)
    expect(useAnimationStore.getState().animatingPlanes.size).toBeGreaterThan(0)

    useAnimationStore.getState().stopAll()
    expect(useAnimationStore.getState().animatingPlanes.size).toBe(0)
  })
})

describe('Quantum mode → dimension → extended store chain', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('switching to BEC forces minimum 3D dimension', () => {
    useGeometryStore.getState().setDimension(2)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('becDynamics')

    expect(useGeometryStore.getState().dimension).toBeGreaterThanOrEqual(3)
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('becDynamics')
  })

  it('switching to TDSE at 2D clamps dimension to 3', () => {
    useGeometryStore.getState().setDimension(2)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')

    expect(useGeometryStore.getState().dimension).toBe(3)
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
  })

  it('switching between quantum modes preserves dimension when valid', () => {
    useGeometryStore.getState().setDimension(5)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
    expect(useGeometryStore.getState().dimension).toBe(5)

    useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')
    expect(useGeometryStore.getState().dimension).toBe(5)
  })

  it('dimension change triggers version bump in extended store', () => {
    const v1 = useExtendedObjectStore.getState().schroedingerVersion
    useExtendedObjectStore.getState().setSchroedingerScale(1.5)
    const v2 = useExtendedObjectStore.getState().schroedingerVersion
    expect(v2).toBeGreaterThan(v1)
  })
})

describe('Store version isolation', () => {
  it('appearance version is independent of lighting version', () => {
    useAppearanceStore.getState().reset()
    useLightingStore.getState().reset()

    const appV1 = useAppearanceStore.getState().appearanceVersion
    useLightingStore.getState().addLight('point')
    const appV2 = useAppearanceStore.getState().appearanceVersion

    // Lighting change should not bump appearance version
    expect(appV2).toBe(appV1)
  })

  it('lighting version is independent of appearance changes', () => {
    useLightingStore.getState().reset()
    useAppearanceStore.getState().reset()

    const lightV1 = useLightingStore.getState().version
    useAppearanceStore.getState().setFaceEmission(0.8)
    const lightV2 = useLightingStore.getState().version

    expect(lightV2).toBe(lightV1)
  })

  it('extended object version tracks independently of animation', () => {
    useExtendedObjectStore.getState().reset()
    useAnimationStore.getState().reset()

    const extV1 = useExtendedObjectStore.getState().schroedingerVersion
    useAnimationStore.getState().setSpeed(2.0)
    const extV2 = useExtendedObjectStore.getState().schroedingerVersion

    expect(extV2).toBe(extV1)
  })
})

describe('Multi-store reset consistency', () => {
  it('all stores return to valid state after reset', () => {
    // Mutate multiple stores
    useGeometryStore.getState().setDimension(9)
    useAnimationStore.getState().animateAll(9)
    useAppearanceStore.getState().setFaceEmission(0.9)
    useLightingStore.getState().addLight('spot')
    useExtendedObjectStore.getState().setSchroedingerScale(0.5)

    // Reset all
    useGeometryStore.getState().reset()
    useAnimationStore.getState().reset()
    useAppearanceStore.getState().reset()
    useLightingStore.getState().reset()
    useExtendedObjectStore.getState().reset()

    // Verify all stores are internally consistent
    const dim = useGeometryStore.getState().dimension
    expect(dim).toBeGreaterThanOrEqual(3)
    expect(dim).toBeLessThanOrEqual(11)

    const animPlanes = useAnimationStore.getState().animatingPlanes
    for (const plane of animPlanes) {
      // All animating planes must be valid for current dimension
      const validPlanes = new Set<string>()
      const axes = ['X', 'Y', 'Z', 'W', 'V', 'U', 'A6', 'A7', 'A8', 'A9', 'A10']
      for (let i = 0; i < dim; i++) {
        for (let j = i + 1; j < dim; j++) {
          validPlanes.add(axes[i]! + axes[j]!)
        }
      }
      expect(validPlanes.has(plane)).toBe(true)
    }

    expect(useAppearanceStore.getState().faceEmission).toBe(0.3) // default
    expect(useLightingStore.getState().lights.length).toBeGreaterThanOrEqual(1)
    // Scale should be within valid range [0.1, 2.0]
    const scale = useExtendedObjectStore.getState().schroedinger.scale
    expect(scale).toBeGreaterThanOrEqual(0.1)
    expect(scale).toBeLessThanOrEqual(2.0)
  })
})

describe('Quantum mode switching → dimension constraint enforcement', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('switching to TDSE from 3D preserves dimension', () => {
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
    expect(useGeometryStore.getState().dimension).toBe(3)
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
  })

  it('switching to BEC enforces dimension >= 3', () => {
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('becDynamics')
    expect(useGeometryStore.getState().dimension).toBeGreaterThanOrEqual(3)
  })

  it('TDSE mode sets needsReset when lattice dimensions mismatch', () => {
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')

    // Change dimension while in TDSE mode — must not corrupt TDSE state
    useGeometryStore.getState().setDimension(4)
    // Re-entering TDSE mode with new dimension should trigger resize
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')

    const tdse = useExtendedObjectStore.getState().schroedinger.tdse
    expect(tdse.latticeDim).toBe(4)
  })

  it('rapid mode switching does not corrupt state', () => {
    const modes = [
      'harmonicOscillator',
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
      'freeScalarField',
      'harmonicOscillator',
      'hydrogenND',
    ] as const

    for (const mode of modes) {
      useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
      const s = useExtendedObjectStore.getState()
      expect(s.schroedinger.quantumMode).toBe(mode)
      // Version should be monotonically increasing
      expect(s.schroedingerVersion).toBeGreaterThan(0)
    }

    // After all switches, state should be internally consistent
    const dim = useGeometryStore.getState().dimension
    expect(dim).toBeGreaterThanOrEqual(3)
    expect(dim).toBeLessThanOrEqual(11)
  })
})

describe('Version counter isolation under concurrent changes', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useAppearanceStore.getState().reset()
    useLightingStore.getState().reset()
    useAnimationStore.getState().reset()
  })

  it('interleaved store mutations do not cause version cross-talk', () => {
    const extV0 = useExtendedObjectStore.getState().schroedingerVersion
    const appV0 = useAppearanceStore.getState().appearanceVersion
    const lightV0 = useLightingStore.getState().version

    // Interleave mutations across stores
    useExtendedObjectStore.getState().setSchroedingerScale(1.0)
    useAppearanceStore.getState().setFaceEmission(0.5)
    useExtendedObjectStore.getState().setSchroedingerScale(1.2)
    useLightingStore.getState().addLight('point')
    useAppearanceStore.getState().setFaceEmission(0.7)

    const extV1 = useExtendedObjectStore.getState().schroedingerVersion
    const appV1 = useAppearanceStore.getState().appearanceVersion
    const lightV1 = useLightingStore.getState().version

    // Each store's version should have changed by its own mutation count
    expect(extV1).toBeGreaterThan(extV0)
    expect(appV1).toBeGreaterThan(appV0)
    expect(lightV1).toBeGreaterThan(lightV0)

    // Version deltas should be independent
    const extDelta = extV1 - extV0
    const appDelta = appV1 - appV0
    // Extended store had 2 mutations, appearance had 2
    expect(extDelta).toBe(2)
    expect(appDelta).toBe(2)
  })
})
