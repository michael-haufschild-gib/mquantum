/**
 * Shared ring buffer test factory for diagnostics store channels.
 *
 * All ring-buffer-backed diagnostic channels (TDSE, BEC, Dirac, FSF,
 * Pauli, OpenQuantum, Observables) use the same `advanceRingBuffer()`
 * function and follow the same head/count/wrap pattern. This factory
 * generates the 6 standard behavioral tests so each mode file only
 * needs to test mode-specific logic.
 *
 * @module tests/stores/diagnostics/ringBufferTests
 */

import { describe, expect, it } from 'vitest'

import { HISTORY_LENGTH } from '@/stores/diagnostics/types'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

interface RingBufferTestConfig {
  /** Channel key on the store state, e.g. 'tdse'. */
  channelKey: string
  /** Push one entry with a known test value into the ring buffer. */
  pushOnce: () => void
  /** Push with a specific value that ends up in `historyArrayKey`. */
  pushWithValue: (value: number) => void
  /** Reset function name on the store, e.g. 'resetTdse'. */
  resetFn: string
  /** One history Float32Array key to verify writes/freshness, e.g. 'historyNorm'. */
  historyArrayKey: string
  /** The value that `pushOnce` writes into `historyArrayKey[0]`. */
  testValue: number
  /** Set to false for channels without a `hasData` field (e.g. openQuantum). */
  hasDataField?: boolean
}

type StoreState = Record<string, unknown>

/** Ring-buffer-backed diagnostic channel state fields accessed in these tests. */
interface ChannelState {
  hasData?: boolean
  historyHead: number
  historyCount: number
  [historyKey: string]: unknown
}

/**
 * Generates standard ring buffer behavioral tests for a diagnostics channel.
 *
 * Call inside a `describe` block for the mode. The factory creates its own
 * nested `describe('ring buffer behavior', ...)` block with 6 tests.
 *
 * @example
 * ```ts
 * describe('tdseDiagnosticsStore', () => {
 *   beforeEach(() => { useDiagnosticsStore.getState().resetTdse() })
 *   describeRingBufferBehavior({ channelKey: 'tdse', ... })
 *   // mode-specific tests below
 * })
 * ```
 */
export function describeRingBufferBehavior(config: RingBufferTestConfig): void {
  const { channelKey, pushOnce, pushWithValue, resetFn, historyArrayKey, testValue } = config
  const hasDataField = config.hasDataField ?? true

  const getChannel = (): ChannelState => {
    const state = useDiagnosticsStore.getState() as unknown as StoreState
    const channel = state[channelKey]
    if (!channel || typeof channel !== 'object') {
      throw new Error(
        `describeRingBufferBehavior: channelKey "${channelKey}" is missing or not an object`
      )
    }
    return channel as ChannelState
  }
  const reset = (): void => {
    const state = useDiagnosticsStore.getState() as unknown as StoreState
    const fn = state[resetFn]
    if (typeof fn !== 'function') {
      throw new Error(
        `describeRingBufferBehavior: resetFn "${resetFn}" is not a function on the store`
      )
    }
    ;(fn as () => void)()
  }

  describe('ring buffer behavior', () => {
    if (hasDataField) {
      it('first push sets hasData=true', () => {
        pushOnce()
        expect(getChannel().hasData).toBe(true)
      })
    }

    it('advances head and count on each push', () => {
      pushOnce()
      expect(getChannel().historyHead).toBe(1)
      expect(getChannel().historyCount).toBe(1)

      pushOnce()
      expect(getChannel().historyHead).toBe(2)
      expect(getChannel().historyCount).toBe(2)
    })

    it('writes values into TypedArray at head position', () => {
      pushOnce()
      const arr = getChannel()[historyArrayKey] as Float32Array
      expect(arr[0]).toBeCloseTo(testValue)
    })

    it(`wraps at ${HISTORY_LENGTH} entries`, () => {
      for (let i = 0; i < HISTORY_LENGTH; i++) {
        pushOnce()
      }
      expect(getChannel().historyHead).toBe(0)
      expect(getChannel().historyCount).toBe(HISTORY_LENGTH)

      // One more wraps head to 1 and overwrites slot 0
      pushWithValue(0.12345)
      expect(getChannel().historyHead).toBe(1)
      expect(getChannel().historyCount).toBe(HISTORY_LENGTH)
      const arr = getChannel()[historyArrayKey] as Float32Array
      expect(arr[0]).toBeCloseTo(0.12345)
    })

    it(`historyCount saturates at ${HISTORY_LENGTH}`, () => {
      for (let i = 0; i < HISTORY_LENGTH + 80; i++) {
        pushOnce()
      }
      expect(getChannel().historyCount).toBe(HISTORY_LENGTH)
    })

    it('reset clears counters and allocates fresh TypedArrays', () => {
      for (let i = 0; i < 10; i++) {
        pushOnce()
      }
      const arrayBefore = getChannel()[historyArrayKey] as Float32Array

      reset()

      const ch = getChannel()
      if (hasDataField) {
        expect(ch.hasData).toBe(false)
      }
      expect(ch.historyHead).toBe(0)
      expect(ch.historyCount).toBe(0)
      expect(ch[historyArrayKey]).not.toBe(arrayBefore)
      expect((ch[historyArrayKey] as Float32Array).every((v: number) => v === 0)).toBe(true)
    })
  })
}
