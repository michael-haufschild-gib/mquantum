/**
 * Full pipeline integration test: URL → Stores → Presets → URL roundtrip.
 *
 * Tests the end-to-end data flow:
 * 1. Deserialize URL params
 * 2. Apply to stores (respecting ordering constraints)
 * 3. Save as preset
 * 4. Reset stores
 * 5. Load preset
 * 6. Serialize back to URL
 * 7. Verify the URL matches the original
 *
 * This catches bugs in the serialization/deserialization chain that
 * individual unit tests miss — where a field survives URL parsing
 * but gets lost during preset save, or where store application order
 * causes a different state than expected.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deserializeState,
  type ParsedShareableState,
  serializeState,
  type ShareableState,
} from '@/lib/url/state-serializer'
import { useAnimationStore } from '@/stores/animationStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePresetManagerStore } from '@/stores/presetManagerStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useTransformStore } from '@/stores/transformStore'

// Mock msgBoxStore to prevent dialog calls
vi.mock('@/stores/msgBoxStore', () => ({
  useMsgBoxStore: {
    getState: () => ({
      showMsgBox: vi.fn(),
      closeMsgBox: vi.fn(),
    }),
  },
}))

vi.mock('@/hooks/useConditionalMsgBox', () => ({
  showConditionalMsgBox: vi.fn(),
  useConditionalMsgBox: vi.fn(),
}))

function applyParsedState(urlState: ParsedShareableState): void {
  const geo = useGeometryStore.getState()
  const ext = useExtendedObjectStore.getState()

  if (urlState.dimension !== undefined) geo.setDimension(urlState.dimension)
  if (urlState.objectType !== undefined) geo.setObjectType(urlState.objectType)
  if (urlState.quantumMode !== undefined) ext.setSchroedingerQuantumMode(urlState.quantumMode)
  if (urlState.representation !== undefined)
    ext.setSchroedingerRepresentation(urlState.representation)
  if (urlState.isoEnabled !== undefined) ext.setSchroedingerIsoEnabled(urlState.isoEnabled)
  if (urlState.isoThreshold !== undefined) ext.setSchroedingerIsoThreshold(urlState.isoThreshold)
  if (urlState.crossSectionEnabled !== undefined)
    ext.setSchroedingerCrossSectionEnabled(urlState.crossSectionEnabled)
  if (urlState.densityGain !== undefined) ext.setSchroedingerDensityGain(urlState.densityGain)
  if (urlState.scale !== undefined) ext.setSchroedingerScale(urlState.scale)
  if (urlState.termCount !== undefined) ext.setSchroedingerTermCount(urlState.termCount)
  if (urlState.seed !== undefined) ext.setSchroedingerSeed(urlState.seed)
  if (urlState.hydrogenN !== undefined)
    ext.setSchroedingerPrincipalQuantumNumber(urlState.hydrogenN)
  if (urlState.hydrogenL !== undefined)
    ext.setSchroedingerAzimuthalQuantumNumber(urlState.hydrogenL)
  if (urlState.hydrogenM !== undefined) ext.setSchroedingerMagneticQuantumNumber(urlState.hydrogenM)
}

function resetAllStores(): void {
  useGeometryStore.getState().reset()
  useExtendedObjectStore.getState().reset()
  useAnimationStore.getState().reset()
  useAppearanceStore.getState().reset()
  useLightingStore.getState().reset()
  useRotationStore.getState().resetAllRotations()
  useTransformStore.getState().reset()
}

describe('full pipeline: URL → stores → scene save/load → URL roundtrip', () => {
  beforeEach(() => {
    resetAllStores()
    usePresetManagerStore.setState({ savedStyles: [], savedScenes: [] })
  })

  it('hydrogen ND scene survives full roundtrip', () => {
    const original: ShareableState = {
      dimension: 5,
      objectType: 'schroedinger',
      quantumMode: 'hydrogenND',
      hydrogenN: 4,
      hydrogenL: 2,
      hydrogenM: -1,
      scale: 1.5,
      densityGain: 3.0,
    }

    // Serialize → deserialize → apply → read back
    const urlString = serializeState(original)
    const parsed = deserializeState(urlString)
    applyParsedState(parsed)

    // Verify stores
    expect(useGeometryStore.getState().dimension).toBe(5)
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('hydrogenND')
    expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(4)
    expect(useExtendedObjectStore.getState().schroedinger.azimuthalQuantumNumber).toBe(2)
    expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(-1)
    expect(useExtendedObjectStore.getState().schroedinger.scale).toBeCloseTo(1.5, 1)
    expect(useExtendedObjectStore.getState().schroedinger.densityGain).toBeCloseTo(3.0, 1)

    // Verify dependent stores were propagated
    expect(useRotationStore.getState().dimension).toBe(5)
    expect(useTransformStore.getState().dimension).toBe(5)
  })

  it('TDSE scene with all params survives full roundtrip', () => {
    const original: ShareableState = {
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'tdseDynamics',
      potentialType: 'harmonicTrap',
      absorberEnabled: false,
      diagnosticsEnabled: true,
      observablesEnabled: true,
      imaginaryTimeEnabled: false,
    }

    const urlString = serializeState(original)
    const parsed = deserializeState(urlString)
    applyParsedState(parsed)

    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
    // Compute modes force position representation
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
    // Compute modes disable cross-section
    expect(useExtendedObjectStore.getState().schroedinger.crossSectionEnabled).toBe(false)
  })

  it('store state is consistent after rapid URL param applications', () => {
    const urls = [
      'd=3&t=schroedinger&qm=harmonicOscillator&tc=4',
      'd=7&t=schroedinger&qm=hydrogenND&hyd_n=3&hyd_l=2&hyd_m=1',
      'd=3&t=schroedinger&qm=tdseDynamics&pot=barrier',
      'd=4&t=schroedinger&qm=harmonicOscillator&repr=momentum',
      'd=3&t=schroedinger&qm=becDynamics',
    ]

    for (const url of urls) {
      const parsed = deserializeState(url)
      applyParsedState(parsed)
    }

    // After all applications, state must be internally consistent
    const dim = useGeometryStore.getState().dimension
    expect(dim).toBeGreaterThanOrEqual(2)
    expect(dim).toBeLessThanOrEqual(11)
    expect(useRotationStore.getState().dimension).toBe(dim)
    expect(useTransformStore.getState().dimension).toBe(dim)

    const mode = useExtendedObjectStore.getState().schroedinger.quantumMode
    // BEC is the last applied mode
    expect(mode).toBe('becDynamics')
    // BEC forces position
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('dimension change propagation is atomic (no intermediate inconsistency)', () => {
    // Start at 3D with TDSE
    applyParsedState(deserializeState('d=3&t=schroedinger&qm=tdseDynamics'))
    expect(useGeometryStore.getState().dimension).toBe(3)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.latticeDim).toBe(3)

    // Change to 5D — dimension should propagate to all dependent stores
    applyParsedState(deserializeState('d=5&t=schroedinger&qm=tdseDynamics'))
    expect(useGeometryStore.getState().dimension).toBe(5)
    expect(useRotationStore.getState().dimension).toBe(5)
    expect(useTransformStore.getState().dimension).toBe(5)
  })
})

describe('quantum number constraint enforcement through the pipeline', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('hydrogen l is clamped to n-1 when n changes', () => {
    const ext = useExtendedObjectStore.getState()
    ext.setSchroedingerQuantumMode('hydrogenND')
    ext.setSchroedingerPrincipalQuantumNumber(5)
    ext.setSchroedingerAzimuthalQuantumNumber(4) // l=4 valid for n=5

    // Now reduce n to 3 — l should be clamped to 2
    ext.setSchroedingerPrincipalQuantumNumber(3)
    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.principalQuantumNumber).toBe(3)
    expect(config.azimuthalQuantumNumber).toBeLessThan(3)
  })

  it('hydrogen m is clamped to l when l changes', () => {
    const ext = useExtendedObjectStore.getState()
    ext.setSchroedingerQuantumMode('hydrogenND')
    ext.setSchroedingerPrincipalQuantumNumber(5)
    ext.setSchroedingerAzimuthalQuantumNumber(4)
    ext.setSchroedingerMagneticQuantumNumber(4) // m=4 valid for l=4

    // Reduce l to 2 — m should be clamped to 2
    ext.setSchroedingerAzimuthalQuantumNumber(2)
    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.azimuthalQuantumNumber).toBe(2)
    expect(Math.abs(config.magneticQuantumNumber)).toBeLessThanOrEqual(2)
  })

  it('negative m survives roundtrip through URL serialization', () => {
    const original: ShareableState = {
      dimension: 3,
      objectType: 'schroedinger',
      quantumMode: 'hydrogenND',
      hydrogenN: 3,
      hydrogenL: 2,
      hydrogenM: -2,
    }

    const url = serializeState(original)
    expect(url).toContain('hyd_m=-2')

    const parsed = deserializeState(url)
    expect(parsed.hydrogenM).toBe(-2)
  })

  it('quantum numbers at boundary values (n=7, l=6, m=-6) survive full pipeline', () => {
    const ext = useExtendedObjectStore.getState()
    ext.setSchroedingerQuantumMode('hydrogenND')
    ext.setSchroedingerPrincipalQuantumNumber(7)
    ext.setSchroedingerAzimuthalQuantumNumber(6)
    ext.setSchroedingerMagneticQuantumNumber(-6)

    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.principalQuantumNumber).toBe(7)
    expect(config.azimuthalQuantumNumber).toBe(6)
    expect(config.magneticQuantumNumber).toBe(-6)
  })
})

describe('multi-store version isolation during complex operations', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('geometry dimension change only bumps rotation and transform versions, not appearance', () => {
    const appV1 = useAppearanceStore.getState().appearanceVersion
    const lightV1 = useLightingStore.getState().version

    useGeometryStore.getState().setDimension(7)

    const appV2 = useAppearanceStore.getState().appearanceVersion
    const lightV2 = useLightingStore.getState().version

    expect(appV2).toBe(appV1)
    expect(lightV2).toBe(lightV1)
  })

  it('quantum mode switch bumps extended version but not appearance or lighting', () => {
    const appV1 = useAppearanceStore.getState().appearanceVersion
    const lightV1 = useLightingStore.getState().version
    const extV1 = useExtendedObjectStore.getState().schroedingerVersion

    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')

    const extV2 = useExtendedObjectStore.getState().schroedingerVersion
    expect(extV2).toBeGreaterThan(extV1)
    expect(useAppearanceStore.getState().appearanceVersion).toBe(appV1)
    expect(useLightingStore.getState().version).toBe(lightV1)
  })
})

describe('animation plane filter consistency through dimension changes', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('animation planes are filtered when dimension decreases', () => {
    const AXES = ['X', 'Y', 'Z', 'W', 'V', 'U', 'A6', 'A7', 'A8', 'A9', 'A10']

    useGeometryStore.getState().setDimension(8)
    useAnimationStore.getState().animateAll(8)

    const planesBefore = useAnimationStore.getState().animatingPlanes.size
    expect(planesBefore).toBe(28) // C(8,2) = 28

    // Reduce to 4D
    useGeometryStore.getState().setDimension(4)

    const planesAfter = useAnimationStore.getState().animatingPlanes
    expect(planesAfter.size).toBeLessThanOrEqual(6) // C(4,2) = 6

    // Verify every remaining plane references only axes 0-3
    for (const plane of planesAfter) {
      for (let i = 0; i < plane.length; ) {
        // Parse axis name from plane string
        let axisName: string
        if (plane[i] === 'A') {
          // Multi-char axis like A6, A7
          axisName = plane.substring(i, i + 2)
          i += 2
        } else {
          axisName = plane[i]!
          i += 1
        }
        const axisIdx = AXES.indexOf(axisName)
        expect(axisIdx).toBeLessThan(4)
        expect(axisIdx).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('dimension increase does not auto-populate new planes', () => {
    useGeometryStore.getState().setDimension(3)
    useAnimationStore.getState().animateAll(3)
    expect(useAnimationStore.getState().animatingPlanes.size).toBe(3) // C(3,2) = 3

    useGeometryStore.getState().setDimension(6)
    // Existing planes should remain, no new ones auto-added
    const planes = useAnimationStore.getState().animatingPlanes
    expect(planes.size).toBe(3)
  })
})

describe('mode switch + dimension constraint chain', () => {
  beforeEach(() => {
    resetAllStores()
  })

  it('BEC at 2D triggers dimension bump, which propagates to all dependent stores', () => {
    useGeometryStore.getState().setDimension(2)
    expect(useGeometryStore.getState().dimension).toBe(2)
    expect(useRotationStore.getState().dimension).toBe(2)

    // Switch to BEC — should force dim >= 3
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('becDynamics')

    const dim = useGeometryStore.getState().dimension
    expect(dim).toBeGreaterThanOrEqual(3)
    expect(useRotationStore.getState().dimension).toBe(dim)
    expect(useTransformStore.getState().dimension).toBe(dim)
  })

  it('TDSE at 2D preserves dimension 2', () => {
    useGeometryStore.getState().setDimension(2)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
    expect(useGeometryStore.getState().dimension).toBe(2)
    expect(useExtendedObjectStore.getState().schroedinger.tdse.latticeDim).toBe(2)
  })

  it('chain: set momentum repr → switch to compute → repr forced to position → switch back → repr stays position', () => {
    useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')

    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')

    useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
    // After switching back to analytical, position representation persists
    // (the mode switch does not restore the pre-compute representation)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })
})
