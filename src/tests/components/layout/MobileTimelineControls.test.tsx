/**
 * Mobile Bottom Panel Visibility Tests
 *
 * Tests the useMobileBottomPanel hook logic that controls when
 * the mobile bottom app bar (timeline controls) is shown/hidden.
 *
 * Visibility rule: shown when mobile viewport, both side panels closed, not cinematic mode.
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useMobileBottomPanel } from '@/hooks/useMobileBottomPanel'
import { useLayoutStore } from '@/stores/ui/layoutStore'

let mockIsDesktop = false

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsDesktop: () => mockIsDesktop,
}))

describe('useMobileBottomPanel', () => {
  beforeEach(() => {
    useLayoutStore.getState().setCollapsed(true)
    useLayoutStore.getState().setLeftPanel(false)
    useLayoutStore.getState().setCinematicMode(false)
    mockIsDesktop = false
  })

  it('returns true on mobile with both panels closed and not cinematic', () => {
    const { result } = renderHook(() => useMobileBottomPanel())
    expect(result.current).toBe(true)
  })

  it('returns false when right panel is open', () => {
    useLayoutStore.getState().setCollapsed(false)
    const { result } = renderHook(() => useMobileBottomPanel())
    expect(result.current).toBe(false)
  })

  it('returns false when left panel is open', () => {
    useLayoutStore.getState().setLeftPanel(true)
    const { result } = renderHook(() => useMobileBottomPanel())
    expect(result.current).toBe(false)
  })

  it('returns false when both panels are open', () => {
    useLayoutStore.getState().setCollapsed(false)
    useLayoutStore.getState().setLeftPanel(true)
    const { result } = renderHook(() => useMobileBottomPanel())
    expect(result.current).toBe(false)
  })

  it('returns false in cinematic mode even with panels closed', () => {
    useLayoutStore.getState().setCinematicMode(true)
    const { result } = renderHook(() => useMobileBottomPanel())
    expect(result.current).toBe(false)
  })

  it('returns false on desktop viewport regardless of panel state', () => {
    mockIsDesktop = true
    const { result } = renderHook(() => useMobileBottomPanel())
    expect(result.current).toBe(false)
  })

  it('returns false on desktop even with panels closed and not cinematic', () => {
    mockIsDesktop = true
    useLayoutStore.getState().setCollapsed(true)
    useLayoutStore.getState().setLeftPanel(false)
    useLayoutStore.getState().setCinematicMode(false)
    const { result } = renderHook(() => useMobileBottomPanel())
    expect(result.current).toBe(false)
  })
})
