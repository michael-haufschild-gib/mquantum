/**
 * Tests for useToast hook.
 * Verifies the context boundary check.
 */

import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useToast } from '@/hooks/useToast'

describe('useToast', () => {
  it('throws when used outside ToastProvider', () => {
    expect(() => {
      renderHook(() => useToast())
    }).toThrow('useToast must be used within a ToastProvider')
  })
})
