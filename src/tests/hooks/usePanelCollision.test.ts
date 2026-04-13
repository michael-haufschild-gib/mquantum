/**
 * Tests for usePanelCollision hook.
 *
 * Strategy: mock motion/react springs as synchronous values (no animations),
 * mock useIsDesktop, set layoutStore state, then assert x/y MotionValues are
 * clamped to the expected positions.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePanelCollision } from '@/hooks/usePanelCollision'
import { useLayoutStore } from '@/stores/layoutStore'

// ── Spring mock ──────────────────────────────────────────────────────────────
// Replace motion springs with synchronous MotionValue stand-ins.
// Each spring immediately reflects its set() calls and invokes 'change' listeners.

type ChangeListener = (v: number) => void

function makeSyncSpring(initial: number) {
  let _val = initial
  const listeners = new Set<ChangeListener>()
  return {
    get: () => _val,
    set: (v: number) => {
      _val = v
      listeners.forEach((fn) => fn(v))
    },
    on: (event: string, fn: ChangeListener) => {
      if (event === 'change') listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}

// Springs created per call to useSpring — store them so tests can inspect them.
const createdSprings: ReturnType<typeof makeSyncSpring>[] = []

vi.mock('motion/react', () => ({
  useSpring: (initial: number) => {
    const spring = makeSyncSpring(initial)
    createdSprings.push(spring)
    return spring
  },
}))

// ── useIsDesktop mock ─────────────────────────────────────────────────────────
let mockIsDesktop = true
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsDesktop: () => mockIsDesktop,
}))

// ── MotionValue helper ────────────────────────────────────────────────────────
function makeMotionValue(initial: number) {
  let _val = initial
  return {
    get: () => _val,
    set: (v: number) => {
      _val = v
    },
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Constants from the hook (duplicated here to make test math explicit):
// SIDEBAR_WIDTH=320, TOP_BAR_HEIGHT=48, BOTTOM_BAR_HEIGHT=48, GAP=16
// ANCHOR_TOP=80, ANCHOR_LEFT=16

function resetLayout() {
  useLayoutStore.setState({
    showLeftPanel: false,
    isCollapsed: true,
    isCinematicMode: false,
    sidebarWidth: 320,
    showShortcuts: false,
  })
}

describe('usePanelCollision', () => {
  beforeEach(() => {
    createdSprings.length = 0
    mockIsDesktop = true
    resetLayout()
    // Fixed viewport
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true, configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── No panels open ─────────────────────────────────────────────────────────
  it('does not clamp x/y when all panels are hidden and element fits', () => {
    // All panels hidden → springs at 0
    // minX = 0 + 16 - 16 = 0; maxX = 1280 - 0 - 16 - 100 = 1164
    // minY = 0 + 16 - 80 = -64; maxY = 800 - 0 - 16 - 50 = 734
    const x = makeMotionValue(200)
    const y = makeMotionValue(100)

    renderHook(() => usePanelCollision(x as never, y as never, 100, 50, false))

    expect(x.get()).toBe(200)
    expect(y.get()).toBe(100)
  })

  // ── Left panel pushes x right ─────────────────────────────────────────────
  it('clamps x to the right of the left panel when left panel is open', () => {
    useLayoutStore.setState({ showLeftPanel: true, isCinematicMode: false })
    // Spring for left panel = 1 → leftPanelWidth = 320
    // minX = 320 + 16 - 16 = 320
    const x = makeMotionValue(0) // too far left
    const y = makeMotionValue(100)

    renderHook(() => usePanelCollision(x as never, y as never, 100, 50, false))

    expect(x.get()).toBe(320)
  })

  // ── Right panel clamps x left ─────────────────────────────────────────────
  it('clamps x to the left of the right panel when right panel is open', () => {
    useLayoutStore.setState({ isCollapsed: false, isCinematicMode: false })
    // rightPanelWidth = 320
    // maxX = (1280 - 320 - 16) - 16 - 100 = 828
    const x = makeMotionValue(900) // too far right
    const y = makeMotionValue(100)

    renderHook(() => usePanelCollision(x as never, y as never, 100, 50, false))

    expect(x.get()).toBe(828)
  })

  // ── Top bar pushes y down ─────────────────────────────────────────────────
  it('clamps y below the top bar when cinematic mode is off', () => {
    useLayoutStore.setState({ isCinematicMode: false })
    // topBarHeight = 48, minY = 48 + 16 - 80 = -16
    const x = makeMotionValue(200)
    const y = makeMotionValue(-50) // above minY
    renderHook(() => usePanelCollision(x as never, y as never, 100, 50, false))
    expect(y.get()).toBe(-16)
  })

  // ── Bottom bar clamps y up ─────────────────────────────────────────────────
  it('clamps y above the bottom bar on desktop', () => {
    useLayoutStore.setState({ isCinematicMode: false })
    mockIsDesktop = true
    // bottomBarHeight = 48, maxY = (800 - 48 - 16) - 80 - 50 = 606
    const x = makeMotionValue(200)
    const y = makeMotionValue(700) // below maxY
    renderHook(() => usePanelCollision(x as never, y as never, 100, 50, false))
    expect(y.get()).toBe(606)
  })

  // ── Cinematic mode: all constraints removed ────────────────────────────────
  it('does not constrain position in cinematic mode', () => {
    useLayoutStore.setState({ isCinematicMode: true, showLeftPanel: true, isCollapsed: false })
    // All springs → 0 in cinematic mode
    // minX = 0 + 16 - 16 = 0 (element at 200 → no clamp)
    const x = makeMotionValue(200)
    const y = makeMotionValue(100)
    renderHook(() => usePanelCollision(x as never, y as never, 100, 50, false))
    expect(x.get()).toBe(200)
    expect(y.get()).toBe(100)
  })

  // ── isDragging skips collision check ──────────────────────────────────────
  it('skips collision adjustment while dragging', () => {
    useLayoutStore.setState({ showLeftPanel: true, isCinematicMode: false })
    const x = makeMotionValue(0) // would be clamped to 320 if not dragging
    const y = makeMotionValue(100)
    renderHook(() => usePanelCollision(x as never, y as never, 100, 50, true))
    expect(x.get()).toBe(0)
  })

  // ── Narrow screen: minX > maxX → prioritize left ──────────────────────────
  it('prioritizes left visibility when screen is too narrow', () => {
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true, configurable: true })
    useLayoutStore.setState({ showLeftPanel: true, isCollapsed: false, isCinematicMode: false })
    // leftPanelWidth=320, minX=320; rightPanelWidth=320, maxX=400-320-16-16-200=-152
    // minX > maxX → newX = minX = 320
    const x = makeMotionValue(0)
    const y = makeMotionValue(100)
    renderHook(() => usePanelCollision(x as never, y as never, 200, 50, false))
    expect(x.get()).toBe(320)
  })

  // ── Short screen: minY > maxY → prioritize top ────────────────────────────
  it('prioritizes top visibility when screen is too short', () => {
    Object.defineProperty(window, 'innerHeight', { value: 120, writable: true, configurable: true })
    useLayoutStore.setState({ isCinematicMode: false })
    // topBarHeight=48, minY=48+16-80=-16
    // bottomBarHeight=48, maxY=(120-48-16)-80-200=-224  → minY > maxY → newY = minY = -16
    const x = makeMotionValue(200)
    const y = makeMotionValue(0)
    renderHook(() => usePanelCollision(x as never, y as never, 100, 200, false))
    expect(y.get()).toBe(-16)
  })

  // ── Resize triggers re-check ───────────────────────────────────────────────
  it('re-checks collision on window resize', () => {
    useLayoutStore.setState({ showLeftPanel: true, isCinematicMode: false })
    const x = makeMotionValue(200)
    const y = makeMotionValue(100)
    renderHook(() => usePanelCollision(x as never, y as never, 100, 50, false))
    // After initial render x gets clamped. Now shrink the window.
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        value: 200,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event('resize'))
    })
    // x is now anything ≥ 320 (minX stays 320, maxX goes negative → minX wins)
    expect(x.get()).toBe(320)
  })

  // ── No bottom bar on mobile ────────────────────────────────────────────────
  it('does not apply bottom bar constraint on mobile', () => {
    mockIsDesktop = false
    useLayoutStore.setState({ isCinematicMode: false })
    // bottomSpring = 0 (showBottomPanel = false on mobile)
    // maxY = (800 - 0 - 16) - 80 - 50 = 654
    const x = makeMotionValue(200)
    const y = makeMotionValue(700) // above maxY=654 only if bottom bar is active
    renderHook(() => usePanelCollision(x as never, y as never, 100, 50, false))
    expect(y.get()).toBe(654)
  })

  // ── Value within threshold is not re-set ──────────────────────────────────
  it('does not update x/y when already within 0.5px threshold', () => {
    useLayoutStore.setState({ showLeftPanel: true, isCinematicMode: false })
    // minX = 320; element at 320.3 → diff = 0.3 < 0.5 → no set
    const x = makeMotionValue(320.3)
    const setSpy = vi.spyOn(x, 'set')
    const y = makeMotionValue(100)
    renderHook(() => usePanelCollision(x as never, y as never, 100, 50, false))
    expect(setSpy).not.toHaveBeenCalled()
  })
})
