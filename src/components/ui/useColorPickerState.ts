/**
 * Color picker state management hook.
 *
 * Encapsulates HSV state, color history (localStorage), input sync,
 * SV-area dragging, and action handlers for the ColorPicker component.
 *
 * @module components/ui/useColorPickerState
 */

import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  generatePalette,
  type HSVA,
  hsvToHex,
  hsvToHex8,
  hsvToRgb,
  parseColorToHsv,
} from '@/lib/colors/colorUtils'
import { logger } from '@/lib/logger'

import {
  clampAlpha,
  handleSvArrowKey,
  HISTORY_KEY,
  MAX_HISTORY,
  normalizeColorHistoryEntry,
  sanitizeColorHistory,
} from './colorPickerUtils'

interface UseColorPickerStateArgs {
  value: string
  onChange: (value: string) => void
  alpha?: number
  onChangeAlpha?: (alpha: number) => void
  disableAlpha: boolean
}

/** Return type for the color picker state hook. */
export interface ColorPickerState {
  hsv: HSVA
  mode: 'HEX' | 'RGB'
  setMode: (mode: 'HEX' | 'RGB') => void
  history: string[]
  isOpen: boolean
  initialColor: string
  hexInput: string
  setHexInput: (hex: string) => void
  rgbInput: { r: number; g: number; b: number; a: number }
  setRgbInput: (rgb: { r: number; g: number; b: number; a: number }) => void
  svRef: React.RefObject<HTMLDivElement | null>
  isDraggingSV: boolean
  setIsDraggingSV: (dragging: boolean) => void
  palette: string[]
  saturationBrightnessBackground: string
  handleOpenChange: (open: boolean) => void
  handleHsvChange: (newHsv: HSVA) => void
  handleSvKeyDown: (e: React.KeyboardEvent) => void
  updateSV: (clientX: number, clientY: number) => void
  handleEyedropper: () => Promise<void>
  handleCopy: () => Promise<void>
}

/**
 * Manages all ColorPicker internal state: HSV, history, input sync, drag, actions.
 * @param args - Props forwarded from ColorPicker
 * @returns State and handlers for the ColorPicker UI
 */
