/**
 * Null-hypothesis baselines for the SRMT (Superspace-Relational Modular Time)
 * affine-match diagnostic.
 *
 * The SRMT conjecture predicts the DeWitt-timelike clock `a` produces a
 * modular Hamiltonian spectrum `K_n` that tracks the Hamilton-Jacobi
 * operator spectrum `E_n` affinely — i.e. `K_n ≈ α·E_n + β`. The quality
 * metric `q = Σ(K - αE - β)² / Σ K²` is what
 * {@link computeAffineFitQuality} reports.
 *
 * BUT: a low `q` alone is not evidence the SRMT conjecture is correct.
 * Two failure modes can produce low `q` without any physics content:
 *
 *  1. **Monotonicity coincidence.** Both `K` and `E` are sorted ascending
 *     by construction. ANY two monotone sequences with similar shape will
 *     yield a low affine residual — that's just curve-fitting, not
 *     physics.
 *  2. **Spectral density match.** If `K` and `E` happen to span similar
 *     ranges with similar density, a generic affine fit will succeed
 *     even if the underlying state ↔ operator correspondence is random.
 *
 * The null baselines defined here address both failure modes. Each
 * baseline takes the SAME `(K, E)` pair the real fit uses and applies a
 * structure-destroying perturbation to `K` before refitting. A genuine
 * SRMT match should be ORDERS OF MAGNITUDE better than every baseline.
 *
 * Three baselines are reported, in increasing severity:
 *
 *  - **Shuffled**: `K` is permuted by a deterministic seeded Fisher-Yates
 *    shuffle. Destroys the index-alignment between `K` and `E` while
 *    preserving the marginal distribution of `K`. A low `q_shuffled`
 *    means the affine fit is succeeding from spectral-shape coincidence
 *    alone.
 *  - **Reversed**: `K` is reversed. Tests whether the SRMT match depends
 *    on the monotone alignment of `K` with `E`. Caveat: under an
 *    *unconstrained* affine fit, reversing a strictly-monotone `K`
 *    against a strictly-monotone `E` simply flips `α` (`α' = −α`,
 *    `β' = mean(K) + α·mean(E)`) and yields the same residual — the
 *    L2 affine quality is *direction-symmetric*. The reversed baseline
 *    is therefore most informative on real (noisy, curvature-bearing)
 *    `K` where reflection breaks the curvature alignment — the case
 *    SRMT actually runs against — and uninformative on synthetically
 *    perfect-line inputs. Reviewers should pair the reversed baseline
 *    with `q_rigid` (where `α = 1` is pinned, so the flip is genuinely
 *    detectable) for the strongest "wins by direction, not by accident"
 *    evidence.
 *  - **Synthetic**: `K` is replaced by Gaussian noise with the same
 *    mean and standard deviation. Destroys both monotonicity and the
 *    fine-grained shape; only the first-moment match remains. A low
 *    `q_synthetic` means the fit is succeeding from the bulk statistics
 *    alone.
 *
 * All baselines are computed with a deterministic, caller-supplied seed
 * so the publication sweep can fix the seed once and report reproducible
 * baseline ratios. The default `DEFAULT_NULL_BASELINE_SEED = 0x5e7c0` is
 * an arbitrary 20-bit constant; nothing physical depends on its value,
 * only that it is fixed across runs.
 *
 * @module lib/physics/srmt/nullBaselines
 */

import { computeAffineFitQuality, computeRigidFitQuality } from './affineFit'

/**
 * Default deterministic seed for all baseline shuffles. Arbitrary 20-bit
 * constant — meaning lies only in "fixed across runs", not in the value.
 */
export const DEFAULT_NULL_BASELINE_SEED = 0x5e7c0

/**
 * Per-baseline q-values produced by {@link computeNullBaselines}.
 *
 * Each field is the SAME affine-fit quality scalar as the real
 * diagnostic's `q`, computed against the same `E` spectrum but a
 * perturbed `K`. Smaller = better fit. NaN propagates when the
 * underlying fit is degenerate or `count < 3`.
 */
export interface NullBaselineQuality {
  /** `q` with `K` permuted by deterministic Fisher-Yates. */
  shuffled: number
  /** `q` with `K` reversed (worst-case monotone-misalignment). */
  reversed: number
  /** `q` with `K` replaced by Gaussian noise matching `K`'s first two moments. */
  synthetic: number
}

function invalidBaselines(): NullBaselineQuality {
  return { shuffled: Number.NaN, reversed: Number.NaN, synthetic: Number.NaN }
}

