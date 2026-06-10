import { beforeEach, describe, expect, it } from 'vitest'

import {
  COHERENCE_HORIZON_PRESETS,
  DEFAULT_COHERENCE_HORIZON_CONFIG,
} from '@/lib/geometry/extended/coherenceHorizon'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const getConfig = () => useExtendedObjectStore.getState().schroedinger.coherenceHorizon

describe('coherenceHorizonSetters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('starts from the documented defaults (matching the coherentCat preset)', () => {
    expect(getConfig()).toEqual(DEFAULT_COHERENCE_HORIZON_CONFIG)
    expect({ ...COHERENCE_HORIZON_PRESETS.coherentCat, preset: 'coherentCat' }).toEqual(
      DEFAULT_COHERENCE_HORIZON_CONFIG
    )
  })

  it('clamps each numeric field to its documented range and flips preset to custom', () => {
    const s = useExtendedObjectStore.getState()

    s.setCoherenceHorizonDecoherence(2)
    expect(getConfig().decoherence).toBe(1)
    expect(getConfig().preset).toBe('custom')

    s.setCoherenceHorizonSeparation(0.1)
    expect(getConfig().separation).toBe(0.5)

    s.setCoherenceHorizonWidth(5)
    expect(getConfig().width).toBe(1.2)

    s.setCoherenceHorizonWaveNumber(-2)
    expect(getConfig().waveNumber).toBe(0)

    s.setCoherenceHorizonScale(7)
    expect(getConfig().horizonScale).toBe(1.2)

    s.setCoherenceHorizonRingGain(11)
    expect(getConfig().ringGain).toBe(4)

    s.setCoherenceHorizonGlow(0)
    expect(getConfig().glow).toBe(0.2)
  })

  it('rejects non-finite values without mutating state', () => {
    const before = getConfig()
    useExtendedObjectStore.getState().setCoherenceHorizonDecoherence(Number.NaN)
    useExtendedObjectStore.getState().setCoherenceHorizonScale(Number.POSITIVE_INFINITY)
    expect(getConfig()).toEqual(before)
  })

  it('applies named presets wholesale and tags the preset id', () => {
    useExtendedObjectStore.getState().setCoherenceHorizonPreset('criticalRing')
    const config = getConfig()
    expect(config.preset).toBe('criticalRing')
    expect(config.separation).toBe(COHERENCE_HORIZON_PRESETS.criticalRing.separation)
    expect(config.horizonScale).toBe(COHERENCE_HORIZON_PRESETS.criticalRing.horizonScale)
    expect(config.ringGain).toBe(COHERENCE_HORIZON_PRESETS.criticalRing.ringGain)
  })

  it('evaporatedFlat preset sets full decoherence (r_h = 0 regime)', () => {
    useExtendedObjectStore.getState().setCoherenceHorizonPreset('evaporatedFlat')
    expect(getConfig().decoherence).toBe(1)
  })

  it('bumps the schroedinger version so the renderer re-packs uniforms', () => {
    const before = useExtendedObjectStore.getState().schroedingerVersion
    useExtendedObjectStore.getState().setCoherenceHorizonDecoherence(0.5)
    expect(useExtendedObjectStore.getState().schroedingerVersion).toBeGreaterThan(before)
  })
})
