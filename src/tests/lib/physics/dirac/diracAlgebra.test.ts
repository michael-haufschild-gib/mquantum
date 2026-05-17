/**
 * Tests for DiracAlgebraBridge — worker lifecycle, fallback path,
 * and synchronous spinor size API.
 *
 * In the Node/Vitest environment, `Worker` is not available, so every
 * `ensureWorker()` call throws and sets `workerFailed = true`. All
 * `generateMatrices` calls therefore exercise the JS-fallback path.
 * Worker-path behaviour (postMessage round-trip, epoch management,
 * worker error propagation) is tested by injecting a mock Worker via
 * a thin subclass to expose private state.
 */

import { describe, expect, it, vi } from 'vitest'

import {
  generateDiracMatricesFallback,
  spinorSize,
} from '@/lib/physics/dirac/cliffordAlgebraFallback'
import { DiracAlgebraBridge } from '@/lib/physics/dirac/diracAlgebra'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract complex S×S matrix from packed buffer at byte-offset `offset`. */
function extractMatrix(buf: Float32Array, s: number, offset: number): Float32Array {
  return buf.slice(offset, offset + s * s * 2)
}

/** Complex S×S matrix multiply C = A·B. */
function matMul(a: Float32Array, b: Float32Array, s: number): Float32Array {
  const c = new Float32Array(s * s * 2)
  for (let i = 0; i < s; i++) {
    for (let j = 0; j < s; j++) {
      let re = 0,
        im = 0
      for (let k = 0; k < s; k++) {
        const aR = a[(i * s + k) * 2]!
        const aI = a[(i * s + k) * 2 + 1]!
        const bR = b[(k * s + j) * 2]!
        const bI = b[(k * s + j) * 2 + 1]!
        re += aR * bR - aI * bI
        im += aR * bI + aI * bR
      }
      c[(i * s + j) * 2] = re
      c[(i * s + j) * 2 + 1] = im
    }
  }
  return c
}

/** True iff matrix equals `expectedRe * I` within `tol`. */
function isScaledIdentity(m: Float32Array, s: number, expectedRe: number, tol: number): boolean {
  for (let i = 0; i < s; i++) {
    for (let j = 0; j < s; j++) {
      const re = m[(i * s + j) * 2]!
      const im = m[(i * s + j) * 2 + 1]!
      const expRe = i === j ? expectedRe : 0
      if (Math.abs(re - expRe) > tol || Math.abs(im) > tol) return false
    }
  }
  return true
}

// ── DiracAlgebraBridge — worker unavailable (fallback path) ──────────────────

