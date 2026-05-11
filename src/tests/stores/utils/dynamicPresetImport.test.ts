/**
 * Tests for the `loadPresetModule` helper that wraps preset-loading
 * dynamic-imports across the geometry setters.
 *
 * The helper has two public guarantees:
 * 1. The handler runs with the resolved module exports.
 * 2. The returned promise settles after the handler has completed.
 * 3. Failures (rejected import or thrown handler) are swallowed and a
 *    contextual `logger.warn` is emitted; nothing escapes as an
 *    unhandled rejection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@/lib/logger'
import {
  beginDynamicPresetApply,
  invalidateDynamicPresetApplies,
  loadPresetModule,
} from '@/stores/utils/dynamicPresetImport'

describe('beginDynamicPresetApply', () => {
  it('invalidates older guards when a newer preset apply starts', () => {
    const firstGuard = beginDynamicPresetApply()
    const secondGuard = beginDynamicPresetApply()

    expect(firstGuard()).toBe(false)
    expect(secondGuard()).toBe(true)

    invalidateDynamicPresetApplies()
    expect(secondGuard()).toBe(false)
  })
})

describe('loadPresetModule', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('invokes the handler with the resolved module exports', async () => {
    const fakeModule = { somePresets: ['a', 'b'] }
    const handler = vi.fn()

    await loadPresetModule(() => Promise.resolve(fakeModule), 'testLabel', 'fake presets', handler)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(fakeModule)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('swallows a rejected importThunk and warns with the contextual label', async () => {
    const cause = new Error('chunk load failed')
    const handler = vi.fn()

    await loadPresetModule(() => Promise.reject(cause), 'testLabel', 'fake presets', handler)

    expect(handler).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [message, errorArg] = warnSpy.mock.calls[0] ?? []
    expect(message).toBe('[testLabel] Failed to load fake presets:')
    expect(errorArg).toBe(cause)
  })

  it('swallows a synchronously-thrown handler error and warns', async () => {
    const handlerErr = new Error('handler blew up')
    const handler = vi.fn(() => {
      throw handlerErr
    })

    await loadPresetModule(() => Promise.resolve({}), 'testLabel', 'fake presets', handler)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [, errorArg] = warnSpy.mock.calls[0] ?? []
    expect(errorArg).toBe(handlerErr)
  })

  it('swallows a rejected handler promise and warns', async () => {
    const handlerErr = new Error('async handler blew up')
    const handler = vi.fn(() => Promise.reject(handlerErr))

    await loadPresetModule(() => Promise.resolve({}), 'testLabel', 'fake presets', handler)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [, errorArg] = warnSpy.mock.calls[0] ?? []
    expect(errorArg).toBe(handlerErr)
  })

  it('resolves only after an async handler finishes', async () => {
    const events: string[] = []

    const result = loadPresetModule(
      () => Promise.resolve({}),
      'testLabel',
      'fake presets',
      async () => {
        events.push('handler:start')
        await Promise.resolve()
        events.push('handler:end')
      }
    )

    expect(events).toEqual([])
    await result
    expect(events).toEqual(['handler:start', 'handler:end'])
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
