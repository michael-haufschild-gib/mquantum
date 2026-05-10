/**
 * Round-trip tests for the Wheeler–DeWitt grid presets.
 *
 * Certifies that `setWdwGridSize('publication')` writes the exact
 * documented (Na, Nphi) = (256, 48) tuple into the store, and that the
 * registry entry itself matches the D2-approved tuple. A regression in
 * either shape would silently degrade thesis-grade figures to a coarser
 * grid without changing the UI label.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { WDW_GRID_PRESETS } from '@/stores/slices/geometry/setters/wheelerDeWittSetters'

const getWdw = () => useExtendedObjectStore.getState().schroedinger.wheelerDeWitt

describe('Wheeler–DeWitt grid preset — publication round trip', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useExtendedObjectStore.getState().clearComputeNeedsReset('wheelerDeWitt')
  })

  it('registry entry equals the documented (256, 48) tuple', () => {
    expect(WDW_GRID_PRESETS.publication).toEqual({ gridNa: 256, gridNphi: 48 })
  })

  it("setWdwGridSize('publication') mutates the config to gridNa=256, gridNphi=48", () => {
    useExtendedObjectStore.getState().setWdwGridSize('publication')
    const wdw = getWdw()
    expect(wdw.gridNa).toBe(256)
    expect(wdw.gridNphi).toBe(48)
    expect(wdw.needsReset).toBe(true)
  })

  it('preserves unique tuples across all four presets (no false-match risk)', () => {
    const tuples = Object.values(WDW_GRID_PRESETS).map((p) => `${p.gridNa}x${p.gridNphi}`)
    expect(new Set(tuples).size).toBe(tuples.length)
  })
})
