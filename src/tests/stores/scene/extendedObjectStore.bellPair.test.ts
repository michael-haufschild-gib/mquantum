import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

beforeEach(() => {
  useExtendedObjectStore.getState().reset()
})

describe('extendedObjectStore — bellPair reset lifecycle', () => {
  it('markComputeNeedsReset / clearComputeNeedsReset toggle top-level Bell config only', () => {
    const store = useExtendedObjectStore.getState()

    store.clearComputeNeedsReset('bellPair')
    expect(useExtendedObjectStore.getState().bellPair.needsReset).toBe(false)
    expect(
      (useExtendedObjectStore.getState().schroedinger as unknown as { bellPair?: unknown }).bellPair
    ).toBeUndefined()

    const beforeVersion = useExtendedObjectStore.getState().bellPairVersion
    useExtendedObjectStore.getState().markComputeNeedsReset('bellPair')
    expect(useExtendedObjectStore.getState().bellPair.needsReset).toBe(true)
    expect(useExtendedObjectStore.getState().bellPairVersion).toBe(beforeVersion + 1)

    useExtendedObjectStore.getState().clearComputeNeedsReset('bellPair')
    expect(useExtendedObjectStore.getState().bellPair.needsReset).toBe(false)
    expect(
      (useExtendedObjectStore.getState().schroedinger as unknown as { bellPair?: unknown }).bellPair
    ).toBeUndefined()
  })
})
