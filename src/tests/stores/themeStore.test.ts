/**
 * Tests for themeStore — mode/accent validation and preset application.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { ThemeAccent, ThemeMode, useThemeStore, VALID_ACCENTS } from '@/stores/themeStore'

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ accent: 'cyan', mode: 'dark' })
  })

  it('accepts all valid accents', () => {
    for (const accent of VALID_ACCENTS) {
      useThemeStore.getState().setAccent(accent)
      expect(useThemeStore.getState().accent).toBe(accent)
    }
  })

  it('falls back to cyan for invalid accent', () => {
    useThemeStore.getState().setAccent('green')
    useThemeStore.getState().setAccent('invalid' as unknown as ThemeAccent)
    expect(useThemeStore.getState().accent).toBe('cyan')
  })

  it('accepts all valid modes', () => {
    for (const mode of ['light', 'dark', 'system'] as const) {
      useThemeStore.getState().setMode(mode)
      expect(useThemeStore.getState().mode).toBe(mode)
    }
  })

  it('ignores invalid mode values', () => {
    useThemeStore.getState().setMode('light')
    useThemeStore.getState().setMode('auto' as unknown as ThemeMode)
    expect(useThemeStore.getState().mode).toBe('light')
  })

  it('setPreset applies both mode and accent', () => {
    useThemeStore.getState().setPreset('paper')
    const state = useThemeStore.getState()
    expect(state.mode).toBe('light')
    expect(state.accent).toBe('blue')
  })

  it('setPreset ignores unknown preset IDs', () => {
    useThemeStore.getState().setMode('light')
    useThemeStore.getState().setAccent('red')
    useThemeStore.getState().setPreset('nonexistent')
    expect(useThemeStore.getState().mode).toBe('light')
    expect(useThemeStore.getState().accent).toBe('red')
  })
})
