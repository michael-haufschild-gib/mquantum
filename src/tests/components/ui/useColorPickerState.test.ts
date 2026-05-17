/**
 * Tests for useColorPickerState hook
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useColorPickerState } from '@/components/ui/useColorPickerState'

const HISTORY_KEY = 'mquantum_color_history'

describe('useColorPickerState', () => {
  beforeEach(() => {
    localStorage.removeItem(HISTORY_KEY)
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.removeItem(HISTORY_KEY)
  })

  describe('initialization', () => {
    it('sets mode to HEX by default', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false })
      )
      expect(result.current.mode).toBe('HEX')
    })

    it('starts closed', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false })
      )
      expect(result.current.isOpen).toBe(false)
    })

    it('initialColor matches initial value prop', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#aabbcc', onChange: vi.fn(), disableAlpha: false })
      )
      expect(result.current.initialColor).toBe('#aabbcc')
    })

    it('loads valid history from localStorage', () => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(['#ff0000', '#00ff00']))
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ffffff', onChange: vi.fn(), disableAlpha: false })
      )
      expect(result.current.history).toEqual(['#ff0000', '#00ff00'])
    })

    it('drops invalid colors and duplicates from persisted history', () => {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(['#FF0000', 'not-a-color', '#ff0000', '#zzzzzz', '#00ff00', ''])
      )
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ffffff', onChange: vi.fn(), disableAlpha: false })
      )
      expect(result.current.history).toEqual(['#ff0000', '#00ff00'])
    })

    it('keeps valid rgb and rgba history entries while rejecting malformed channels', () => {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(['rgb(12, 34, 56)', 'rgba(12, 34, 56, 0.5)', 'rgb(999, 0, 0)'])
      )
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ffffff', onChange: vi.fn(), disableAlpha: false })
      )
      expect(result.current.history).toEqual(['rgb(12, 34, 56)', 'rgba(12, 34, 56, 0.5)'])
    })

    it('returns empty history when localStorage contains non-array', () => {
      localStorage.setItem(HISTORY_KEY, '"not-array"')
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ffffff', onChange: vi.fn(), disableAlpha: false })
      )
      expect(result.current.history).toEqual([])
    })

    it('returns empty history when localStorage is corrupt JSON', () => {
      localStorage.setItem(HISTORY_KEY, '{invalid}')
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ffffff', onChange: vi.fn(), disableAlpha: false })
      )
      expect(result.current.history).toEqual([])
    })
  })

  describe('handleOpenChange', () => {
    it('sets isOpen to true when opened', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.handleOpenChange(true)
      })
      expect(result.current.isOpen).toBe(true)
    })

    it('captures initialColor snapshot when opened', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.handleOpenChange(true)
      })
      expect(result.current.initialColor).toBe('#ff0000')
    })

    it('adds current value to history when closed', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.handleOpenChange(false)
      })
      expect(result.current.history[0]).toBe('#ff0000')
    })

    it('persists history to localStorage when closed', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#aabbcc', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.handleOpenChange(false)
      })
      const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[]
      expect(stored[0]).toBe('#aabbcc')
    })

    it('adds the latest emitted color to history when prop value has not caught up', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#000000', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.handleOpenChange(true)
        result.current.handleHsvChange({ h: 0, s: 1, v: 1, a: 1 })
        result.current.handleOpenChange(false)
      })

      expect(result.current.history[0]).toBe('#ff0000')
      const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[]
      expect(stored[0]).toBe('#ff0000')
    })

    it('deduplicates repeated colors in history', () => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(['#ff0000']))
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.handleOpenChange(false)
      })
      // Should appear once, not twice
      expect(result.current.history.filter((c) => c === '#ff0000')).toHaveLength(1)
    })

    it('does not persist invalid current values into history', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: 'not-a-color', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.handleOpenChange(false)
      })

      expect(result.current.history).toEqual([])
      expect(localStorage.getItem(HISTORY_KEY)).toBeNull()
    })
  })

  describe('handleHsvChange', () => {
    it('calls onChange with hex output when alpha is 1', () => {
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#000000', onChange, disableAlpha: false })
      )
      act(() => {
        result.current.handleHsvChange({ h: 0, s: 1, v: 1, a: 1 })
      })
      // H=0, S=1, V=1 → red → #ff0000
      expect(onChange).toHaveBeenCalledWith('#ff0000')
    })

    it('calls onChange with hex8 output when alpha < 1', () => {
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#000000', onChange, disableAlpha: false })
      )
      act(() => {
        result.current.handleHsvChange({ h: 0, s: 1, v: 1, a: 0.5 })
      })
      const emitted = onChange.mock.calls[0]?.[0] as string
      expect(emitted).toMatch(/^#[0-9a-fA-F]{8}$/)
    })

    it('forces alpha=1 when disableAlpha=true', () => {
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#000000', onChange, disableAlpha: true })
      )
      act(() => {
        result.current.handleHsvChange({ h: 0, s: 1, v: 1, a: 0.3 })
      })
      const emitted = onChange.mock.calls[0]?.[0] as string
      // Output should be 6-digit hex (alpha=1), not 8-digit
      expect(emitted).toMatch(/^#[0-9a-fA-F]{6}$/)
    })

    it('routes alpha separately via onChangeAlpha when provided', () => {
      const onChange = vi.fn()
      const onChangeAlpha = vi.fn()
      const { result } = renderHook(() =>
        useColorPickerState({
          value: '#000000',
          onChange,
          onChangeAlpha,
          disableAlpha: false,
        })
      )
      act(() => {
        result.current.handleHsvChange({ h: 0, s: 1, v: 1, a: 0.75 })
      })
      expect(onChangeAlpha).toHaveBeenCalledWith(0.75)
      // onChange should receive only the hex color, no alpha channel
      expect(onChange.mock.calls[0]?.[0]).toMatch(/^#[0-9a-fA-F]{6}$/)
    })

    it('updates hexInput to matching hex string', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#000000', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.handleHsvChange({ h: 0, s: 0, v: 1, a: 1 })
      })
      // S=0, V=1 → white
      expect(result.current.hexInput.toLowerCase()).toBe('#ffffff')
    })

    it('updates rgbInput correctly', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#000000', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.handleHsvChange({ h: 0, s: 0, v: 0, a: 1 })
      })
      // Black
      expect(result.current.rgbInput.r).toBe(0)
      expect(result.current.rgbInput.g).toBe(0)
      expect(result.current.rgbInput.b).toBe(0)
    })
  })

  describe('mode switching', () => {
    it('switches from HEX to RGB', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.setMode('RGB')
      })
      expect(result.current.mode).toBe('RGB')
    })

    it('switches back from RGB to HEX', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.setMode('RGB')
        result.current.setMode('HEX')
      })
      expect(result.current.mode).toBe('HEX')
    })
  })

  describe('handleSvKeyDown', () => {
    it('increases saturation on ArrowRight', () => {
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#000000', onChange, disableAlpha: false })
      )
      // Set known HSV
      act(() => {
        result.current.handleHsvChange({ h: 0, s: 0.5, v: 0.5, a: 1 })
      })
      onChange.mockClear()
      act(() => {
        result.current.handleSvKeyDown({
          key: 'ArrowRight',
          shiftKey: false,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      })
      expect(result.current.hsv.s).toBeGreaterThan(0.5)
    })

    it('decreases value on ArrowDown', () => {
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#000000', onChange, disableAlpha: false })
      )
      act(() => {
        result.current.handleHsvChange({ h: 0, s: 0.5, v: 0.5, a: 1 })
      })
      onChange.mockClear()
      act(() => {
        result.current.handleSvKeyDown({
          key: 'ArrowDown',
          shiftKey: false,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      })
      expect(result.current.hsv.v).toBeLessThan(0.5)
    })

    it('uses larger step with Shift held', () => {
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#000000', onChange, disableAlpha: false })
      )
      act(() => {
        result.current.handleHsvChange({ h: 0, s: 0.5, v: 0.5, a: 1 })
      })
      const sBefore = result.current.hsv.s
      act(() => {
        result.current.handleSvKeyDown({
          key: 'ArrowRight',
          shiftKey: true,
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      })
      // Shift step is 0.1 vs 0.02 — diff should be ~0.1
      expect(result.current.hsv.s - sBefore).toBeGreaterThan(0.05)
    })
  })

  describe('alpha sync from external prop', () => {
    it('clamps incoming alpha > 1 to 1', async () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false, alpha: 2 })
      )
      await waitFor(() => {
        expect(result.current.hsv.a).toBe(1)
      })
    })

    it('clamps incoming alpha < 0 to 0', async () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false, alpha: -1 })
      )
      await waitFor(() => {
        expect(result.current.hsv.a).toBe(0)
      })
    })

    it('forces alpha=1 in HSV when disableAlpha=true', async () => {
      const { result } = renderHook(() =>
        useColorPickerState({
          value: '#ff0000',
          onChange: vi.fn(),
          disableAlpha: true,
          alpha: 0.5,
        })
      )
      await waitFor(() => {
        expect(result.current.hsv.a).toBe(1)
      })
    })
  })

  describe('palette and saturationBrightnessBackground', () => {
    it('saturationBrightnessBackground is a valid 6-digit hex', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false })
      )
      expect(result.current.saturationBrightnessBackground).toMatch(/^#[0-9a-fA-F]{6}$/)
    })

    it('palette is a non-empty array of hex strings', () => {
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#ff0000', onChange: vi.fn(), disableAlpha: false })
      )
      expect(result.current.palette.length).toBeGreaterThan(0)
      for (const color of result.current.palette) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    })

    it('preserves current alpha when selecting an opaque color', () => {
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#33669980', onChange, disableAlpha: false })
      )
      act(() => {
        result.current.handleHsvChange({ h: 0.58, s: 0.5, v: 0.6, a: 0.5 })
      })

      act(() => {
        result.current.handleColorSelection('#ff0000')
      })

      expect(onChange).toHaveBeenLastCalledWith('#ff000080')
    })

    it('uses explicit alpha when selected color provides one', () => {
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useColorPickerState({ value: '#33669980', onChange, disableAlpha: false })
      )

      act(() => {
        result.current.handleColorSelection('#00ff0040')
      })

      expect(onChange).toHaveBeenLastCalledWith('#00ff0040')
    })
  })

  describe('handleCopy', () => {
    it('writes current value to clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

      const { result } = renderHook(() =>
        useColorPickerState({ value: '#abcdef', onChange: vi.fn(), disableAlpha: false })
      )
      await act(async () => {
        await result.current.handleCopy()
      })
      expect(writeText).toHaveBeenCalledWith('#abcdef')
    })

    it('writes the latest emitted color when the value prop has not caught up', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

      const { result } = renderHook(() =>
        useColorPickerState({ value: '#000000', onChange: vi.fn(), disableAlpha: false })
      )
      act(() => {
        result.current.handleHsvChange({ h: 0, s: 1, v: 1, a: 1 })
      })
      await act(async () => {
        await result.current.handleCopy()
      })

      expect(writeText).toHaveBeenCalledWith('#ff0000')
    })
  })
})
