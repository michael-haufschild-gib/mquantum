/**
 * URL params -> store state integration test.
 *
 * Verifies that deserializing URL params and applying them to stores
 * produces the correct state. This tests the full chain from URL string
 * to Zustand store values, catching bugs where a new URL param is added
 * to the serializer but not wired through to the stores.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  deserializeState,
  type ParsedShareableState,
  serializeState,
} from '@/lib/url/state-serializer'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

/**
 * Apply parsed URL state to stores.
 *
 * This mirrors the production `applyUrlStateParams` from useUrlState.ts.
 * The key contract: dimension is applied before objectType, which is applied
 * before quantumMode — the order matters because compute modes enforce
 * minimum dimension constraints.
 */
function applyUrlStateToStores(urlString: string): void {
  const urlState = deserializeState(urlString)
  applyParsedState(urlState)
}

function applyParsedState(urlState: ParsedShareableState): void {
  const geo = useGeometryStore.getState()
  const ext = useExtendedObjectStore.getState()

  // Core identity — order matters: dimension -> objectType -> quantumMode
  if (urlState.dimension !== undefined) geo.setDimension(urlState.dimension)
  if (urlState.objectType !== undefined) geo.setObjectType(urlState.objectType)
  if (urlState.quantumMode !== undefined) ext.setSchroedingerQuantumMode(urlState.quantumMode)

  // Rendering
  if (urlState.representation !== undefined)
    ext.setSchroedingerRepresentation(urlState.representation)
  if (urlState.isoEnabled !== undefined) ext.setSchroedingerIsoEnabled(urlState.isoEnabled)
  if (urlState.isoThreshold !== undefined) ext.setSchroedingerIsoThreshold(urlState.isoThreshold)
  if (urlState.crossSectionEnabled !== undefined)
    ext.setSchroedingerCrossSectionEnabled(urlState.crossSectionEnabled)
  if (urlState.densityGain !== undefined) ext.setSchroedingerDensityGain(urlState.densityGain)
  if (urlState.scale !== undefined) ext.setSchroedingerScale(urlState.scale)

  // Quantum numbers
  if (urlState.termCount !== undefined) ext.setSchroedingerTermCount(urlState.termCount)
  if (urlState.seed !== undefined) ext.setSchroedingerSeed(urlState.seed)
  if (urlState.hydrogenN !== undefined)
    ext.setSchroedingerPrincipalQuantumNumber(urlState.hydrogenN)
  if (urlState.hydrogenL !== undefined)
    ext.setSchroedingerAzimuthalQuantumNumber(urlState.hydrogenL)
  if (urlState.hydrogenM !== undefined) ext.setSchroedingerMagneticQuantumNumber(urlState.hydrogenM)
}

describe('URL params -> store state integration', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('applies dimension from URL to geometry store', () => {
    applyUrlStateToStores('d=7&t=schroedinger')
    expect(useGeometryStore.getState().dimension).toBe(7)
  })

  it('applies quantum mode from URL to extended store', () => {
    applyUrlStateToStores('d=3&t=schroedinger&qm=tdseDynamics')
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
  })

  it('applies hydrogen quantum numbers from URL', () => {
    applyUrlStateToStores('d=3&t=schroedinger&qm=hydrogenND&hyd_n=4&hyd_l=2&hyd_m=-1')
    const sch = useExtendedObjectStore.getState().schroedinger
    expect(sch.quantumMode).toBe('hydrogenND')
    expect(sch.principalQuantumNumber).toBe(4)
    expect(sch.azimuthalQuantumNumber).toBe(2)
    expect(sch.magneticQuantumNumber).toBe(-1)
  })

  it('applies HO parameters from URL', () => {
    applyUrlStateToStores('d=5&t=schroedinger&tc=6&seed=42')
    const sch = useExtendedObjectStore.getState().schroedinger
    expect(sch.termCount).toBe(6)
    expect(sch.seed).toBe(42)
  })

  it('applies rendering params from URL', () => {
    applyUrlStateToStores('d=4&t=schroedinger&iso=1&iso_t=-3.00&dg=2.50&scale=1.50')
    const sch = useExtendedObjectStore.getState().schroedinger
    expect(sch.isoEnabled).toBe(true)
    expect(sch.isoThreshold).toBeCloseTo(-3.0)
    expect(sch.densityGain).toBeCloseTo(2.5)
    expect(sch.scale).toBeCloseTo(1.5)
  })

  it('ignores unknown URL params without affecting known ones', () => {
    applyUrlStateToStores('d=5&t=schroedinger&unknown=foo&future_param=bar')
    expect(useGeometryStore.getState().dimension).toBe(5)
  })

  it('clamps out-of-range URL values to valid bounds', () => {
    applyUrlStateToStores('d=99&t=schroedinger&tc=50&hyd_n=-5')
    expect(useGeometryStore.getState().dimension).toBe(11) // clamped to MAX
    expect(useExtendedObjectStore.getState().schroedinger.termCount).toBe(8) // clamped to MAX
    expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(1) // clamped to MIN
  })

  it('handles empty URL params (all defaults preserved)', () => {
    const dimBefore = useGeometryStore.getState().dimension
    applyUrlStateToStores('')
    expect(useGeometryStore.getState().dimension).toBe(dimBefore)
  })

  it('URL dimension param overrides current dimension for compute mode', () => {
    useGeometryStore.getState().setDimension(2) // Start at 2D
    applyUrlStateToStores('d=3&t=schroedinger&qm=tdseDynamics')

    // URL explicitly sets d=3 — should be 3
    expect(useGeometryStore.getState().dimension).toBe(3)
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
  })

  it('full serialize -> deserialize -> apply roundtrip preserves state', () => {
    // Set up a specific state
    useGeometryStore.getState().setDimension(6)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')
    useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(3)
    useExtendedObjectStore.getState().setSchroedingerScale(1.8)
    useExtendedObjectStore.getState().setSchroedingerTermCount(5)

    // Serialize to URL
    const serialized = serializeState({
      dimension: 6,
      objectType: 'schroedinger',
      quantumMode: 'hydrogenND',
      hydrogenN: 3,
      scale: 1.8,
      termCount: 5,
    })

    // Reset stores
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()

    // Apply from URL
    applyUrlStateToStores(serialized)

    // Verify
    expect(useGeometryStore.getState().dimension).toBe(6)
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('hydrogenND')
    expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(3)
    expect(useExtendedObjectStore.getState().schroedinger.scale).toBeCloseTo(1.8, 1)
    expect(useExtendedObjectStore.getState().schroedinger.termCount).toBe(5)
  })
})
