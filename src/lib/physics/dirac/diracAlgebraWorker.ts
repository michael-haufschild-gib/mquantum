/**
 * Web Worker for Dirac algebra computation.
 *
 * Generates Clifford algebra gamma matrices in Rust/WASM off the main thread.
 * Falls back to the TypeScript implementation if WASM initialization fails.
 * The matrices are generated once per dimension change and transferred back
 * as Float32Array buffers ready for GPU upload.
 *
 * Message protocol:
 *   Main → Worker: DiracAlgebraRequest
 *   Worker → Main: DiracAlgebraResponse (with Transferable gamma buffer)
 */

import { generateDiracMatricesFallback } from './cliffordAlgebraFallback'

/** Inbound message requesting gamma matrix generation. */
export interface DiracAlgebraRequest {
  type: 'generateMatrices'
  epoch: number
  spatialDim: number
}

/** Outbound result with packed gamma matrices ready for GPU upload. */
export interface DiracAlgebraResponse {
  type: 'result'
  epoch: number
  /** Packed gamma matrices: [spinorSize_bits, alpha_1..., alpha_N..., beta...] */
  gammaData: Float32Array
  spinorSize: number
}

// ---------------------------------------------------------------------------
// WASM initialization — attempt once, fall back to JS on failure
// ---------------------------------------------------------------------------

interface DiracWasmModule {
  generate_dirac_matrices_wasm: (spatialDim: number) => Float32Array
  dirac_spinor_size_wasm: (spatialDim: number) => number
}

let wasmModule: DiracWasmModule | null = null

async function initWasm(): Promise<DiracWasmModule | null> {
  try {
    const wasm = await import('@/wasm/mdimension_core/pkg/mdimension_core.js')
    await wasm.default()
    return wasm as unknown as DiracWasmModule
  } catch (err) {
    console.warn(
      '[DiracWorker] WASM init failed, using JS fallback:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

const wasmReady = initWasm().then((mod) => {
  wasmModule = mod
})

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

/**
 * Generate gamma matrices using WASM when available, JS fallback otherwise.
 */
function generateMatrices(spatialDim: number): { gammaData: Float32Array; spinorSize: number } {
  if (wasmModule) {
    const gammaData = wasmModule.generate_dirac_matrices_wasm(spatialDim)
    const spinorSize = wasmModule.dirac_spinor_size_wasm(spatialDim)
    return { gammaData, spinorSize }
  }
  return generateDiracMatricesFallback(spatialDim)
}

self.onmessage = async (e: MessageEvent<DiracAlgebraRequest>) => {
  const msg = e.data
  if (msg.type !== 'generateMatrices') return

  // Wait for WASM init on first message (no-op if already resolved)
  await wasmReady

  const result = generateMatrices(msg.spatialDim)

  const response: DiracAlgebraResponse = {
    type: 'result',
    epoch: msg.epoch,
    gammaData: result.gammaData,
    spinorSize: result.spinorSize,
  }

  self.postMessage(response, { transfer: [result.gammaData.buffer] })
}
