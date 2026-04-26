/**
 * FFT twiddle-factor table — shared by TDSE, Dirac, and Pauli compute paths.
 *
 * Replaces per-thread `cos(angle), sin(angle)` in the Stockham radix-2 butterfly
 * (stages s >= 2) with a single `storage` read into a CPU-precomputed table.
 *
 * Layout (interleaved `[re, im]` floats):
 *   `table[2*k]     = cos(2*pi*k / N_MAX_FFT_TWIDDLE)`
 *   `table[2*k + 1] = -sin(2*pi*k / N_MAX_FFT_TWIDDLE)`     for `k in [0, N_MAX_FFT_TWIDDLE/2)`
 *
 * The stored value is the *forward* twiddle in the shader's sign convention
 *   `anglePerJ = -dir * 2*pi / fullStage`  (dir = +1 forward, -1 inverse).
 * For dir = +1 the shader would compute `(cos(-a), sin(-a)) = (cos a, -sin a)` —
 * exactly what's stored. For dir = -1 the shader flips the imaginary component
 * via `tw = vec2f(twFwd.x, dir * twFwd.y)`. This keeps the table half-sized
 * (one table for both directions) and avoids any runtime `cos/sin`.
 *
 * Stage stride derivation: for axis length `N_axis <= N_MAX_FFT_TWIDDLE`,
 * stage `s in [2, log2(N_axis)-1]` has `fullStage = 2^(s+1)`, and the twiddle
 * the butterfly wants is `exp(-i*2*pi*j / fullStage) = exp(-i*2*pi*k / N_MAX)`
 * with `k = j * (N_MAX / fullStage)`. Because `N_MAX` is a power of two and
 * `fullStage <= N_MAX`, the stride `N_MAX / fullStage = N_MAX >> (s + 1)` is
 * a power of two and uniform across the `halfStage` butterfly threads — so
 * every thread in a warp hits a strided, aligned region of the table.
 *
 * Why `N_MAX = 128` is fixed: every compute-path lattice is clamped to powers
 * of two in `[2, 128]` by `nearestPow2` (see `computePassUtils.ts`). Sizing
 * the table at the max handles every axis in one 512-byte allocation; the
 * buffer is rebuilt only when grid dimensions change.
 *
 * @module rendering/webgpu/passes/FFTTwiddle
 */

/**
 * Maximum FFT axis length supported by the twiddle table.
 *
 * Matches the `const N_MAX_FFT_TWIDDLE` declared in the WGSL shader blocks
 * `tdseSharedMemFFTTwiddleBlock` and `tdseStockhamFFTTwiddleBlock`. If you
 * change this value, update both.
 */
export const N_MAX_FFT_TWIDDLE = 128

/**
 * Number of complex twiddles stored (`= N_MAX_FFT_TWIDDLE / 2`).
 *
 * One per unique `j * stride` index the butterfly hits at stage
 * `log2(N_MAX_FFT_TWIDDLE) - 1`. All lower stages index into this same table
 * at power-of-two strides.
 */
export const FFT_TWIDDLE_COMPLEX_COUNT = N_MAX_FFT_TWIDDLE / 2

/**
 * Total bytes of the twiddle GPU buffer (`FFT_TWIDDLE_COMPLEX_COUNT * 8`).
 *
 * 64 complex values * 8 bytes/complex = 512 bytes for `N_MAX_FFT_TWIDDLE = 128`.
 */
export const FFT_TWIDDLE_BYTES = FFT_TWIDDLE_COMPLEX_COUNT * 2 * 4

/**
 * Build the forward-twiddle table for the radix-2 Stockham FFT used by
 * the TDSE, Dirac, and Pauli compute passes.
 *
 * @returns Interleaved `[cos, -sin]` Float32Array of length
 *   `N_MAX_FFT_TWIDDLE` (= 2 * FFT_TWIDDLE_COMPLEX_COUNT). Exactly matches
 *   the `FFTArray` layout the CPU FFT reference (`src/lib/math/fft.ts`)
 *   stores in its twiddle cache: angle = `-2*pi/N * k`, stored as
 *   `(cos(angle), sin(angle))` — which equals `(cos(2*pi*k/N), -sin(2*pi*k/N))`.
 */
export function buildFFTTwiddleTable(): Float32Array<ArrayBuffer> {
  // Typed as Float32Array<ArrayBuffer> (not the default ArrayBufferLike) so
  // the WebGPU `writeBuffer` overload that requires `ArrayBufferView<ArrayBuffer>`
  // accepts the return value without a cast at the call site.
  const buffer = new ArrayBuffer(FFT_TWIDDLE_BYTES)
  const table = new Float32Array(buffer)
  const twoPiOverN = (2 * Math.PI) / N_MAX_FFT_TWIDDLE
  for (let k = 0; k < FFT_TWIDDLE_COMPLEX_COUNT; k++) {
    const theta = twoPiOverN * k
    table[2 * k] = Math.cos(theta)
    // Stored as -sin(theta) so the in-shader direction flip
    //   tw = vec2f(twFwd.x, dir * twFwd.y)
    // produces the correct forward/inverse twiddle without branching.
    table[2 * k + 1] = -Math.sin(theta)
  }
  return table
}
