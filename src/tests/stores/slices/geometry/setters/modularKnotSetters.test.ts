import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_MODULAR_KNOT_CONFIG,
  MODULAR_KNOT_PRESETS,
} from '@/lib/geometry/extended/modularKnot'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const getConfig = () => useExtendedObjectStore.getState().schroedinger.modularKnot

describe('modularKnotSetters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('starts from the documented defaults (matching the rademacherTangle preset)', () => {
    expect(getConfig()).toEqual(DEFAULT_MODULAR_KNOT_CONFIG)
    expect({ ...MODULAR_KNOT_PRESETS.rademacherTangle, preset: 'rademacherTangle' }).toEqual(
      DEFAULT_MODULAR_KNOT_CONFIG
    )
  })

  it('clamps each numeric field to its documented range and flips preset to custom', () => {
    const s = useExtendedObjectStore.getState()

    s.setModularKnotGlow(0)
    expect(getConfig().glow).toBe(0.2)
    expect(getConfig().preset).toBe('custom')

    s.setModularKnotGlow(99)
    expect(getConfig().glow).toBe(4)

    s.setModularKnotFlow(-1)
    expect(getConfig().flow).toBe(0)

    s.setModularKnotFlow(5)
    expect(getConfig().flow).toBe(1.5)

    s.setModularKnotTubeWidth(0)
    expect(getConfig().tubeWidth).toBe(0.6)

    s.setModularKnotTubeWidth(99)
    expect(getConfig().tubeWidth).toBe(3)
  })

  it('rounds and clamps the integer bake fields (maxLen, geodesicCount)', () => {
    const s = useExtendedObjectStore.getState()

    s.setModularKnotMaxLen(6.6)
    expect(getConfig().maxLen).toBe(7)
    expect(getConfig().preset).toBe('custom')

    s.setModularKnotMaxLen(1)
    expect(getConfig().maxLen).toBe(4)

    s.setModularKnotMaxLen(99)
    expect(getConfig().maxLen).toBe(10)

    s.setModularKnotGeodesicCount(23.4)
    expect(getConfig().geodesicCount).toBe(23)

    s.setModularKnotGeodesicCount(1)
    expect(getConfig().geodesicCount).toBe(6)

    s.setModularKnotGeodesicCount(999)
    expect(getConfig().geodesicCount).toBe(64)
  })

  it('writes the exact in-range value through each numeric setter', () => {
    const s = useExtendedObjectStore.getState()
    s.setModularKnotGlow(2.3)
    s.setModularKnotFlow(0.8)
    s.setModularKnotTubeWidth(1.9)
    expect(getConfig().glow).toBeCloseTo(2.3, 6)
    expect(getConfig().flow).toBeCloseTo(0.8, 6)
    expect(getConfig().tubeWidth).toBeCloseTo(1.9, 6)
  })

  it('rejects non-finite values without mutating state', () => {
    const before = getConfig()
    useExtendedObjectStore.getState().setModularKnotGlow(Number.NaN)
    useExtendedObjectStore.getState().setModularKnotMaxLen(Number.POSITIVE_INFINITY)
    expect(getConfig()).toEqual(before)
  })

  it('applies named presets wholesale and tags the preset id', () => {
    useExtendedObjectStore.getState().setModularKnotPreset('deepSpectrum')
    const config = getConfig()
    expect(config.preset).toBe('deepSpectrum')
    expect(config.glow).toBe(MODULAR_KNOT_PRESETS.deepSpectrum.glow)
    expect(config.flow).toBe(MODULAR_KNOT_PRESETS.deepSpectrum.flow)
    expect(config.maxLen).toBe(MODULAR_KNOT_PRESETS.deepSpectrum.maxLen)
    expect(config.geodesicCount).toBe(MODULAR_KNOT_PRESETS.deepSpectrum.geodesicCount)
    expect(config.tubeWidth).toBe(MODULAR_KNOT_PRESETS.deepSpectrum.tubeWidth)
  })

  it('setting the custom preset leaves field values untouched', () => {
    const s = useExtendedObjectStore.getState()
    s.setModularKnotPreset('primeGeodesics')
    const fields = getConfig()
    s.setModularKnotPreset('custom')
    expect(getConfig().preset).toBe('custom')
    expect(getConfig().glow).toBe(fields.glow)
    expect(getConfig().geodesicCount).toBe(fields.geodesicCount)
  })

  it('an individual edit after a preset flips the tag to custom but keeps siblings', () => {
    const s = useExtendedObjectStore.getState()
    s.setModularKnotPreset('primeGeodesics')
    expect(getConfig().preset).toBe('primeGeodesics')

    s.setModularKnotGlow(3)
    expect(getConfig().preset).toBe('custom')
    expect(getConfig().glow).toBe(3)
    // The other primeGeodesics fields survive the single-field edit.
    expect(getConfig().geodesicCount).toBe(MODULAR_KNOT_PRESETS.primeGeodesics.geodesicCount)
  })

  it('bumps the schroedinger version so the renderer re-packs uniforms / re-bakes', () => {
    const before = useExtendedObjectStore.getState().schroedingerVersion
    useExtendedObjectStore.getState().setModularKnotGeodesicCount(30)
    expect(useExtendedObjectStore.getState().schroedingerVersion).toBeGreaterThan(before)
  })
})
