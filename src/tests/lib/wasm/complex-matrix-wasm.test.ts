/**
 * Tests for complex matrix WASM bridge functions.
 *
 * In the vitest (happy-dom) environment, WASM is mocked/unavailable.
 * These tests verify the bridge functions gracefully return null.
 */

import { describe, expect, it } from 'vitest'

import {
  complexMatMulWasm,
  isAnimationWasmReady,
  matrixExponentialPadeWasm,
} from '@/lib/wasm/animation-wasm'

describe('Complex matrix WASM bridge — null when not ready', () => {
  it('WASM is not ready in test environment', () => {
    expect(isAnimationWasmReady()).toBe(false)
  })

  it('matrixExponentialPadeWasm returns null', () => {
    const n = 4
    const aRe = new Float64Array(n * n)
    const aIm = new Float64Array(n * n)
    expect(matrixExponentialPadeWasm(aRe, aIm, n)).toBeNull()
  })

  it('complexMatMulWasm returns null', () => {
    const n = 4
    const aRe = new Float64Array(n * n)
    const aIm = new Float64Array(n * n)
    const bRe = new Float64Array(n * n)
    const bIm = new Float64Array(n * n)
    expect(complexMatMulWasm(aRe, aIm, bRe, bIm, n)).toBeNull()
  })
})
