/**
 * Phase 4 — Fast Fourier Transform WASM bindings.
 *
 * Used by the TDSE and free-scalar pipelines for k-space transforms on
 * the CPU side (the GPU pipeline has its own Stockham FFT). Forward and
 * inverse 1D / N-dimensional variants. The WASM ABI accepts and returns
 * interleaved `[re, im]` complex `Float64Array` data.
 *
 * @module lib/wasm/animation/fft
 */

import { logger } from '@/lib/logger'

import { getWasmRuntime } from './runtime'

/**
 * 1D forward FFT via WASM.
 *
 * @param data - Interleaved complex data `[re0, im0, re1, im1, ...]`
 * @param n - Number of complex elements (power of 2, >= 2)
 * @returns Transformed data as Float64Array, or null if WASM not ready
 */
export function fft1dWasm(data: Float64Array, n: number): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  try {
    return module.fft_1d_wasm(data, n)
  } catch (err) {
    logger.warn('[AnimationWASM] fft_1d_wasm failed:', err)
    return null
  }
}

/**
 * 1D inverse FFT via WASM (with 1/N normalization).
 *
 * @param data - Interleaved complex data `[re0, im0, re1, im1, ...]`
 * @param n - Number of complex elements (power of 2)
 * @returns Transformed data as Float64Array, or null if WASM not ready
 */
export function ifft1dWasm(data: Float64Array, n: number): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  try {
    return module.ifft_1d_wasm(data, n)
  } catch (err) {
    logger.warn('[AnimationWASM] ifft_1d_wasm failed:', err)
    return null
  }
}

/**
 * N-dimensional forward FFT via WASM.
 *
 * @param data - Interleaved complex data
 * @param gridSize - Grid sizes per dimension as Uint32Array
 * @returns Transformed data as Float64Array, or null if WASM not ready
 */
export function fftNdWasm(data: Float64Array, gridSize: Uint32Array): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  try {
    return module.fft_nd_wasm(data, gridSize)
  } catch (err) {
    logger.warn('[AnimationWASM] fft_nd_wasm failed:', err)
    return null
  }
}

/**
 * N-dimensional inverse FFT via WASM.
 *
 * @param data - Interleaved complex data
 * @param gridSize - Grid sizes per dimension as Uint32Array
 * @returns Transformed data as Float64Array, or null if WASM not ready
 */
export function ifftNdWasm(data: Float64Array, gridSize: Uint32Array): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  try {
    return module.ifft_nd_wasm(data, gridSize)
  } catch (err) {
    logger.warn('[AnimationWASM] ifft_nd_wasm failed:', err)
    return null
  }
}