/**
 * Xorshift32 — fast, well-distributed, 4-byte state. Sufficient for
 * shuffle / synthetic-noise generation. We pick xorshift32 over the
 * cryptographic-grade alternatives so the baseline is bit-for-bit
 * reproducible across browsers and Node test runners, with no
 * dependence on `Math.random`'s implementation-defined seeding.
 *
 * The seed is forced into `[1, 2³² − 1]` because xorshift32 fixes at
 * zero. A user-supplied `0` is silently rewritten to `1`.
 */
function makeXorshift32(seed: number): () => number {
  let state = (seed | 0) === 0 ? 1 : seed | 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    // >>> 0 to coerce to unsigned 32-bit before scaling to [0, 1).
    return (state >>> 0) / 0x1_0000_0000
  }
}

/**
 * Box-Muller transform — convert two uniform `(0, 1)` samples into a
 * standard normal pair. We return only the first sample; the second is
 * discarded (the alternative is to cache it, but the savings are
 * negligible for the baseline use case and the simpler version is easier
 * to audit).
 *
 * Note: clamps the first uniform sample to `(ε, 1)` so `Math.log(u)`
 * cannot overflow. ε is the smallest positive `Math.fround` value — far
 * below any plausible baseline application's sensitivity.
 */
function standardNormal(rng: () => number): number {
  let u1 = rng()
  if (u1 <= 0) u1 = Number.EPSILON
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/**
 * Fisher-Yates shuffle on a copy of `K` over the first `count` entries.
 * The remainder of the returned array (if any) holds the untouched
 * trailing values — but {@link computeNullBaselines} always uses the
 * exact `count` length, so trailing garbage cannot leak into the fit.
 */
function shuffledCopy(K: Float64Array, count: number, rng: () => number): Float64Array {
  const out = new Float64Array(count)
  for (let i = 0; i < count; i++) out[i] = K[i]!
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

/**
 * Reverse copy of `K` over the first `count` entries.
 */
function reversedCopy(K: Float64Array, count: number): Float64Array {
  const out = new Float64Array(count)
  for (let i = 0; i < count; i++) out[i] = K[count - 1 - i]!
  return out
}

/**
 * Gaussian-noise replacement for `K` matching the first two moments
 * (mean + standard deviation) of the original. Produces a synthetic
 * spectrum whose marginal histogram approximates `K`'s but whose
 * order-by-order correspondence with `E` is random.
 *
 * Edge case: when the original `K` has zero variance, the synthetic
 * spectrum is the constant mean. The downstream affine fit will then
 * return `NaN` (zero-variance `K` with non-zero residual), which is the
 * correct outcome — the synthetic baseline is unmeaningful in that
 * regime.
 */
function syntheticCopy(K: Float64Array, count: number, rng: () => number): Float64Array {
  let sum = 0
  for (let i = 0; i < count; i++) sum += K[i]!
  const mean = sum / count

  let sqDiff = 0
  for (let i = 0; i < count; i++) {
    const d = K[i]! - mean
    sqDiff += d * d
  }
  const stdev = Math.sqrt(sqDiff / count)

  const out = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    out[i] = mean + stdev * standardNormal(rng)
  }
  // The affine fit accepts unsorted `K` — it minimises `Σ(K − αE − β)²`
  // pointwise — so we do NOT sort the synthetic spectrum. Sorting would
  // partially restore the monotone correlation the baseline is meant to
  // destroy.
  return out
}

/**
 * Compute all three null-hypothesis baseline q-values for a given
 * `(K, E)` pair.
 *
 * Treats `count` exactly the same way {@link computeAffineFitQuality}
 * does: degenerate inputs (`count < 3`, buffer underrun, non-finite
 * values) return `{ NaN, NaN, NaN }`. Each baseline uses an independent
 * deterministic stream derived from `seed` via xorshift32 mixing, so
 * changing the order of baselines or skipping one does NOT alter the
 * remaining values.
 *
 * @param K - Real modular spectrum `K_n` (ascending), as produced by
 *            {@link modularSpectrum}.
 * @param E - Real HJ spectrum `E_n` (ascending), as produced by
 *            {@link hjSpectrumOnSliceTopK}.
 * @param count - Number of leading values to include in each baseline
 *            fit — must equal the `count` passed to the real
 *            {@link computeAffineFitQuality} call so the comparison is
 *            apples-to-apples.
 * @param seed - Deterministic seed. Defaults to
 *            {@link DEFAULT_NULL_BASELINE_SEED}.
 * @returns `{ shuffled, reversed, synthetic }` q-values.
 */
export function computeNullBaselines(
  K: Float64Array,
  E: Float64Array,
  count: number,
  seed: number = DEFAULT_NULL_BASELINE_SEED
): NullBaselineQuality {
  if (!Number.isSafeInteger(count) || count < 3) return invalidBaselines()
  if (count > K.length || count > E.length) return invalidBaselines()

  // Independent streams for shuffle and synthetic. The reversed baseline
  // is deterministic given (K, count) and ignores the RNG entirely.
  const shuffleRng = makeXorshift32(seed)
  // Mix the seed deterministically before spawning the synthetic stream
  // so an unlucky seed cannot make the two streams correlated. The
  // constant `0x9e3779b9` is the 32-bit truncation of the golden-ratio
  // hash multiplier; widely used in PRNG mixing for this exact purpose.
  const syntheticRng = makeXorshift32(seed ^ 0x9e37_79b9)

  const shuffledK = shuffledCopy(K, count, shuffleRng)
  const reversedK = reversedCopy(K, count)
  const syntheticK = syntheticCopy(K, count, syntheticRng)

  return {
    shuffled: computeAffineFitQuality(shuffledK, E, count),
    reversed: computeAffineFitQuality(reversedK, E, count),
    synthetic: computeAffineFitQuality(syntheticK, E, count),
  }
}

/**
 * Compute the three null baselines but score them under the
 * STRICT (α = 1) rigid fit instead of the unconstrained affine fit.
 *
 * Why this exists: the L2 affine fit absorbs sign flips into `α`, so
 * the reversed baseline is direction-symmetric on strictly-monotone
 * inputs (documented at length in this module's header and in the
 * v1 empirical-result doc). Under the rigid fit `α` is pinned to 1
 * and the reversal becomes detectable — the reversed baseline
 * regains its physical content as a direction-sensitive null.
 *
 * The shuffled and synthetic baselines also become more discriminating
 * because `α` can no longer rescale the shuffled spectrum to match
 * `E`'s magnitude. The rigid baselines are therefore the right
 * companion when the SRMT diagnostic's primary metric is `q_rigid`
 * (as the v1 empirical finding recommends).
 *
 * Same `seed`, same Fisher-Yates / Gaussian streams as
 * {@link computeNullBaselines} — the only difference is the cost
 * function applied to the perturbed `K`.
 *
 * @param K - Modular spectrum (ascending).
 * @param E - HJ spectrum (ascending).
 * @param count - Number of leading values to include.
 * @param seed - Deterministic seed. Defaults to
 *            {@link DEFAULT_NULL_BASELINE_SEED}.
 * @returns `{ shuffled, reversed, synthetic }` q-values scored under
 *          {@link computeRigidFitQuality}.
 */
export function computeNullBaselinesRigid(
  K: Float64Array,
  E: Float64Array,
  count: number,
  seed: number = DEFAULT_NULL_BASELINE_SEED
): NullBaselineQuality {
  if (!Number.isSafeInteger(count) || count < 3) return invalidBaselines()
  if (count > K.length || count > E.length) return invalidBaselines()

  const shuffleRng = makeXorshift32(seed)
  const syntheticRng = makeXorshift32(seed ^ 0x9e37_79b9)

  const shuffledK = shuffledCopy(K, count, shuffleRng)
  const reversedK = reversedCopy(K, count)
  const syntheticK = syntheticCopy(K, count, syntheticRng)

  return {
    shuffled: computeRigidFitQuality(shuffledK, E, count),
    reversed: computeRigidFitQuality(reversedK, E, count),
    synthetic: computeRigidFitQuality(syntheticK, E, count),
  }
}

/**
 * Margin of the real fit over the worst (= smallest) baseline, expressed
 * as a ratio `min(shuffled, reversed, synthetic) / realQ`. Larger means
 * the real fit beats the best null by a wider margin; values below 1
 * mean a baseline matched or beat the real fit — a falsification
 * signal.
 *
 * Returns `NaN` when either input is non-finite or non-positive (`realQ
 * ≤ 0` means perfect fit, which trivially beats any null; we report
 * `Infinity` in that specific case so the UI can render a ∞ chip
 * rather than swallowing the win as a NaN).
 *
 * @param real - The real diagnostic q-value (`affineMatchQuality`).
 * @param baselines - Output of {@link computeNullBaselines}.
 * @returns `min(baseline) / real`, or `Infinity` for `real = 0`, or `NaN`.
 */
export function bestBaselineRatio(real: number, baselines: NullBaselineQuality): number {
  if (!Number.isFinite(real)) return Number.NaN
  if (real === 0) return Number.POSITIVE_INFINITY
  if (real < 0) return Number.NaN

  let minBaseline = Number.POSITIVE_INFINITY
  let anyFinite = false
  for (const v of [baselines.shuffled, baselines.reversed, baselines.synthetic]) {
    if (Number.isFinite(v) && v >= 0) {
      anyFinite = true
      if (v < minBaseline) minBaseline = v
    }
  }
  if (!anyFinite) return Number.NaN
  const ratio = minBaseline / real
  return Number.isFinite(ratio) ? ratio : Number.NaN
}
