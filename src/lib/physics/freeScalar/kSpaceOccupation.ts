/**
 * k-Space Occupation Map computation for free scalar field.
 *
 * Performs forward FFT of phi/pi fields, computes occupation numbers n_k
 * per lattice momentum mode. Exports raw physics data + helpers used by
 * the display transform pipeline.
 *
 * The pipeline is split into two stages:
 * 1. Raw physics: FFT + n_k computation (this file)
 * 2. Display: coordinate mapping, exposure, broadening, packing (kSpaceDisplayTransforms.ts)
 */

import { fftNd } from '@/lib/math/fft'
import { computeOmegaK, M_FLOOR } from '@/lib/physics/freeScalar/vacuumSpectrum'

/** Size of the 3D output density grid (must match DENSITY_GRID_SIZE in compute pass). */
export const OUTPUT_GRID_SIZE = 64

/**
 * Convert a 32-bit float to IEEE 754 half-precision (16-bit) float,
 * returned as an unsigned 16-bit integer suitable for Uint16Array packing.
 */
// Reusable buffer for float32-to-float16 conversion (avoids per-call allocation)
const _f16Buf = new ArrayBuffer(4)
const _f16F32 = new Float32Array(_f16Buf)
const _f16U32 = new Uint32Array(_f16Buf)

export function float32ToFloat16(val: number): number {
  _f16F32[0] = val
  const bits = _f16U32[0]!

  const sign = (bits >>> 31) & 0x1
  const exp = (bits >>> 23) & 0xff
  const frac = bits & 0x7fffff

  if (exp === 0xff) {
    // Inf or NaN
    return (sign << 15) | 0x7c00 | (frac ? 0x200 : 0)
  }

  // Rebias exponent from 127 to 15
  let newExp = exp - 127 + 15

  if (newExp >= 0x1f) {
    // Overflow → ±Inf
    return (sign << 15) | 0x7c00
  }

  if (newExp <= 0) {
    // Denormalized or underflow
    if (newExp < -10) return sign << 15 // Too small → ±0
    const mantissa = (frac | 0x800000) >> (1 - newExp + 13)
    return (sign << 15) | (mantissa >> 10)
  }

  return (sign << 15) | (newExp << 10) | (frac >> 13)
}

/** Pack 4 floats as rgba16float into a Uint16Array at the given pixel offset. */
export function packRGBA16F(out: Uint16Array, pixelIdx: number, r: number, g: number, b: number, a: number): void {
  const base = pixelIdx * 4
  out[base] = float32ToFloat16(r)
  out[base + 1] = float32ToFloat16(g)
  out[base + 2] = float32ToFloat16(b)
  out[base + 3] = float32ToFloat16(a)
}

/**
 * Compute row-major strides for an N-D grid.
 */
export function computeStrides(gridSize: readonly number[]): number[] {
  const dim = gridSize.length
  const strides = new Array<number>(dim)
  strides[dim - 1] = 1
  for (let d = dim - 2; d >= 0; d--) {
    strides[d] = strides[d + 1]! * gridSize[d + 1]!
  }
  return strides
}

/**
 * Convert a linear index to N-D coordinates.
 */
export function linearToNDCoords(flatIdx: number, gridSize: readonly number[]): number[] {
  const dim = gridSize.length
  const coords = new Array<number>(dim)
  let remaining = flatIdx
  for (let d = dim - 1; d >= 0; d--) {
    coords[d] = remaining % gridSize[d]!
    remaining = Math.floor(remaining / gridSize[d]!)
  }
  return coords
}

/**
 * Convert N-D coordinates to a linear index using strides.
 */
export function ndToLinearIdx(coords: readonly number[], strides: readonly number[]): number {
  let idx = 0
  for (let d = 0; d < coords.length; d++) {
    idx += coords[d]! * strides[d]!
  }
  return idx
}

// ============================================================================
// Raw Physics Stage
// ============================================================================

/**
 * Raw k-space data produced by FFT + occupation number computation.
 * Contains per-mode physics quantities before any display transforms.
 */
export interface KSpaceRawData {
  /** Per-mode occupation number (raw values, may be negative) */
  nk: Float64Array
  /** Per-mode |k| magnitude */
  kMag: Float64Array
  /** Per-mode omega (angular frequency) */
  omega: Float64Array
  /** Maximum positive n_k value */
  nkMax: number
  /** Maximum |k| value */
  kMagMax: number
  /** Maximum omega value */
  omegaMax: number
  /** Total number of lattice sites */
  totalSites: number
  /** Per-dimension grid sizes (active dims only) */
  gridSize: readonly number[]
  /** Row-major strides for the grid */
  strides: number[]
  /** Number of active lattice dimensions */
  latticeDim: number
  /** Lattice spacings per dimension */
  spacing: readonly number[]
}

