/**
 * Tests for useKeyboardShortcuts hook
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MIN_DIMENSION } from '@/constants/dimension'
import { getShortcutLabel, SHORTCUTS, useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAnimationStore } from '@/stores/animationStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLayoutStore } from '@/stores/layoutStore'
import { useRotationStore } from '@/stores/rotationStore'

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    useAnimationStore.getState().reset()
    useGeometryStore.getState().reset()
    useLayoutStore.getState().reset()
    useRotationStore.getState().resetAllRotations()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should register event listener when enabled', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    renderHook(() => useKeyboardShortcuts({ enabled: true }))
    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('should not register event listener when disabled', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    renderHook(() => useKeyboardShortcuts({ enabled: false }))
    expect(addEventListenerSpy).not.toHaveBeenCalled()
  })

  it('should cleanup event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useKeyboardShortcuts({ enabled: true }))
    unmount()
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('should increase dimension on arrow up', () => {
    useGeometryStore.getState().setDimension(4)
    renderHook(() => useKeyboardShortcuts({ enabled: true }))

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' })
      window.dispatchEvent(event)
    })

    expect(useGeometryStore.getState().dimension).toBe(5)
  })

  it('should not increase dimension beyond MAX_DIMENSION (11)', () => {
    useGeometryStore.getState().setDimension(11)
    renderHook(() => useKeyboardShortcuts({ enabled: true }))

    const event = new KeyboardEvent('keydown', { key: 'ArrowUp' })
    window.dispatchEvent(event)

    expect(useGeometryStore.getState().dimension).toBe(11)
  })

  it('should decrease dimension on arrow down', () => {
    useGeometryStore.getState().setDimension(4)
    renderHook(() => useKeyboardShortcuts({ enabled: true }))

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
      window.dispatchEvent(event)
    })

    expect(useGeometryStore.getState().dimension).toBe(3)
  })

  it('should not decrease dimension below MIN_DIMENSION', () => {
    useGeometryStore.getState().setDimension(MIN_DIMENSION)
    renderHook(() => useKeyboardShortcuts({ enabled: true }))

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
    window.dispatchEvent(event)

    expect(useGeometryStore.getState().dimension).toBe(MIN_DIMENSION)
  })

  it('should not reverse direction on d key (now used for camera movement)', () => {
    renderHook(() => useKeyboardShortcuts({ enabled: true }))
    const initialDirection = useAnimationStore.getState().direction

    const event = new KeyboardEvent('keydown', { key: 'd' })
    window.dispatchEvent(event)

    // D key no longer affects animation direction (handled by useCameraMovement)
    expect(useAnimationStore.getState().direction).toBe(initialDirection)
  })

  it('should not trigger shortcuts in input fields', () => {
    renderHook(() => useKeyboardShortcuts({ enabled: true }))
    const initialState = useAnimationStore.getState().isPlaying

    // Create a mock input element as the event target
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const event = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
    })
    Object.defineProperty(event, 'target', { value: input })
    window.dispatchEvent(event)

    expect(useAnimationStore.getState().isPlaying).toBe(initialState)
    document.body.removeChild(input)
  })

  it('should open command palette on Ctrl+K', () => {
    renderHook(() => useKeyboardShortcuts({ enabled: true }))

    act(() => {
      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
      window.dispatchEvent(event)
    })

    expect(useLayoutStore.getState().isCommandPaletteOpen).toBe(true)
  })
})

describe('getShortcutLabel', () => {
  // Note: Tests run in Node.js where navigator is undefined, so isMac=false
  // This means Windows/Linux symbols are used (Ctrl, Shift, Alt)

  it('should format simple key (uppercase)', () => {
    expect(getShortcutLabel({ key: 'r', description: '' })).toBe('R')
  })

  it('should format space key', () => {
    expect(getShortcutLabel({ key: ' ', description: '' })).toBe('SPACE')
  })

  it('should format arrow keys', () => {
    expect(getShortcutLabel({ key: 'ArrowUp', description: '' })).toBe('↑')
    expect(getShortcutLabel({ key: 'ArrowDown', description: '' })).toBe('↓')
  })

  it('should format ctrl + key (space-separated)', () => {
    expect(getShortcutLabel({ key: 's', ctrl: true, description: '' })).toBe('Ctrl S')
  })

  it('should format shift + key (space-separated)', () => {
    expect(getShortcutLabel({ key: 'a', shift: true, description: '' })).toBe('Shift A')
  })

  it('should format alt + key (space-separated)', () => {
    expect(getShortcutLabel({ key: 'a', alt: true, description: '' })).toBe('Alt A')
  })

  it('should format multiple modifiers (space-separated)', () => {
    expect(getShortcutLabel({ key: 's', ctrl: true, shift: true, description: '' })).toBe(
      'Ctrl Shift S'
    )
  })
})

describe('SHORTCUTS', () => {
  it('should have all required shortcuts defined', () => {
    expect(SHORTCUTS.length).toBeGreaterThan(0)

    SHORTCUTS.forEach((shortcut) => {
      expect(shortcut.key).toEqual(expect.any(String))
      expect(shortcut.description).toEqual(expect.any(String))
    })
  })

  it('should have arrow shortcuts for dimension', () => {
    const upShortcut = SHORTCUTS.find((s) => s.key === 'ArrowUp')
    const downShortcut = SHORTCUTS.find((s) => s.key === 'ArrowDown')
    expect(upShortcut).toEqual(expect.objectContaining({ key: 'ArrowUp' }))
    expect(downShortcut).toEqual(expect.objectContaining({ key: 'ArrowDown' }))
  })

  it('does not list WASD camera shortcuts (unimplemented — see SHORTCUTS comment)', () => {
    // Regression: WASD camera movement / Shift+WASD camera rotation entries
    // were declared without a handler. "Light: Move mode" entries (also "w"/
    // "d") and the Ctrl+S export shortcut still exist because they DO have
    // handlers, so we filter them out. This covers all four keys (w/a/s/d)
    // in both plain and shift form so that re-introducing *any* unimplemented
    // WASD variant would fail the check.
    const findNonLightCameraEntry = (key: string, shift = false) =>
      SHORTCUTS.find(
        (s) =>
          s.key === key &&
          Boolean(s.shift) === shift &&
          !s.ctrl &&
          !s.alt &&
          !s.description.startsWith('Light:')
      )

    for (const key of ['w', 'a', 's', 'd']) {
      expect(findNonLightCameraEntry(key)).toBeUndefined()
      expect(findNonLightCameraEntry(key, true)).toBeUndefined()
    }
  })

  it('does not list 0 / Shift+0 camera-origin shortcuts (unimplemented)', () => {
    const moveToOrigin = SHORTCUTS.find((s) => s.key === '0' && !s.shift)
    const lookAtOrigin = SHORTCUTS.find((s) => s.key === '0' && s.shift)
    expect(moveToOrigin).toBeUndefined()
    expect(lookAtOrigin).toBeUndefined()
  })
})
