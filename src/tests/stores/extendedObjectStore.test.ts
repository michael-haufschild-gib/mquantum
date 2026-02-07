import { beforeEach, describe, expect, it } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'

describe('extendedObjectStore (invariants)', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('schroedinger scale setting updates config', () => {
    useExtendedObjectStore.getState().setSchroedingerScale(1.5)
    expect(useExtendedObjectStore.getState().schroedinger.scale).toBe(1.5)
  })

  it('schroedinger quality preset updates related settings together', () => {
    useExtendedObjectStore.getState().setSchroedingerQualityPreset('draft')
    const draft = useExtendedObjectStore.getState().schroedinger
    expect(draft.qualityPreset).toBe('draft')

    useExtendedObjectStore.getState().setSchroedingerQualityPreset('ultra')
    const ultra = useExtendedObjectStore.getState().schroedinger
    expect(ultra.qualityPreset).toBe('ultra')
  })

  it('updates representation and momentum display settings', () => {
    useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
    useExtendedObjectStore.getState().setSchroedingerMomentumDisplayUnits('p')

    const config = useExtendedObjectStore.getState().schroedinger
    expect(config.representation).toBe('momentum')
    expect(config.momentumDisplayUnits).toBe('p')
  })

  it('clamps momentum scale and hbar ranges', () => {
    useExtendedObjectStore.getState().setSchroedingerMomentumScale(99)
    useExtendedObjectStore.getState().setSchroedingerMomentumHbar(0)

    let config = useExtendedObjectStore.getState().schroedinger
    expect(config.momentumScale).toBe(4.0)
    expect(config.momentumHbar).toBe(0.01)

    useExtendedObjectStore.getState().setSchroedingerMomentumScale(-1)
    useExtendedObjectStore.getState().setSchroedingerMomentumHbar(99)

    config = useExtendedObjectStore.getState().schroedinger
    expect(config.momentumScale).toBe(0.1)
    expect(config.momentumHbar).toBe(10.0)
  })

  it('reset restores defaults', () => {
    useExtendedObjectStore.getState().setSchroedingerScale(5)
    useExtendedObjectStore.getState().setSchroedingerQualityPreset('ultra')

    useExtendedObjectStore.getState().reset()
    expect(useExtendedObjectStore.getState().schroedinger).toEqual({
      ...DEFAULT_SCHROEDINGER_CONFIG,
    })
  })
})