/**
 * Compute raw k-space occupation data from real-space phi and pi fields.
 * This is the physics stage — FFT + n_k computation with no display transforms.
 *
 * @param phi - Real-space field values (Float32Array, totalSites elements)
 * @param pi - Conjugate momenta (Float32Array, totalSites elements)
 * @param gridSize - Per-dimension grid sizes (must all be power-of-2)
 * @param spacing - Lattice spacings per dimension
 * @param mass - Field mass parameter
 * @param latticeDim - Number of active lattice dimensions
 * @returns Raw k-space data arrays and normalization maxima
 */
export function computeRawKSpaceData(
  phi: Float32Array,
  pi: Float32Array,
  gridSize: readonly number[],
  spacing: readonly number[],
  mass: number,
  latticeDim: number
): KSpaceRawData {
  const totalSites = gridSize.reduce((a, b) => a * b, 1)
  const activeDims = gridSize.slice(0, latticeDim)

  // Convert phi/pi from Float32 real to Float64 interleaved complex
  const phiComplex = new Float64Array(totalSites * 2)
  const piComplex = new Float64Array(totalSites * 2)
  for (let i = 0; i < totalSites; i++) {
    phiComplex[i * 2] = phi[i]!
    piComplex[i * 2] = pi[i]!
  }

  // Forward FFT
  fftNd(phiComplex, activeDims)
  fftNd(piComplex, activeDims)

  // Compute n_k per mode, tracking maxima for normalization
  const nk = new Float64Array(totalSites)
  const kMag = new Float64Array(totalSites)
  const omegaArr = new Float64Array(totalSites)

  let nkMax = 0
  let kMagMax = 0
  let omegaMax = 0

  const strides = computeStrides(activeDims)

  for (let i = 0; i < totalSites; i++) {
    const coords = linearToNDCoords(i, activeDims)
    const omega = computeOmegaK(coords, activeDims, spacing, mass, latticeDim)

    // |phi_k|^2 and |pi_k|^2
    const phiRe = phiComplex[i * 2]!
    const phiIm = phiComplex[i * 2 + 1]!
    const piRe = piComplex[i * 2]!
    const piIm = piComplex[i * 2 + 1]!
    const phiKSq = phiRe * phiRe + phiIm * phiIm
    const piKSq = piRe * piRe + piIm * piIm

    // n_k = (|pi_k|^2 + omega_k^2 * |phi_k|^2) / (2 * omega_k * N) - 0.5
    // The factor of N normalizes the FFT convention (our FFT is unnormalized forward)
    const omegaSafe = Math.max(omega, M_FLOOR)
    const nkVal = (piKSq + omegaSafe * omegaSafe * phiKSq) / (2 * omegaSafe * totalSites) - 0.5

    nk[i] = nkVal
    omegaArr[i] = omega

    // Compute |k| magnitude from lattice momentum
    let kSq = 0
    for (let d = 0; d < latticeDim; d++) {
      const N = activeDims[d]!
      const a = spacing[d]!
      if (N <= 1) continue
      const sinVal = Math.sin((Math.PI * coords[d]!) / N)
      const kLat = (2 * sinVal) / a
      kSq += kLat * kLat
    }
    kMag[i] = Math.sqrt(kSq)

    if (nkVal > nkMax) nkMax = nkVal
    if (kMag[i]! > kMagMax) kMagMax = kMag[i]!
    if (omega > omegaMax) omegaMax = omega
  }

  return {
    nk,
    kMag,
    omega: omegaArr,
    nkMax,
    kMagMax,
    omegaMax,
    totalSites,
    gridSize: activeDims,
    strides,
    latticeDim,
    spacing,
  }
}

// ============================================================================
// Legacy Passthrough (backward-compatible, no display transforms)
// ============================================================================

/**
 * Compute k-space occupation textures from real-space phi and pi fields.
 *
 * This is the backward-compatible entry point that produces identical output
 * to the pre-refactor code (no FFT shift, no exposure mapping, no broadening).
 *
 * For the full display pipeline with transforms, use computeRawKSpaceData()
 * followed by buildKSpaceDisplayTextures() from kSpaceDisplayTransforms.ts.
 *
 * @param phi - Real-space field values (Float32Array, totalSites elements)
 * @param pi - Conjugate momenta (Float32Array, totalSites elements)
 * @param gridSize - Per-dimension grid sizes (must all be power-of-2)
 * @param spacing - Lattice spacings per dimension
 * @param mass - Field mass parameter
 * @param latticeDim - Number of active lattice dimensions
 * @returns density and analysis textures as rgba16float Uint16Arrays for 64^3 grid
 */
