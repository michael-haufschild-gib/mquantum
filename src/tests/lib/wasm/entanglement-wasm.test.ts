/**
 * Tests for coordinate entanglement WASM bridge functions.
 *
 * In the vitest (happy-dom) environment, WASM is mocked/unavailable.
 * These tests verify the bridge functions gracefully return null.
 */

import { describe, expect, it } from 'vitest'

import {
  computeJointRdmWasm,
  computeRdmWasm,
  hermitianEigenvaluesWasm,
  isAnimationWasmReady,
  vonNeumannEntropyWasm,
} from '@/lib/wasm/animation-wasm'

describe('Entanglement WASM bridge — null when not ready', () => {
  it('WASM is not ready in test environment', () => {
    expect(isAnimationWasmReady()).toBe(false)
  })

  it('computeRdmWasm returns null', () => {
    const psiRe = new Float32Array(16)
    const psiIm = new Float32Array(16)
    const gridSize = new Uint32Array([4, 4])
    expect(computeRdmWasm(psiRe, psiIm, gridSize, 0)).toBeNull()
  })

  it('computeJointRdmWasm returns null', () => {
    const psiRe = new Float32Array(16)
    const psiIm = new Float32Array(16)
    const gridSize = new Uint32Array([4, 4])
    const keptDims = new Uint32Array([0, 1])
    expect(computeJointRdmWasm(psiRe, psiIm, gridSize, keptDims)).toBeNull()
  })

  it('hermitianEigenvaluesWasm returns null', () => {
    const re = new Float64Array([1, 0, 0, 1])
    const im = new Float64Array(4)
    expect(hermitianEigenvaluesWasm(re, im, 2)).toBeNull()
  })

  it('vonNeumannEntropyWasm returns null', () => {
    const eigenvalues = new Float64Array([0.5, 0.5])
    expect(vonNeumannEntropyWasm(eigenvalues)).toBeNull()
  })
})