export function useColorPickerState(args: UseColorPickerStateArgs): ColorPickerState {
  const { value, onChange, alpha, onChangeAlpha, disableAlpha } = args

  const [hsv, setHsv] = useState<HSVA>({ h: 0, s: 0, v: 0, a: 1 })
  const [mode, setMode] = useState<'HEX' | 'RGB'>('HEX')
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY)
      if (!stored) return []
      const parsed: unknown = JSON.parse(stored)
      return sanitizeColorHistory(parsed)
    } catch (error) {
      logger.warn('ColorPicker: failed to load color history', error)
      return []
    }
  })
  const [isOpen, setIsOpen] = useState(false)
  const [initialColor, setInitialColor] = useState(value)

  const lastEmittedRef = useRef<string>('')
  const sessionColorRef = useRef<string>('')

  const [hexInput, setHexInput] = useState(value)
  const [rgbInput, setRgbInput] = useState({ r: 0, g: 0, b: 0, a: 1 })

  const addToHistory = (color: string) => {
    const safeColor = normalizeColorHistoryEntry(color)
    if (!safeColor) {
      return
    }

    setHistory((prev) => {
      const safePrev = sanitizeColorHistory(prev)
      const filtered = safePrev.filter((c) => c !== safeColor)
      const newHistory = [safeColor, ...filtered].slice(0, MAX_HISTORY)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
      } catch (error) {
        logger.warn(
          'ColorPicker: failed to persist color history (likely quota exceeded or storage unavailable)',
          error
        )
      }
      return newHistory
    })
  }

  useEffect(() => {
    if (value === lastEmittedRef.current) {
      const needsAlphaSync =
        (disableAlpha && hsv.a !== 1) || (alpha !== undefined && alpha !== hsv.a)
      if (needsAlphaSync) {
        const alphaSyncTimer = window.setTimeout(() => {
          setHsv((prev) => {
            const next = { ...prev, a: disableAlpha ? 1 : clampAlpha(alpha ?? prev.a) }
            setHexInput(
              next.a === 1
                ? hsvToHex(next.h, next.s, next.v)
                : hsvToHex8(next.h, next.s, next.v, next.a)
            )
            setRgbInput(hsvToRgb(next.h, next.s, next.v, next.a))
            return next
          })
        }, 0)
        return () => clearTimeout(alphaSyncTimer)
      }
      return
    }

    const newHsv = parseColorToHsv(value)
    if (disableAlpha) {
      newHsv.a = 1
    } else if (alpha !== undefined) {
      newHsv.a = clampAlpha(alpha)
    }

    const propSyncTimer = window.setTimeout(() => {
      setHsv(newHsv)
      setHexInput(
        newHsv.a === 1
          ? hsvToHex(newHsv.h, newHsv.s, newHsv.v)
          : hsvToHex8(newHsv.h, newHsv.s, newHsv.v, newHsv.a)
      )
      setRgbInput(hsvToRgb(newHsv.h, newHsv.s, newHsv.v, newHsv.a))
    }, 0)
    return () => clearTimeout(propSyncTimer)
  }, [value, alpha, disableAlpha, hsv.a])

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) {
      sessionColorRef.current = ''
      setInitialColor(value)
    } else {
      addToHistory(sessionColorRef.current || value)
      sessionColorRef.current = ''
    }
  }

  const updateExternal = useCallback(
    (newHsv: HSVA) => {
      const safeAlpha = disableAlpha ? 1 : clampAlpha(newHsv.a)
      const safeHsv = safeAlpha === newHsv.a ? newHsv : { ...newHsv, a: safeAlpha }
      let output: string

      if (onChangeAlpha) {
        onChangeAlpha(safeHsv.a)
        output = hsvToHex(safeHsv.h, safeHsv.s, safeHsv.v)
      } else {
        if (safeHsv.a === 1) {
          output = hsvToHex(safeHsv.h, safeHsv.s, safeHsv.v)
        } else {
          output = hsvToHex8(safeHsv.h, safeHsv.s, safeHsv.v, safeHsv.a)
        }
      }

      lastEmittedRef.current = output
      sessionColorRef.current = output
      onChange(output)
      return output
    },
    [onChange, onChangeAlpha, disableAlpha]
  )

  const handleHsvChange = useCallback(
    (newHsv: HSVA) => {
      const safeHsv = disableAlpha ? { ...newHsv, a: 1 } : { ...newHsv, a: clampAlpha(newHsv.a) }
      setHsv(safeHsv)
      updateExternal(safeHsv)

      const displayHex =
        safeHsv.a === 1
          ? hsvToHex(safeHsv.h, safeHsv.s, safeHsv.v)
          : hsvToHex8(safeHsv.h, safeHsv.s, safeHsv.v, safeHsv.a)
      setHexInput(displayHex)
      setRgbInput(hsvToRgb(safeHsv.h, safeHsv.s, safeHsv.v, safeHsv.a))
    },
    [updateExternal, disableAlpha]
  )

  const svRef = useRef<HTMLDivElement>(null)
  const [isDraggingSV, setIsDraggingSV] = useState(false)

  const updateSV = useCallback(
    (clientX: number, clientY: number) => {
      if (!svRef.current) return
      const rect = svRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      handleHsvChange({ ...hsv, s: x, v: 1 - y })
    },
    [hsv, handleHsvChange]
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (isDraggingSV) updateSV(e.clientX, e.clientY)
    }
    const onUp = () => setIsDraggingSV(false)
    if (isDraggingSV) {
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [isDraggingSV, updateSV])

  const handleSvKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const result = handleSvArrowKey(e.key, e.shiftKey, hsv.s, hsv.v)
      if (result) {
        e.preventDefault()
        handleHsvChange({ ...hsv, ...result })
      }
    },
    [hsv, handleHsvChange]
  )

  const handleEyedropper = async () => {
    if (!window.EyeDropper) return
    try {
      const dropper = new window.EyeDropper()
      const result = await dropper.open()
      handleHsvChange(parseColorToHsv(result.sRGBHex))
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        logger.error('ColorPicker: EyeDropper error', error)
      }
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch (error) {
      logger.error('ColorPicker: Clipboard write failed', error)
    }
  }

  const palette = generatePalette(hsv.h, hsv.s, hsv.v)
  const saturationBrightnessBackground = hsvToHex(hsv.h, 1, 1)

  return {
    hsv,
    mode,
    setMode,
    history,
    isOpen,
    initialColor,
    hexInput,
    setHexInput,
    rgbInput,
    setRgbInput,
    svRef,
    isDraggingSV,
    setIsDraggingSV,
    palette,
    saturationBrightnessBackground,
    handleOpenChange,
    handleHsvChange,
    handleSvKeyDown,
    updateSV,
    handleEyedropper,
    handleCopy,
  }
}
