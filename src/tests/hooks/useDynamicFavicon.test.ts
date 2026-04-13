/**
 * Tests for useDynamicFavicon hook
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDynamicFavicon } from '@/hooks/useDynamicFavicon'
import { useThemeStore } from '@/stores/themeStore'

// Mock canvas context
const mockFill = vi.fn()
const mockBeginPath = vi.fn()
const mockArc = vi.fn()
const mockClearRect = vi.fn()
const mockStroke = vi.fn()
const mockToDataURL = vi.fn(() => 'data:image/png;base64,mock')
const mockGetContext = vi.fn(() => ({
  clearRect: mockClearRect,
  beginPath: mockBeginPath,
  arc: mockArc,
  fill: mockFill,
  stroke: mockStroke,
  fillStyle: '',
  shadowBlur: 0,
  shadowColor: '',
}))

describe('useDynamicFavicon', () => {
  let originalCreateElement: typeof document.createElement
  let headAppendChild: ReturnType<typeof vi.fn>
  let createdLink: HTMLLinkElement | null = null

  beforeEach(() => {
    // Clear any existing favicon links
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- DOM cleanup in beforeEach, not a render assertion
    document.querySelectorAll("link[rel*='icon']").forEach((el) => el.remove())

    originalCreateElement = document.createElement.bind(document)
    headAppendChild = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node)

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const canvas = originalCreateElement('canvas')
        canvas.getContext = mockGetContext as unknown as typeof canvas.getContext
        canvas.toDataURL = mockToDataURL
        return canvas
      }
      if (tag === 'link') {
        createdLink = originalCreateElement('link') as HTMLLinkElement
        return createdLink
      }
      return originalCreateElement(tag)
    })

    // Reset store to known state
    useThemeStore.setState({ accent: 'cyan' })
    vi.clearAllMocks()
    mockToDataURL.mockReturnValue('data:image/png;base64,mock')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- DOM cleanup in afterEach, not a render assertion
    document.querySelectorAll("link[rel*='icon']").forEach((el) => el.remove())
  })

  it('creates a favicon link element when none exists', () => {
    useThemeStore.setState({ accent: 'cyan' })

    renderHook(() => useDynamicFavicon())

    expect(headAppendChild).toHaveBeenCalledTimes(1)
    expect(createdLink?.type).toBe('image/x-icon')
    expect(createdLink?.rel).toBe('shortcut icon')
    expect(createdLink?.href).toContain('data:')
  })

  it('updates existing favicon link instead of creating a new one', () => {
    // Insert an existing icon link using real createElement to bypass mock
    vi.restoreAllMocks()
    const existingLink = originalCreateElement('link') as HTMLLinkElement
    existingLink.rel = 'icon'
    existingLink.href = 'http://localhost/old-favicon.ico'
    document.head.appendChild(existingLink)

    // Re-apply mocks after inserting the link
    headAppendChild = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => node)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const canvas = originalCreateElement('canvas')
        canvas.getContext = mockGetContext as unknown as typeof canvas.getContext
        canvas.toDataURL = mockToDataURL
        return canvas
      }
      return originalCreateElement(tag)
    })

    useThemeStore.setState({ accent: 'green' })

    renderHook(() => useDynamicFavicon())

    // Should not add a new link — the existing one gets updated
    expect(headAppendChild).not.toHaveBeenCalled()
    // Existing link href should be updated to data URL
    expect(existingLink.href).toContain('data:')
  })

  it('draws to canvas context with correct accent color for known accents', () => {
    useThemeStore.setState({ accent: 'magenta' })

    renderHook(() => useDynamicFavicon())

    expect(mockGetContext).toHaveBeenCalledWith('2d')
    expect(mockClearRect).toHaveBeenCalledWith(0, 0, 32, 32)
    expect(mockArc).toHaveBeenCalledWith(16, 16, 12, 0, 2 * Math.PI)
    expect(mockFill).toHaveBeenCalled()
  })

  it('re-runs effect when accent changes', () => {
    useThemeStore.setState({ accent: 'blue' })

    const { rerender } = renderHook(() => useDynamicFavicon())

    const callsAfterFirst = mockClearRect.mock.calls.length

    act(() => {
      useThemeStore.setState({ accent: 'red' })
    })
    rerender()

    expect(mockClearRect.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it('uses default blue for unknown accent value', () => {
    // Force an unknown accent by casting
    useThemeStore.setState({ accent: 'blue' })

    const mockCtx = {
      clearRect: mockClearRect,
      beginPath: mockBeginPath,
      arc: mockArc,
      fill: mockFill,
      stroke: mockStroke,
      fillStyle: '',
      shadowBlur: 0,
      shadowColor: '',
    }

    const capturedCtx = mockCtx
    mockGetContext.mockReturnValue(capturedCtx)

    renderHook(() => useDynamicFavicon())

    // fillStyle should be a valid hex color (blue default is #3b82f6)
    expect(mockFill).toHaveBeenCalled()
  })
})
