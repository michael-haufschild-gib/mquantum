/**
 * Build the logarithmic η sweep used for the cosmological trajectory
 * chart. Spans a full decade on either side of the current `η₀` with an
 * **odd** sample count so the midpoint index lands exactly on `η₀`. The
 * midpoint is pinned to `eta0` bit-identically (not re-derived via
 * `exp(log(|eta0|))`) so the trajectory line passes through the current
 * parameter at machine precision — otherwise the `η₀` marker could sit
 * between two neighbouring samples and disagree visually with the live
 * `S(L_A)` readout in the metric row above the chart.
 *
 * All generated samples share the SIGN of `eta0`. The FLRW / de Sitter
 * gauge uses η < 0, while the LQC bounce and Bianchi-Kasner presets use
 * η > 0 (see `resolvePresetSwitchSubstate` in
 * `freeScalarCosmologySetters.ts`). Forcing every sample negative
 * regardless of `eta0` sign caused the LQC/Bianchi trajectory to collapse
 * to a single point (the midpoint) — `computeCosmologyAt` rejects the
 * remaining 24 negative samples, and the chart's `etas.length < 2` guard
 * then hides the visualization entirely.
 *
 * @param eta0 - Current conformal time (must be finite and non-zero)
 * @returns A sign-consistent η sweep (all negative for FLRW/deSitter,
 *          all positive for LQC/Bianchi-Kasner), or an empty array if
 *          `eta0` is not a usable finite non-zero number.
 */
export function buildCosmoEtaSweep(eta0: number): number[] {
  if (!Number.isFinite(eta0) || eta0 === 0) return []
  // Odd count (25) so index 12 = (N-1)/2 is the midpoint.
  const nPoints = 25
  const mid = (nPoints - 1) / 2
  const logAbs0 = Math.log(Math.abs(eta0))
  const sign = eta0 < 0 ? -1 : 1
  const out: number[] = new Array(nPoints)
  for (let i = 0; i < nPoints; i++) {
    if (i === mid) {
      out[i] = eta0
      continue
    }
    const f = (i - mid) / mid
    const logAbs = logAbs0 + f * Math.log(10)
    out[i] = sign * Math.exp(logAbs)
  }
  return out
}
