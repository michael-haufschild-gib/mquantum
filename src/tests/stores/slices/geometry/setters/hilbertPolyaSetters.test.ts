import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_HILBERT_POLYA_CONFIG,
  HILBERT_POLYA_PRESETS,
} from '@/lib/geometry/extended/hilbertPolya'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const getConfig = () => useExtendedObjectStore.getState().schroedinger.hilbertPolya

describe('hilbertPolyaSetters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('starts from the documented defaults (matching the criticalPlane preset)', () => {
    expect(getConfig()).toEqual(DEFAULT_HILBERT_POLYA_CONFIG)
    expect({ ...HILBERT_POLYA_PRESETS.criticalPlane, preset: 'criticalPlane' }).toEqual(
      DEFAULT_HILBERT_POLYA_CONFIG
    )
  })

  it('clamps each numeric field to its documented range and flips preset to custom', () => {
    const s = useExtendedObjectStore.getState()

    s.setHilbertPolyaZMax(999)
    expect(getConfig().zMax).toBe(240)
    expect(getConfig().preset).toBe('custom')

    s.setHilbertPolyaZMax(1)
    expect(getConfig().zMax).toBe(40)

    s.setHilbertPolyaYExtent(0.1)
    expect(getConfig().yExtent).toBe(0.6)

    s.setHilbertPolyaYExtent(99)
    expect(getConfig().yExtent).toBe(1.2)

    s.setHilbertPolyaFilamentWidth(0.001)
    expect(getConfig().filamentWidth).toBe(0.05)

    s.setHilbertPolyaFilamentWidth(5)
    expect(getConfig().filamentWidth).toBe(0.5)

    s.setHilbertPolyaGlow(0)
    expect(getConfig().glow).toBe(0.2)

    s.setHilbertPolyaGlow(99)
    expect(getConfig().glow).toBe(4)

    s.setHilbertPolyaFogGain(-1)
    expect(getConfig().fogGain).toBe(0)

    s.setHilbertPolyaFogGain(9)
    expect(getConfig().fogGain).toBe(2)
  })

  it('stores an in-range non-integer zMax verbatim (rounding happens at URL emit)', () => {
    useExtendedObjectStore.getState().setHilbertPolyaZMax(42.6)
    expect(getConfig().zMax).toBe(42.6)
  })

  it('toggles the critical-plane marker and flips preset to custom', () => {
    const s = useExtendedObjectStore.getState()

    s.setHilbertPolyaPlaneMarker(false)
    expect(getConfig().planeMarker).toBe(false)
    expect(getConfig().preset).toBe('custom')

    s.setHilbertPolyaPlaneMarker(true)
    expect(getConfig().planeMarker).toBe(true)
  })

  it('rejects non-finite values without mutating state', () => {
    const before = getConfig()
    useExtendedObjectStore.getState().setHilbertPolyaGlow(Number.NaN)
    useExtendedObjectStore.getState().setHilbertPolyaYExtent(Number.POSITIVE_INFINITY)
    expect(getConfig()).toEqual(before)
  })

  it('applies named presets wholesale and tags the preset id', () => {
    useExtendedObjectStore.getState().setHilbertPolyaPreset('matsubaraVeil')
    const config = getConfig()
    expect(config.preset).toBe('matsubaraVeil')
    expect(config.zMax).toBe(HILBERT_POLYA_PRESETS.matsubaraVeil.zMax)
    expect(config.yExtent).toBe(HILBERT_POLYA_PRESETS.matsubaraVeil.yExtent)
    expect(config.filamentWidth).toBe(HILBERT_POLYA_PRESETS.matsubaraVeil.filamentWidth)
    expect(config.glow).toBe(HILBERT_POLYA_PRESETS.matsubaraVeil.glow)
    expect(config.fogGain).toBe(HILBERT_POLYA_PRESETS.matsubaraVeil.fogGain)
    expect(config.planeMarker).toBe(HILBERT_POLYA_PRESETS.matsubaraVeil.planeMarker)
  })

  it('etaComb preset frames the off-axis prefactor comb window', () => {
    useExtendedObjectStore.getState().setHilbertPolyaPreset('etaComb')
    expect(getConfig().zMax).toBe(80)
    expect(getConfig().yExtent).toBe(0.8)
  })

  it('an individual edit after a preset flips the tag to custom', () => {
    const s = useExtendedObjectStore.getState()
    s.setHilbertPolyaPreset('doublePrecisionHorizon')
    expect(getConfig().preset).toBe('doublePrecisionHorizon')

    s.setHilbertPolyaGlow(3)
    expect(getConfig().preset).toBe('custom')
    expect(getConfig().glow).toBe(3)
    // The other doublePrecisionHorizon fields survive the single-field edit.
    expect(getConfig().fogGain).toBe(HILBERT_POLYA_PRESETS.doublePrecisionHorizon.fogGain)
  })

  it('bumps the schroedinger version so the renderer re-packs uniforms', () => {
    const before = useExtendedObjectStore.getState().schroedingerVersion
    useExtendedObjectStore.getState().setHilbertPolyaGlow(2.2)
    expect(useExtendedObjectStore.getState().schroedingerVersion).toBeGreaterThan(before)
  })
})
