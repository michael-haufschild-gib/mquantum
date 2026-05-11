/**
 * CPU-side IEEE-754 half-float packing helpers for rgba16float density grids.
 *
 * Kept separate from k-space occupation so startup physics paths that only need
 * texture packing do not import the full k-space analysis module.
 *
 * @module lib/physics/freeScalar/halfFloatPacking
 */

// Reusable buffer for float32-to-float16 conversion (avoids per-call allocation).
const f16Buf = new ArrayBuffer(4)
const f16F32 = new Float32Array(f16Buf)
const f16U32 = new Uint32Array(f16Buf)

/**
 * Convert a 32-bit float to IEEE 754 half-precision (16-bit) float.
 *
 * @param val - Float32-compatible numeric value to encode
 * @returns IEEE754 half-float bit pattern stored in a 16-bit unsigned integer
 */
export function float32ToFloat16(val: number): number {
  f16F32[0] = val
  const bits = f16U32[0]!

  const sign = (bits >>> 31) & 0x1
  const exp = (bits >>> 23) & 0xff
  const frac = bits & 0x7fffff

  if (exp === 0xff) {
    return (sign << 15) | 0x7c00 | (frac ? 0x200 : 0)
  }

  let newExp = exp - 127 + 15

  if (newExp >= 0x1f) {
    return (sign << 15) | 0x7c00
  }

  if (newExp <= 0) {
    if (newExp < -10) return sign << 15
    const shift = 14 - newExp
    const significand = frac | 0x800000
    let mantissa = significand >> shift
    const remainder = significand & ((1 << shift) - 1)
    const halfway = 1 << (shift - 1)
    if (remainder > halfway || (remainder === halfway && (mantissa & 1) === 1)) {
      mantissa++
    }
    return (sign << 15) | mantissa
  }

  let mantissa = frac >> 13
  const remainder = frac & 0x1fff
  if (remainder > 0x1000 || (remainder === 0x1000 && (mantissa & 1) === 1)) {
    mantissa++
    if (mantissa === 0x400) {
      mantissa = 0
      newExp++
      if (newExp >= 0x1f) {
        return (sign << 15) | 0x7c00
      }
    }
  }

  return (sign << 15) | (newExp << 10) | mantissa
}

/** Pack 4 floats as rgba16float into a Uint16Array at the given pixel offset. */
export function packRGBA16F(
  out: Uint16Array,
  pixelIdx: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const base = pixelIdx * 4
  out[base] = float32ToFloat16(r)
  out[base + 1] = float32ToFloat16(g)
  out[base + 2] = float32ToFloat16(b)
  out[base + 3] = float32ToFloat16(a)
}

/** Pack only R and G channels, leaving B and A as zero. */
export function packRG16F(out: Uint16Array, pixelIdx: number, r: number, g: number): void {
  const base = pixelIdx * 4
  out[base] = float32ToFloat16(r)
  out[base + 1] = float32ToFloat16(g)
}

/** Pack only R channel, leaving G, B, A as zero. */
export function packR16F(out: Uint16Array, pixelIdx: number, r: number): void {
  out[pixelIdx * 4] = float32ToFloat16(r)
}
