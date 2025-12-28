/**
 * Tests for themeStore
 *
 * Keep these tests focused on behavior that can break in production:
 * - accepting valid themes
 * - rejecting/normalizing invalid runtime values (e.g. persisted garbage)
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from '@/stores/themeStore'

type ThemeName = 'cyan' | 'green' | 'magenta' | 'orange' | 'blue'

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'cyan' })
  })

  it('accepts a valid theme', () => {
    useThemeStore.getState().setTheme('green')
    expect(useThemeStore.getState().theme).toBe('green')
  })

  it('falls back to cyan when setTheme receives an invalid runtime value', () => {
    // Runtime values can be invalid (e.g. from persisted storage). Avoid `any` in tests.
    useThemeStore.getState().setTheme('invalid' as unknown as ThemeName)
    expect(useThemeStore.getState().theme).toBe('cyan')
  })

  it('falls back to cyan when rainbow theme is set (removed theme)', () => {
    // Rainbow theme was removed - ensure it falls back to cyan
    useThemeStore.getState().setTheme('rainbow' as unknown as ThemeName)
    expect(useThemeStore.getState().theme).toBe('cyan')
  })
})
