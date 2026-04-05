/**
 * Tests for TDSE diagnostics WASM bridge functions.
 *
 * In the vitest (happy-dom) environment, WASM is mocked/unavailable.
 * These tests verify the bridge functions gracefully return null.
 */

import { describe, expect, it } from 'vitest'

import {
  computeLevelSpacingWasm,
  computeScarCorrelationWasm,
  isAnimationWasmReady,
} from '@/lib/wasm/animation-wasm'

describe('TDSE diagnostics WASM bridge - null when not ready', () => {
  it('WASM is not ready in test environment', () => {
    expect(isAnimationWasmReady()).toBe(false)
  })

  it('computeScarCorrelationWasm returns null', () => {
    const densityRe = new Float32Array(64)
    const densityIm = new Float32Array(64)
    const gridSizes = new Uint32Array([4, 4, 4])
    const spacings = new Float64Array([1.0, 1.0, 1.0])
    const orbitPoints = new Float64Array([0, 0, 0, 1, 1, 1])
    const orbitLengths = new Uint32Array([2])
    expect(
      computeScarCorrelationWasm(
        densityRe,
        densityIm,
        gridSizes,
        spacings,
        orbitPoints,
        orbitLengths,
        1.0,
        3
      )
    ).toBeNull()
  })

  it('computeLevelSpacingWasm returns null', () => {
    const energies = new Float64Array([1, 2, 3, 4, 5])
    expect(computeLevelSpacingWasm(energies)).toBeNull()
  })
})
