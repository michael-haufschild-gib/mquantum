/**
 * PCG-32 pseudorandom number generator.
 *
 * Implements the PCG-XSH-RR-64-32 variant from O'Neill, M. (2014),
 * "PCG: A Family of Simple Fast Space-Efficient Statistically Good
 * Algorithms for Random Number Generation." Used here for Bell-experiment
 * Monte Carlo sampling, where statistical quality and seed determinism
 * matter more than raw speed.
 *
 * Why PCG-32 (not Math.random, not mulberry32):
 *  - Deterministic: the same seed always produces the same trial sequence,
 *    so physics-validation tests can compare actual to expected traces.
 *  - High-quality statistics across the full 2³² period; passes BigCrush.
 *  - mulberry32 has documented low-bit weakness in tail behaviour; for
 *    10⁸+ Bell trials that bias would contaminate CHSH estimates.
 *  - Math.random is implementation-defined and non-reseedable in browsers.
 *
 * Algorithm (one step):
 *   old   = state
 *   state = old · 6364136223846793005 + inc      (mod 2⁶⁴, inc must be odd)
 *   xs    = ((old >> 18) ⊕ old) >> 27            (then cast to u32)
 *   rot   = (old >> 59) as u32 (5-bit rotation amount)
 *   out   = rotr32(xs, rot)
 *
 * @module lib/physics/bell/pcg32
 */

const MUL = 6364136223846793005n
const MASK64 = (1n << 64n) - 1n
const MASK32 = 0xffffffffn
const U32_RANGE = 0x1_0000_0000 // 2³²
const FLOAT53_DENOM = 0x20_0000_0000_0000 // 2⁵³

/**
 * Deterministic PCG-32 PRNG. Construct with a seed (and optional independent
 * stream identifier) and consume with {@link nextU32}, {@link nextFloat}, or
 * {@link nextFloat53}.
 */
export class PCG32 {
  /** Current 64-bit internal state. Mutated on every draw. */
  private state: bigint
  /** Stream-selector constant (odd 64-bit value). Determines a sub-sequence. */
  private readonly inc: bigint

  /**
   * Create a new PCG-32 PRNG.
   *
   * @param seed - Initial 64-bit seed. May be passed as a JS number for
   *   convenience; values outside the 64-bit range are masked.
   * @param stream - Optional stream selector. Two PCG-32 instances with the
   *   same seed but different streams produce statistically independent
   *   sequences. Defaults to 0.
   */
  constructor(seed: bigint | number, stream: bigint | number = 0n) {
    const seedBig = (typeof seed === 'bigint' ? seed : BigInt(Math.trunc(seed))) & MASK64
    const streamBig = (typeof stream === 'bigint' ? stream : BigInt(Math.trunc(stream))) & MASK64
    // Reference initializer: state = 0; advance; state += seed; advance.
    this.inc = ((streamBig << 1n) | 1n) & MASK64
    this.state = 0n
    this.advance()
    this.state = (this.state + seedBig) & MASK64
    this.advance()
  }

  /** Advance the internal state by one step (no output). */
  private advance(): void {
    this.state = (this.state * MUL + this.inc) & MASK64
  }

  /**
   * Draw the next 32-bit unsigned integer.
   *
   * @returns Integer in [0, 2³²).
   */
  nextU32(): number {
    const old = this.state
    this.state = (old * MUL + this.inc) & MASK64
    const shifted = ((old >> 18n) ^ old) >> 27n
    const xs = Number(shifted & MASK32) >>> 0
    const rot = Number((old >> 59n) & 0x1fn)
    // rotr32: ((xs >>> rot) | (xs << (32 − rot))) & 0xffffffff
    // When rot = 0, (32 − rot) & 31 = 0, so `xs << 0` collapses to `xs` and the
    // OR is idempotent — the rotation reduces to identity.
    return ((xs >>> rot) | (xs << ((32 - rot) & 31))) >>> 0
  }

  /**
   * Draw a uniform float in [0, 1) with 32 bits of precision.
   *
   * Sufficient for the trial loop; use {@link nextFloat53} where statistical
   * tails matter (e.g. detection-loophole boundary cases).
   *
   * @returns Float in [0, 1).
   */
  nextFloat(): number {
    return this.nextU32() / U32_RANGE
  }

  /**
   * Draw a uniform float in [0, 1) with full 53-bit double precision.
   *
   * Consumes two {@link nextU32} draws. Use for tail-sensitive sampling.
   *
   * @returns Float in [0, 1).
   */
  nextFloat53(): number {
    const hi = this.nextU32() >>> 5 // 27 bits
    const lo = this.nextU32() >>> 6 // 26 bits
    return (hi * 0x400_0000 + lo) / FLOAT53_DENOM
  }

  /**
   * Draw a Bernoulli outcome with success probability `p`.
   *
   * @param p - Success probability in [0, 1]. Out-of-range values are clamped.
   * @returns `true` with probability `p`, else `false`.
   */
  nextBool(p: number): boolean {
    const clamped = p <= 0 ? 0 : p >= 1 ? 1 : p
    return this.nextFloat() < clamped
  }
}

/**
 * Convenience factory: build a PCG-32 from an unsigned 32-bit seed.
 *
 * @param seed - 32-bit seed. Higher bits are zero-padded.
 * @returns Fresh PCG-32 instance.
 */
export function createPcg32(seed: number): PCG32 {
  return new PCG32(BigInt(seed >>> 0))
}
