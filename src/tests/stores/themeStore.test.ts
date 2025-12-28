/**
 * Tests for themeStore
 *
 * Keep these tests focused on behavior that can break in production:
 * - accepting valid themes
 * - rejecting/normalizing invalid runtime values (e.g. persisted garbage)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useThemeStore, ThemeAccent } from '@/stores/themeStore'

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ accent: 'cyan', mode: 'dark' })
  })

  it('accepts a valid accent', () => {
    useThemeStore.getState().setAccent('green')
    expect(useThemeStore.getState().accent).toBe('green')
  })

  it('rejects an invalid accent', () => {
    useThemeStore.getState().setAccent('invalid' as unknown as ThemeAccent)
    expect(useThemeStore.getState().accent).toBe('cyan')
  })

  it('accepts a valid mode', () => {
    useThemeStore.getState().setMode('light')
    expect(useThemeStore.getState().mode).toBe('light')
  })
})
