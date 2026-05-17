/**
 * Main-thread interface to the Dirac algebra web worker.
 *
 * Manages the worker lifecycle, request/response epochs, and provides
 * a promise-based API for gamma matrix generation.
 *
 * @example
 *   const bridge = new DiracAlgebraBridge()
 *   const { gammaData, spinorSize } = await bridge.generateMatrices(3)
 *   // gammaData is ready for device.queue.writeBuffer()
 */

import {
  generateDiracMatricesFallback,
  spinorSize as computeSpinorSize,
} from './cliffordAlgebraFallback'
import type { DiracAlgebraRequest, DiracAlgebraResponse } from './diracAlgebraWorker'

interface PendingDiracAlgebraRequest {
  spatialDim: number
  resolve: (r: { gammaData: Float32Array; spinorSize: number }) => void
  reject: (e: Error) => void
}

/** Main-thread bridge to the Dirac algebra web worker for gamma matrix generation. */
export class DiracAlgebraBridge {
  private worker: Worker | null = null
  private epoch = 0
  private pending = new Map<number, PendingDiracAlgebraRequest>()
  private workerFailed = false

  private resolveWithFallback(p: PendingDiracAlgebraRequest): void {
    try {
      p.resolve(generateDiracMatricesFallback(p.spatialDim))
    } catch (err) {
      p.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  private failWorkerAndResolvePendingWithFallback(): void {
    this.worker?.terminate()
    this.worker = null
    this.workerFailed = true

    const pending = Array.from(this.pending.values())
    this.pending.clear()
    for (const p of pending) this.resolveWithFallback(p)
  }

  private ensureWorker(): Worker | null {
    if (this.workerFailed) return null
    if (this.worker) return this.worker

    try {
      this.worker = new Worker(new URL('./diracAlgebraWorker.ts', import.meta.url), {
        type: 'module',
      })
      this.worker.onmessage = (e: MessageEvent<DiracAlgebraResponse>) => {
        const { epoch } = e.data
        const p = this.pending.get(epoch)
        if (!p) return
        if (e.data.type === 'error') {
          this.failWorkerAndResolvePendingWithFallback()
          return
        }
        if (e.data.type !== 'result') {
          this.failWorkerAndResolvePendingWithFallback()
          return
        }
        const validationError = validateGammaPayload(
          p.spatialDim,
          e.data.gammaData,
          e.data.spinorSize
        )
        if (validationError) {
          this.failWorkerAndResolvePendingWithFallback()
          return
        }
        this.pending.delete(epoch)
        p.resolve({ gammaData: e.data.gammaData, spinorSize: e.data.spinorSize })
      }
      this.worker.onerror = () => {
        this.failWorkerAndResolvePendingWithFallback()
      }
      return this.worker
    } catch {
      this.workerFailed = true
      return null
    }
  }

  /**
   * Generate Clifford algebra gamma matrices for the given spatial dimension.
   * Delegates to a web worker that uses Rust/WASM, with JS fallback if WASM
   * init fails in the worker or if the worker itself cannot be created.
   *
   * @param spatialDim - Number of spatial dimensions (1-11)
   * @returns Packed gamma matrix Float32Array and spinor component count
   */
  async generateMatrices(spatialDim: number): Promise<{
    gammaData: Float32Array
    spinorSize: number
  }> {
    computeSpinorSize(spatialDim)
    const worker = this.ensureWorker()

    if (!worker) {
      // Synchronous JS fallback
      return generateDiracMatricesFallback(spatialDim)
    }

    const epoch = ++this.epoch
    return new Promise((resolve, reject) => {
      this.pending.set(epoch, { spatialDim, resolve, reject })
      const msg: DiracAlgebraRequest = {
        type: 'generateMatrices',
        epoch,
        spatialDim,
      }
      try {
        worker.postMessage(msg)
      } catch {
        this.failWorkerAndResolvePendingWithFallback()
      }
    })
  }

  /**
   * Get spinor size synchronously (no WASM needed).
   *
   * @param spatialDim - Number of spatial dimensions
   * @returns Number of spinor components
   */
  getSpinorSize(spatialDim: number): number {
    return computeSpinorSize(spatialDim)
  }

  /**
   * Terminate the worker and reject all pending requests.
   */
  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    for (const [, p] of this.pending) {
      p.reject(new Error('DiracAlgebraBridge disposed'))
    }
    this.pending.clear()
  }
}

function validateGammaPayload(
  spatialDim: number,
  gammaData: unknown,
  spinorSize: unknown
): Error | null {
  let expectedSpinorSize: number
  try {
    expectedSpinorSize = computeSpinorSize(spatialDim)
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err))
  }

  if (!(gammaData instanceof Float32Array)) {
    return new Error('Dirac algebra worker returned invalid gamma matrix payload: gammaData')
  }
  if (spinorSize !== expectedSpinorSize) {
    return new Error(
      `Dirac algebra worker returned invalid gamma matrix payload: spinorSize ${String(spinorSize)} !== ${expectedSpinorSize}`
    )
  }

  const expectedLength = 1 + (spatialDim + 1) * expectedSpinorSize * expectedSpinorSize * 2
  if (gammaData.length !== expectedLength) {
    return new Error(
      `Dirac algebra worker returned invalid gamma matrix payload: length ${gammaData.length} !== ${expectedLength}`
    )
  }

  const header = new Uint32Array(gammaData.buffer, gammaData.byteOffset, 1)[0]
  if (header !== expectedSpinorSize) {
    return new Error(
      `Dirac algebra worker returned invalid gamma matrix payload: header ${String(header)} !== ${expectedSpinorSize}`
    )
  }

  return null
}
