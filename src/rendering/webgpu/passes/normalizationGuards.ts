/** Shared finite-norm guard for GPU diagnostic readbacks feeding renormalization. */
export const MAX_SAFE_RENORMALIZE_NORM = 1e30

/** Return true when a diagnostic norm is finite, positive, and safe for renormalization. */
export function isFinitePositiveNorm(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < MAX_SAFE_RENORMALIZE_NORM
}
