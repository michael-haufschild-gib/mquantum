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

import type { DiracAlgebraRequest, DiracAlgebraResponse } from './diracAlgebraWorker'
import { generateDiracMatricesFallback, spinorSize as computeSpinorSize } from './cliffordAlgebraFallback'

/** Main-thread bridge to the Dirac algebra web worker for gamma matrix generation. */
export class DiracAlgebraBridge {
  private worker: Worker | null = null
  private epoch = 0
  private pending: Map<number, {
    resolve: (r: { gammaData: Float32Array; spinorSize: number }) => void
    reject: (e: Error) => void
  }> = new Map()
  private workerFailed = false

  private ensureWorker(): Worker | null {
    if (this.workerFailed) return null
    if (this.worker) return this.worker

    try {
      this.worker = new Worker(
        new URL('./diracAlgebraWorker.ts', import.meta.url),
        { type: 'module' },
      )
      this.worker.onmessage = (e: MessageEvent<DiracAlgebraResponse>) => {
        const { epoch, gammaData, spinorSize } = e.data
        const p = this.pending.get(epoch)
        if (p) {
          this.pending.delete(epoch)
          p.resolve({ gammaData, spinorSize })
        }
      }
      this.worker.onerror = (e) => {
        for (const [, p] of this.pending) {
          p.reject(new Error(`Dirac algebra worker error: ${e.message}`))
        }
        this.pending.clear()
        this.worker?.terminate()
        this.worker = null
        this.workerFailed = true
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
    const worker = this.ensureWorker()

    if (!worker) {
      // Synchronous JS fallback
      return generateDiracMatricesFallback(spatialDim)
    }

    const epoch = ++this.epoch
    return new Promise((resolve, reject) => {
      this.pending.set(epoch, { resolve, reject })
      const msg: DiracAlgebraRequest = {
        type: 'generateMatrices',
        epoch,
        spatialDim,
      }
      worker.postMessage(msg)
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
