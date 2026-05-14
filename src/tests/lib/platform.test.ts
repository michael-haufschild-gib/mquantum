/**
 * Tests for platform detection utilities
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { detectIsMac, getModifierSymbols, getPlatformKeyLabel, isMac } from '@/lib/platform'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('platform detection', () => {
  // Note: In Node.js test environment, navigator is undefined so isMac = false
  it('should detect non-Mac platform in test environment', () => {
    expect(isMac).toBe(false)
  })

  it('detects Mac-like platforms from explicit navigator data', () => {
    expect(detectIsMac({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe(true)
    expect(detectIsMac({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(
      false
    )
  })

  it('falls back safely when userAgentData is absent, null, or malformed', () => {
    expect(detectIsMac()).toBe(false)
    expect(detectIsMac({ userAgentData: null, platform: 'MacIntel' })).toBe(true)
    expect(detectIsMac({ userAgentData: { platform: undefined }, platform: 'iPhone' })).toBe(true)
    expect(detectIsMac({ userAgentData: null, platform: 'Linux x86_64' })).toBe(false)
  })

  it('uses Mac symbols when imported under a Mac navigator', async () => {
    vi.resetModules()
    vi.stubGlobal('navigator', { platform: 'MacIntel' })

    const platform = await import('@/lib/platform')

    expect(platform.isMac).toBe(true)
    expect(platform.getModifierSymbols()).toEqual({ ctrl: '⌘', shift: '⇧', alt: '⌥' })
    expect(platform.getPlatformKeyLabel('Delete')).toBe('⌦')
    expect(platform.getPlatformKeyLabel('Backspace')).toBe('⌫')
  })
})

describe('getModifierSymbols', () => {
  it('should return Windows/Linux symbols in test environment', () => {
    const symbols = getModifierSymbols()
    expect(symbols.ctrl).toBe('Ctrl')
    expect(symbols.shift).toBe('Shift')
    expect(symbols.alt).toBe('Alt')
  })
})

describe('getPlatformKeyLabel', () => {
  it('should convert Delete to Del on non-Mac', () => {
    expect(getPlatformKeyLabel('Delete')).toBe('Del')
  })

  it('should convert Escape to Esc', () => {
    expect(getPlatformKeyLabel('Escape')).toBe('Esc')
  })

  it('should convert arrow keys to symbols', () => {
    expect(getPlatformKeyLabel('ArrowUp')).toBe('↑')
    expect(getPlatformKeyLabel('ArrowDown')).toBe('↓')
    expect(getPlatformKeyLabel('ArrowLeft')).toBe('←')
    expect(getPlatformKeyLabel('ArrowRight')).toBe('→')
  })

  it('should convert space to Space', () => {
    expect(getPlatformKeyLabel(' ')).toBe('Space')
  })

  it('should return unknown keys as-is', () => {
    expect(getPlatformKeyLabel('a')).toBe('a')
    expect(getPlatformKeyLabel('F1')).toBe('F1')
    expect(getPlatformKeyLabel('\\')).toBe('\\')
  })
})