describe('DiracAlgebraBridge — worker unavailable (fallback path)', () => {
  // In the node test environment, `new Worker(...)` throws, so the bridge
  // immediately falls back to the synchronous JS implementation.

  it('generates matrices via fallback when Worker constructor throws', async () => {
    const bridge = new DiracAlgebraBridge()
    const { gammaData, spinorSize: s } = await bridge.generateMatrices(3)
    // spinorSize for 3D = 4
    expect(s).toBe(4)
    // gammaData length = 1 header + 3 alphas + 1 beta, each 4×4×2 floats
    const matSize = s * s * 2
    expect(gammaData.length).toBe(1 + (3 + 1) * matSize)
    bridge.dispose()
  })

  it('spinor size is encoded as u32 bits in first float of gammaData', async () => {
    const bridge = new DiracAlgebraBridge()
    const { gammaData, spinorSize: s } = await bridge.generateMatrices(5)
    const u32 = new Uint32Array(gammaData.buffer, 0, 1)
    expect(u32[0]).toBe(s)
    bridge.dispose()
  })

  it('fallback output matches generateDiracMatricesFallback directly for dim 1-5', async () => {
    for (const dim of [1, 2, 3, 4, 5]) {
      const bridge = new DiracAlgebraBridge()
      const { gammaData: bridgeData, spinorSize: bridgeS } = await bridge.generateMatrices(dim)
      const { gammaData: refData, spinorSize: refS } = generateDiracMatricesFallback(dim)
      expect(bridgeS).toBe(refS)
      expect(bridgeData.length).toBe(refData.length)
      for (let i = 0; i < refData.length; i++) {
        // Float32 round-trip — identical bits expected (same code path)
        expect(bridgeData[i]).toBeCloseTo(refData[i]!, 6)
      }
      bridge.dispose()
    }
  })

  it('returned alpha matrices satisfy αᵢ² = I (fallback path, 3D)', async () => {
    const bridge = new DiracAlgebraBridge()
    const { gammaData, spinorSize: s } = await bridge.generateMatrices(3)
    const matSize = s * s * 2
    for (let i = 0; i < 3; i++) {
      const alpha = extractMatrix(gammaData, s, 1 + i * matSize)
      const sq = matMul(alpha, alpha, s)
      expect(isScaledIdentity(sq, s, 1, 1e-5)).toBe(true)
    }
    bridge.dispose()
  })

  it('returned beta satisfies β² = I (fallback path, 3D)', async () => {
    const bridge = new DiracAlgebraBridge()
    const { gammaData, spinorSize: s } = await bridge.generateMatrices(3)
    const matSize = s * s * 2
    const beta = extractMatrix(gammaData, s, 1 + 3 * matSize)
    const sq = matMul(beta, beta, s)
    expect(isScaledIdentity(sq, s, 1, 1e-5)).toBe(true)
    bridge.dispose()
  })

  it('workerFailed flag prevents subsequent Worker construction attempts', async () => {
    const constructorSpy = vi.fn().mockImplementation(() => {
      throw new Error('Worker unavailable')
    })
    const OrigWorker = globalThis.Worker
    Object.defineProperty(globalThis, 'Worker', { value: constructorSpy, configurable: true })

    const bridge = new DiracAlgebraBridge()
    // First call triggers ensureWorker, catches throw, sets workerFailed
    await bridge.generateMatrices(1)
    const callCountAfterFirst = constructorSpy.mock.calls.length

    // Subsequent calls must NOT re-attempt Worker construction
    await bridge.generateMatrices(1)
    await bridge.generateMatrices(1)
    expect(constructorSpy.mock.calls.length).toBe(callCountAfterFirst)

    Object.defineProperty(globalThis, 'Worker', { value: OrigWorker, configurable: true })
    bridge.dispose()
  })
})

// ── DiracAlgebraBridge.getSpinorSize ─────────────────────────────────────────

describe('DiracAlgebraBridge.getSpinorSize', () => {
  it('returns 2 for 1D (minimum spinor)', () => {
    const bridge = new DiracAlgebraBridge()
    expect(bridge.getSpinorSize(1)).toBe(2)
    bridge.dispose()
  })

  it('returns 4 for 3D', () => {
    const bridge = new DiracAlgebraBridge()
    expect(bridge.getSpinorSize(3)).toBe(4)
    bridge.dispose()
  })

  it('matches spinorSize() from cliffordAlgebraFallback for dims 1-11', () => {
    const bridge = new DiracAlgebraBridge()
    for (let d = 1; d <= 11; d++) {
      expect(bridge.getSpinorSize(d)).toBe(spinorSize(d))
    }
    bridge.dispose()
  })

  it('rejects invalid dimensions synchronously', () => {
    const bridge = new DiracAlgebraBridge()
    for (const dim of [0, 12, 2.5, Number.NaN]) {
      expect(() => bridge.getSpinorSize(dim)).toThrow(/spatialDim must be an integer in \[1, 11\]/)
    }
    bridge.dispose()
  })
})

// ── Helper: build a mock Worker class that captures handlers ─────────────────

interface MockWorkerHandle {
  postMessage: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
  triggerMessage(data: unknown): void
  triggerError(msg: string): void
}

/**
 * Install a mock Worker class on globalThis and return a handle for
 * triggering messages/errors. Restores the original after the test.
 *
 * Returns [handle, restore] tuple.
 */
