/**
 * Tests for the structured `WebGPUInitError` contract.
 *
 * The init failure path collapses to a discriminated union with a
 * required `code: WebGPUInitErrorCode` so consumers (UI overlay, e2e
 * tests, telemetry) can branch on the failure mode without parsing the
 * human-readable `error` string. These tests pin the contract.
 */

import { describe, expect, it } from 'vitest'

import type { WebGPUInitErrorCode, WebGPUInitFailure } from '@/rendering/webgpu/core/types'
import { WebGPUInitError } from '@/rendering/webgpu/core/types'

describe('WebGPUInitError', () => {
  it('captures code, message, and an optional cause', () => {
    const cause = new Error('underlying')
    const err = new WebGPUInitError('DEVICE_REQUEST_FAILED', 'rejected', cause)
    expect(err.code).toBe('DEVICE_REQUEST_FAILED')
    expect(err.message).toBe('rejected')
    expect(err.cause).toBe(cause)
    expect(err.name).toBe('WebGPUInitError')
  })

  it('omits cause when not supplied', () => {
    const err = new WebGPUInitError('NO_NAVIGATOR_GPU', 'unsupported')
    expect(err.code).toBe('NO_NAVIGATOR_GPU')
    expect(err.cause).toBeUndefined()
  })

  it('is detectable via instanceof', () => {
    const err: unknown = new WebGPUInitError('INTERNAL_ERROR', 'oops')
    expect(err instanceof WebGPUInitError).toBe(true)
    expect(err instanceof Error).toBe(true)
  })
})

describe('WebGPUInitFailure shape', () => {
  // The narrowing test below pins the discriminated-union contract:
  // every failure must carry `success: false`, a `code`, and an `error`
  // string. Type-only — the test compiles iff the contract holds.
  it('has the documented discriminated-union shape', () => {
    const codes: WebGPUInitErrorCode[] = [
      'NO_NAVIGATOR_GPU',
      'ADAPTER_REQUEST_FAILED',
      'DEVICE_REQUEST_FAILED',
      'CONTEXT_CONFIGURE_FAILED',
      'INTERNAL_ERROR',
    ]
    for (const code of codes) {
      const failure: WebGPUInitFailure = {
        success: false,
        code,
        error: `${code} message`,
      }
      expect(failure.success).toBe(false)
      expect(failure.code).toBe(code)
      expect(failure.error).toContain(code)
    }
  })
})
