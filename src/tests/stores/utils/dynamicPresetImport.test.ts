/**
 * Tests for the `loadPresetModule` helper that wraps preset-loading
 * dynamic-imports across the geometry setters.
 *
 * The helper has two public guarantees:
 * 1. The handler runs with the resolved module exports.
 * 2. Failures (rejected import or thrown handler) are swallowed and a
 *    contextual `logger.warn` is emitted; nothing escapes as an
 *    unhandled rejection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@/lib/logger'
import { loadPresetModule } from '@/stores/utils/dynamicPresetImport'

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

    loadPresetModule(() => Promise.resolve(fakeModule), 'testLabel', 'fake presets', handler)

    // Wait two microtask ticks so both the import resolution and the
    // handler invocation flush.
    await Promise.resolve()
    await Promise.resolve()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(fakeModule)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('swallows a rejected importThunk and warns with the contextual label', async () => {
    const cause = new Error('chunk load failed')
    const handler = vi.fn()

    loadPresetModule(() => Promise.reject(cause), 'testLabel', 'fake presets', handler)

    await Promise.resolve()
    await Promise.resolve()

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

    loadPresetModule(() => Promise.resolve({}), 'testLabel', 'fake presets', handler)

    await Promise.resolve()
    await Promise.resolve()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [, errorArg] = warnSpy.mock.calls[0] ?? []
    expect(errorArg).toBe(handlerErr)
  })

  it('swallows a rejected handler promise and warns', async () => {
    const handlerErr = new Error('async handler blew up')
    const handler = vi.fn(() => Promise.reject(handlerErr))

    loadPresetModule(() => Promise.resolve({}), 'testLabel', 'fake presets', handler)

    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const [, errorArg] = warnSpy.mock.calls[0] ?? []
    expect(errorArg).toBe(handlerErr)
  })
})
