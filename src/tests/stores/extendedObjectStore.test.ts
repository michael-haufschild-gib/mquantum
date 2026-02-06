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

  it('reset restores defaults', () => {
    useExtendedObjectStore.getState().setSchroedingerScale(5)
    useExtendedObjectStore.getState().setSchroedingerQualityPreset('ultra')

    useExtendedObjectStore.getState().reset()
    expect(useExtendedObjectStore.getState().schroedinger).toEqual({
      ...DEFAULT_SCHROEDINGER_CONFIG,
    })
  })
})