function installMockWorker(): [MockWorkerHandle, () => void] {
  const postMessage = vi.fn()
  const terminate = vi.fn()
  let onmessageCb: ((e: { data: unknown }) => void) | null = null
  let onerrorCb: ((e: { message: string }) => void) | null = null

  class MockWorker {
    constructor(_url: URL, _opts: WorkerOptions) {}
    postMessage = postMessage
    terminate = terminate
    set onmessage(cb: (e: { data: unknown }) => void) {
      onmessageCb = cb
    }
    set onerror(cb: (e: { message: string }) => void) {
      onerrorCb = cb
    }
  }

  const OrigWorker = (globalThis as Record<string, unknown>)['Worker']
  Object.defineProperty(globalThis, 'Worker', { value: MockWorker, configurable: true })

  const handle: MockWorkerHandle = {
    postMessage,
    terminate,
    triggerMessage: (data) => onmessageCb?.({ data }),
    triggerError: (msg) => onerrorCb?.({ message: msg }),
  }
  const restore = () => {
    Object.defineProperty(globalThis, 'Worker', { value: OrigWorker, configurable: true })
  }
  return [handle, restore]
}

function fakeGammaPayload(spatialDim: number, fill = 0): Float32Array {
  const s = spinorSize(spatialDim)
  const data = new Float32Array(1 + (spatialDim + 1) * s * s * 2).fill(fill)
  new Uint32Array(data.buffer, data.byteOffset, 1)[0] = s
  return data
}

// ── DiracAlgebraBridge.dispose ────────────────────────────────────────────────

describe('DiracAlgebraBridge.dispose', () => {
  it('rejects pending requests with "DiracAlgebraBridge disposed"', async () => {
    const [, restore] = installMockWorker()
    const bridge = new DiracAlgebraBridge()
    const pendingPromise = bridge.generateMatrices(3)
    // dispose before the worker responds
    bridge.dispose()

    await expect(pendingPromise).rejects.toThrow('DiracAlgebraBridge disposed')
    restore()
  })

  it('terminate is called on the worker during dispose', async () => {
    const [handle, restore] = installMockWorker()
    const bridge = new DiracAlgebraBridge()
    // Kick off a request so a worker is created
    const p = bridge.generateMatrices(1)
    bridge.dispose()
    await expect(p).rejects.toThrow()
    expect(handle.terminate).toHaveBeenCalledOnce()
    restore()
  })

  it('is safe to call dispose multiple times without throwing', () => {
    const bridge = new DiracAlgebraBridge()
    expect(() => {
      bridge.dispose()
      bridge.dispose()
    }).not.toThrow()
  })
})

// ── DiracAlgebraBridge — worker error path ────────────────────────────────────

describe('DiracAlgebraBridge — worker error path', () => {
  it('resolves pending promises via JS fallback when worker fires onerror', async () => {
    const [handle, restore] = installMockWorker()
    const bridge = new DiracAlgebraBridge()
    const pendingPromise = bridge.generateMatrices(3)

    // Simulate a worker crash
    handle.triggerError('WASM failed to load')

    const { gammaData, spinorSize: s } = await pendingPromise
    const { gammaData: refData, spinorSize: refS } = generateDiracMatricesFallback(3)
    expect(s).toBe(refS)
    expect(gammaData.length).toBe(refData.length)
    restore()
    bridge.dispose()
  })

  it('falls back to JS for in-flight and subsequent calls after worker error', async () => {
    const [handle, restore] = installMockWorker()
    const bridge = new DiracAlgebraBridge()
    const fallbackPromise = bridge.generateMatrices(3)
    handle.triggerError('crash')
    await expect(fallbackPromise).resolves.toMatchObject({ spinorSize: 4 })

    // After worker error, workerFailed=true — next call uses JS fallback
    const { spinorSize: s } = await bridge.generateMatrices(3)
    expect(s).toBe(4) // correct fallback result for 3D
    // postMessage was only called once (for the failed request)
    expect(handle.postMessage).toHaveBeenCalledOnce()

    restore()
    bridge.dispose()
  })

  it('falls back to JS when postMessage throws instead of leaving a pending request', async () => {
    const [handle, restore] = installMockWorker()
    handle.postMessage.mockImplementation(() => {
      throw new Error('worker port closed')
    })
    const bridge = new DiracAlgebraBridge()

    await expect(bridge.generateMatrices(3)).resolves.toMatchObject({ spinorSize: 4 })
    expect(handle.terminate).toHaveBeenCalledOnce()

    await expect(bridge.generateMatrices(3)).resolves.toMatchObject({ spinorSize: 4 })
    expect(handle.postMessage).toHaveBeenCalledOnce()

    restore()
    bridge.dispose()
  })
})