export function computeKSpaceTextures(
  phi: Float32Array,
  pi: Float32Array,
  gridSize: readonly number[],
  spacing: readonly number[],
  mass: number,
  latticeDim: number
): { density: Uint16Array; analysis: Uint16Array } {
  const raw = computeRawKSpaceData(phi, pi, gridSize, spacing, mass, latticeDim)

  const G = OUTPUT_GRID_SIZE
  const outputTotal = G ** 3
  const density = new Uint16Array(outputTotal * 4)
  const analysis = new Uint16Array(outputTotal * 4)

  const nkNorm = Math.max(raw.nkMax, 1e-10)
  const kNorm = Math.max(raw.kMagMax, 1e-10)
  const oNorm = Math.max(raw.omegaMax, 1e-10)

  if (raw.latticeDim <= 3) {
    const activeDims = raw.gridSize
    const gridDims = [
      activeDims[0] ?? 1,
      activeDims[1] ?? 1,
      activeDims[2] ?? 1,
    ]

    for (let oz = 0; oz < G; oz++) {
      for (let oy = 0; oy < G; oy++) {
        for (let ox = 0; ox < G; ox++) {
          const outIdx = (oz * G + oy) * G + ox
          const kCoords: number[] = []

          let valid = true
          for (let d = 0; d < 3; d++) {
            const outCoord = [ox, oy, oz][d]!
            const N = gridDims[d]!
            if (N <= 1) {
              kCoords.push(0)
              const center = Math.floor(G / 2)
              if (Math.abs(outCoord - center) > 0) valid = false
              continue
            }
            const offset = Math.floor((G - N) / 2)
            const kIdx = outCoord - offset
            if (kIdx < 0 || kIdx >= N) {
              valid = false
              break
            }
            kCoords.push(kIdx)
          }

          if (!valid) {
            packRGBA16F(density, outIdx, 0, 0, 0, 0)
            packRGBA16F(analysis, outIdx, 0, 0, 0, 0)
            continue
          }

          const fullCoords = kCoords.slice(0, raw.latticeDim)
          const flatIdx = ndToLinearIdx(fullCoords, raw.strides)

          const n = Math.max(raw.nk[flatIdx]!, 0)
          const logN = Math.log(n + 1e-10)
          const kN = raw.kMag[flatIdx]! / kNorm
          const oN = raw.omega[flatIdx]! / oNorm

          packRGBA16F(density, outIdx, n / nkNorm, logN, 0, 0)
          packRGBA16F(analysis, outIdx, n / nkNorm, kN, oN, n * raw.omega[flatIdx]!)
        }
      }
    }
  } else {
    const activeDims = raw.gridSize
    const grid3D = new Float64Array(G ** 3)
    const kMag3D = new Float64Array(G ** 3)
    const omega3D = new Float64Array(G ** 3)
    const count3D = new Float64Array(G ** 3)

    for (let i = 0; i < raw.totalSites; i++) {
      const coords = linearToNDCoords(i, activeDims)

      let valid = true
      const outCoords = [0, 0, 0]
      for (let d = 0; d < 3; d++) {
        const N = activeDims[d]!
        const offset = Math.floor((G - N) / 2)
        const oCoord = coords[d]! + offset
        if (oCoord < 0 || oCoord >= G) {
          valid = false
          break
        }
        outCoords[d] = oCoord
      }
      if (!valid) continue

      const outIdx = (outCoords[2]! * G + outCoords[1]!) * G + outCoords[0]!
      const n = Math.max(raw.nk[i]!, 0)
      grid3D[outIdx]! += n
      kMag3D[outIdx]! += raw.kMag[i]!
      omega3D[outIdx]! += raw.omega[i]!
      count3D[outIdx]! += 1
    }

    let grid3DMax = 0
    for (let i = 0; i < grid3D.length; i++) {
      if (grid3D[i]! > grid3DMax) grid3DMax = grid3D[i]!
    }
    const g3Norm = Math.max(grid3DMax, 1e-10)

    for (let i = 0; i < outputTotal; i++) {
      const n = grid3D[i]!
      const logN = Math.log(n + 1e-10)
      const cnt = Math.max(count3D[i]!, 1)
      const avgK = kMag3D[i]! / cnt / kNorm
      const avgO = omega3D[i]! / cnt / oNorm

      packRGBA16F(density, i, n / g3Norm, logN, 0, 0)
      packRGBA16F(analysis, i, n / g3Norm, avgK, avgO, n * (omega3D[i]! / cnt))
    }
  }

  return { density, analysis }
}
