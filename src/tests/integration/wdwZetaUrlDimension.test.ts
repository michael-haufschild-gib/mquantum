/**
 * WDW ⊗ ζ share links must restore the sender's explicit dimension.
 *
 * Regression: a suite preset URL (`<prefix>_p=<scenario>`) re-ran the
 * scenario's dimension guard on load, so a link shared after the user changed
 * dimension (e.g. the 4D `hyperSeam4D` scenario viewed at d = 3) reopened at
 * the scenario's authored dimension instead of the link's `d`.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { applyUrlStateParams } from '@/hooks/useUrlState'
import { deserializeState, serializeState } from '@/lib/url/state-serializer'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useRotationStore } from '@/stores/scene/rotationStore'

function applyUrl(urlString: string): void {
  applyUrlStateParams(deserializeState(urlString))
}

describe('WDW ⊗ ζ URL preset vs dimension', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('keeps d = 3 for a 4D scenario link', () => {
    applyUrl('t=schroedinger&d=3&qm=constraintSeam&cs_p=hyperSeam4D')
    expect(useExtendedObjectStore.getState().schroedinger.constraintSeam.preset).toBe('hyperSeam4D')
    expect(useGeometryStore.getState().dimension).toBe(3)
  })

  it('keeps the authored scenario rotation when the dimensions agree', () => {
    applyUrl('t=schroedinger&d=4&qm=constraintSeam&cs_p=hyperSeam4D')
    expect(useGeometryStore.getState().dimension).toBe(4)
    expect(useRotationStore.getState().rotations.get('XW')).toBeCloseTo(0.7, 6)
  })

  it('keeps d = 4 for a 3D scenario link', () => {
    applyUrl('t=schroedinger&d=4&qm=constraintSeam&cs_p=ghostSector')
    expect(useExtendedObjectStore.getState().schroedinger.constraintSeam.preset).toBe('ghostSector')
    expect(useGeometryStore.getState().dimension).toBe(4)
  })

  it('round-trips a scenario selected in-app and then re-dimensioned', () => {
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('constraintSeam')
    useExtendedObjectStore.getState().setWdwZetaPreset('constraintSeam', 'hyperSeam4D')
    expect(useGeometryStore.getState().dimension).toBe(4)
    useGeometryStore.getState().setDimension(3)
    const url = serializeState({
      objectType: 'schroedinger',
      dimension: useGeometryStore.getState().dimension,
      quantumMode: 'constraintSeam',
      wdwZetaPreset: { constraintSeam: 'hyperSeam4D' },
    })
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
    applyUrl(url)
    expect(useGeometryStore.getState().dimension).toBe(3)
  })
})
