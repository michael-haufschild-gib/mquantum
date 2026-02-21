import {
  DEFAULT_SIDEBAR_WIDTH_LARGE,
  clampSidebarWidth,
  useLayoutStore,
} from '@/stores/layoutStore'
import { beforeEach, describe, expect, it } from 'vitest'

describe('layoutStore', () => {
  beforeEach(() => {
    useLayoutStore.getState().reset()
  })

  it('clampSidebarWidth returns finite values for non-finite inputs', () => {
    const withNaNWidth = clampSidebarWidth(Number.NaN, 1400)
    const withNaNViewport = clampSidebarWidth(360, Number.NaN)
    const withNaNBoth = clampSidebarWidth(Number.NaN, Number.NaN)

    expect(Number.isFinite(withNaNWidth)).toBe(true)
    expect(Number.isFinite(withNaNViewport)).toBe(true)
    expect(Number.isFinite(withNaNBoth)).toBe(true)
  })

  it('ignores non-finite setSidebarWidth inputs', () => {
    const { setSidebarWidth } = useLayoutStore.getState()
    const initial = useLayoutStore.getState().sidebarWidth

    setSidebarWidth(Number.NaN, 1400)
    setSidebarWidth(360, Number.NaN)
    setSidebarWidth(Number.POSITIVE_INFINITY, 1400)

    expect(useLayoutStore.getState().sidebarWidth).toBe(initial)
  })

  it('keeps valid setSidebarWidth behavior unchanged', () => {
    const { setSidebarWidth } = useLayoutStore.getState()
    setSidebarWidth(360, 1400)
    expect(useLayoutStore.getState().sidebarWidth).toBe(360)

    useLayoutStore.getState().reset()
    expect(useLayoutStore.getState().sidebarWidth).toBe(DEFAULT_SIDEBAR_WIDTH_LARGE)
  })
})
