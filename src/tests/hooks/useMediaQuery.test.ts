import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  useMediaQuery,
  useBreakpoint,
  useCurrentBreakpoint,
  useIsMobile,
  useIsDesktop,
  BREAKPOINTS,
} from '@/hooks/useMediaQuery'

const mockMatchMedia = (matches: boolean) => {
  const listeners: ((e: MediaQueryListEvent) => void)[] = []

  const mediaQueryList = {
    matches,
    media: '',
    onchange: null,
    addEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
      listeners.push(listener)
    },
    removeEventListener: (_: string, listener: (e: MediaQueryListEvent) => void) => {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    },
    dispatchEvent: () => true,
    // Helper to trigger change
    trigger: (newMatches: boolean) => {
      listeners.forEach((listener) => listener({ matches: newMatches } as MediaQueryListEvent))
    },
  }

  return mediaQueryList
}

describe('useMediaQuery', () => {
  const originalMatchMedia = window.matchMedia
  let mockMediaQuery: ReturnType<typeof mockMatchMedia>

  beforeEach(() => {
    mockMediaQuery = mockMatchMedia(false)
    window.matchMedia = vi.fn().mockImplementation(() => mockMediaQuery)
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('should update when media query changes', () => {
    mockMediaQuery = mockMatchMedia(false)
    window.matchMedia = vi.fn().mockImplementation(() => mockMediaQuery)

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)

    act(() => {
      mockMediaQuery.trigger(true)
    })

    expect(result.current).toBe(true)
  })

  it('should cleanup event listener on unmount', () => {
    const removeEventListenerSpy = vi.fn()
    mockMediaQuery.removeEventListener = removeEventListenerSpy
    window.matchMedia = vi.fn().mockImplementation(() => mockMediaQuery)

    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    unmount()

    expect(removeEventListenerSpy).toHaveBeenCalled()
  })
})

describe('useBreakpoint', () => {
  beforeEach(() => {
    window.matchMedia = vi
      .fn()
      .mockImplementation((query: string) => mockMatchMedia(query === BREAKPOINTS.md))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should check if screen is at md breakpoint', () => {
    window.matchMedia = vi
      .fn()
      .mockImplementation((query: string) => mockMatchMedia(query === BREAKPOINTS.md))

    const { result } = renderHook(() => useBreakpoint('md'))
    expect(result.current).toBe(true)
  })
})

describe('useCurrentBreakpoint', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return 2xl for largest screens', () => {
    window.matchMedia = vi.fn().mockImplementation(() => mockMatchMedia(true))

    const { result } = renderHook(() => useCurrentBreakpoint())
    expect(result.current).toBe('2xl')
  })

  it('should return null for smallest screens', () => {
    window.matchMedia = vi.fn().mockImplementation(() => mockMatchMedia(false))

    const { result } = renderHook(() => useCurrentBreakpoint())
    expect(result.current).toBe(null)
  })
})

describe('useIsMobile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return true for mobile screens', () => {
    window.matchMedia = vi.fn().mockImplementation(() => mockMatchMedia(false))

    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })
})

describe('useIsDesktop', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return true for desktop screens', () => {
    window.matchMedia = vi
      .fn()
      .mockImplementation((query: string) => mockMatchMedia(query === BREAKPOINTS.lg))

    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(true)
  })
})
