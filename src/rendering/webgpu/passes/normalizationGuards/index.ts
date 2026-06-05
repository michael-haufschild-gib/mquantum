/** Shared finite-norm guard for GPU diagnostic readbacks feeding renormalization. */
export const MAX_SAFE_RENORMALIZE_NORM = 1e30

/** Return true when a diagnostic norm is finite, positive, and safe for renormalization. */
export function isFinitePositiveNorm(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < MAX_SAFE_RENORMALIZE_NORM
}

/** Return a finite diagnostic scalar, or zero when GPU readback returned NaN/Inf. */
export function finiteReadbackOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/** Return a finite non-negative diagnostic scalar, or zero for negative/non-finite values. */
export function finiteNonNegativeReadbackOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** Return numerator / denominator when both are finite and denominator is positive. */
export function finiteReadbackRatioOrZero(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0
  const ratio = numerator / denominator
  return Number.isFinite(ratio) ? ratio : 0
}

/** Return a finite ratio clamped to [0, 1]. */
export function finiteUnitReadbackRatioOrZero(numerator: number, denominator: number): number {
  const ratio = finiteReadbackRatioOrZero(numerator, denominator)
  return Math.min(1, Math.max(0, ratio))
}

/** Smooth a positive max-density-like readback without letting NaN/Inf poison state. */
export function smoothPositiveReadbackPeak(
  currentValue: number,
  nextValue: number,
  decayAlpha = 0.4
): number {
  const current = finiteNonNegativeReadbackOrZero(currentValue)
  const next = finiteNonNegativeReadbackOrZero(nextValue)
  if (next <= 0) return current
  if (current <= 0 || next >= current) return next
  const alpha = Number.isFinite(decayAlpha) ? Math.min(1, Math.max(0, decayAlpha)) : 0.4
  const smoothed = current + alpha * (next - current)
  return finiteNonNegativeReadbackOrZero(smoothed)
}