// ── DiracAlgebraBridge — worker success path ──────────────────────────────────

describe('DiracAlgebraBridge — worker success path (mock)', () => {
  it('resolves with gammaData from worker message matching correct epoch', async () => {
    const [handle, restore] = installMockWorker()
    const mockDim = 3
    const mockSpinorSize = spinorSize(mockDim)
    const fakeGammaData = fakeGammaPayload(mockDim, 0.5)

    const bridge = new DiracAlgebraBridge()
    const resultPromise = bridge.generateMatrices(mockDim)

    // Worker responds with epoch=1
    handle.triggerMessage({
      type: 'result',
      epoch: 1,
      gammaData: fakeGammaData,
      spinorSize: mockSpinorSize,
    })

    const { gammaData, spinorSize: s } = await resultPromise
    expect(s).toBe(mockSpinorSize)
    expect(gammaData.length).toBe(fakeGammaData.length)
    // Index 1 is the first real alpha-matrix float (not the u32 header)
    expect(gammaData[1]).toBeCloseTo(0.5, 6)

    restore()
    bridge.dispose()
  })

  it('ignores stale epoch responses and resolves the correct pending request', async () => {
    const [handle, restore] = installMockWorker()
    const bridge = new DiracAlgebraBridge()
    const promise1 = bridge.generateMatrices(1) // epoch 1
    const promise2 = bridge.generateMatrices(2) // epoch 2

    const s1 = spinorSize(1) // 2
    const s2 = spinorSize(2) // 2
    const gamma1 = fakeGammaPayload(1, 1.0)
    const gamma2 = fakeGammaPayload(2, 2.0)

    // Deliver epoch 2 first (resolves promise2, promise1 still pending)
    handle.triggerMessage({ type: 'result', epoch: 2, gammaData: gamma2, spinorSize: s2 })
    const result2 = await promise2
    expect(result2.spinorSize).toBe(s2)
    // Index 1 is first real data float
    expect(result2.gammaData[1]).toBeCloseTo(2.0, 6)

    // Then deliver epoch 1
    handle.triggerMessage({ type: 'result', epoch: 1, gammaData: gamma1, spinorSize: s1 })
    const result1 = await promise1
    expect(result1.spinorSize).toBe(s1)
    expect(result1.gammaData[1]).toBeCloseTo(1.0, 6)

    restore()
    bridge.dispose()
  })

  it('postMessage is called with correct type, epoch, and spatialDim', async () => {
    const [handle, restore] = installMockWorker()
    const bridge = new DiracAlgebraBridge()
    const p = bridge.generateMatrices(5)

    // Verify the message sent to the worker
    expect(handle.postMessage).toHaveBeenCalledOnce()
    const msg = handle.postMessage.mock.calls[0]![0] as {
      type: string
      epoch: number
      spatialDim: number
    }
    expect(msg.type).toBe('generateMatrices')
    expect(msg.epoch).toBe(1)
    expect(msg.spatialDim).toBe(5)

    // Clean up — resolve to avoid hanging promise
    const s = spinorSize(5)
    handle.triggerMessage({
      type: 'result',
      epoch: 1,
      gammaData: fakeGammaPayload(5),
      spinorSize: s,
    })
    await p

    restore()
    bridge.dispose()
  })

  it('falls back to JS for malformed worker result before GPU upload can see it', async () => {
    const [handle, restore] = installMockWorker()
    const bridge = new DiracAlgebraBridge()
    const p = bridge.generateMatrices(3)

    handle.triggerMessage({
      type: 'result',
      epoch: 1,
      gammaData: new Float32Array(1),
      spinorSize: 8,
    })

    const result = await p
    expect(result.spinorSize).toBe(4)
    expect(result.gammaData.length).toBe(generateDiracMatricesFallback(3).gammaData.length)
    expect(handle.terminate).toHaveBeenCalledOnce()

    await expect(bridge.generateMatrices(3)).resolves.toMatchObject({ spinorSize: 4 })
    expect(handle.postMessage).toHaveBeenCalledOnce()

    restore()
    bridge.dispose()
  })
})
