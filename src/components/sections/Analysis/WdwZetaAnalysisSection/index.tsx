/**
 * Analysis content for the WDW ⊗ ζ suite.
 *
 * One dispatcher mounted by `AnalysisSection` for every suite mode. It renders a
 * per-mode readout of the *constraint* each mode embodies: a few modes expose a
 * derived quantity (the κ₋ ghost count, the primon-gas partition function), and
 * every mode shows the active scenario's physics statement plus its current
 * parameters. The generic cross-section / second-quantization controls are
 * suppressed for the suite (not meaningful for these analytic volumes).
 *
 * @module components/sections/Analysis/WdwZetaAnalysisSection
 */

import React from 'react'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { getWdwZetaUi } from '@/lib/geometry/extended/wdwZeta/configRegistry'
import type { WdwZetaModeKey } from '@/lib/geometry/extended/wdwZeta/shared'
import { wdwZetaActiveDescription } from '@/lib/geometry/extended/wdwZeta/uiRegistry'
import { hagedornPartitionGain, RIEMANN_ZEROS, truncatedZeta } from '@/lib/physics/riemannZeta'
import { seamZeroCount } from '@/lib/physics/wdwZeta/lut'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import { MetricRow } from '../AnalysisPrimitives'

/** Constraint Seam — zeros pinned to the seam, and the κ₋ ghost count. */
const ConstraintSeamAnalysis: React.FC<{ cfg: Record<string, number | boolean> }> = ({ cfg }) => {
  const zeros = seamZeroCount(Number(cfg.heightWindow), RIEMANN_ZEROS)
  const kappa = cfg.ghostSector ? 2 : 0
  return (
    <>
      <MetricRow label="ζ zeros on seam in [2, T]" value={zeros} digits={0} />
      <MetricRow label="Negative-norm ghosts κ₋" value={kappa} digits={0} />
      <MetricRow label="Functional equation" value={Number.NaN} fallback="ξ(s) = ξ(1−s) — exact" />
      <p className="text-xs text-text-tertiary mt-1">
        {kappa === 0
          ? 'κ₋ = 0: every zero lies on the seam Re s = ½ — the completed state is physical.'
          : 'κ₋ > 0: the Davenport–Heilbronn pair lives off the seam — a forbidden ghost sector.'}
      </p>
    </>
  )
}

/** Ghost Sector — Weil positivity κ₋ readout. */
const WeilAnalysis: React.FC<{ cfg: Record<string, number | boolean> }> = ({ cfg }) => {
  const kappa = cfg.offLineZero ? 1 : 0
  return (
    <>
      <MetricRow label="ζ zeros in Q_W" value={Number(cfg.zeroCount)} digits={0} />
      <MetricRow label="Negative-norm ghosts κ₋" value={kappa} digits={0} />
      <MetricRow
        label="Weil positivity"
        value={Number.NaN}
        fallback={kappa === 0 ? 'Q_W ⪰ 0 (RH holds)' : 'Q_W has a negative eigenvalue'}
      />
      <p className="text-xs text-text-tertiary mt-1">
        {kappa === 0
          ? 'No ghost well: the explicit-formula quadratic form is positive — the no-boundary state has a positive norm.'
          : 'An off-line zero carves a negative-norm ghost well — the configuration RH forbids.'}
      </p>
    </>
  )
}

/** Third-Quantized Multiverse — primon-gas partition function & Hagedorn gain. */
const PrimonAnalysis: React.FC<{ cfg: Record<string, number | boolean> }> = ({ cfg }) => {
  const beta = Number(cfg.beta)
  return (
    <>
      <MetricRow label="Inverse temperature β" value={beta} digits={3} />
      <MetricRow label="Partition function ζ(β)−1" value={truncatedZeta(beta)} digits={3} />
      <MetricRow label="Hagedorn emission gain" value={hagedornPartitionGain(beta)} digits={3} />
      <p className="text-xs text-text-tertiary mt-1">
        Occupations n_p = 1/(p^β − 1) are forced by ζ at this temperature; as β → 1⁺ the gas ignites
        (the Hagedorn point).
      </p>
    </>
  )
}

/** Generic readout: the active scenario statement + current parameters. */
const GenericAnalysis: React.FC<{
  mode: WdwZetaModeKey
  cfg: Record<string, number | boolean>
}> = ({ mode, cfg }) => {
  const ui = getWdwZetaUi(mode)!
  const schroedinger = useExtendedObjectStore((s) => s.schroedinger)
  const desc = wdwZetaActiveDescription(schroedinger, mode)
  return (
    <>
      {ui.fields
        .filter((f) => f.kind !== 'switch')
        .map((f) => (
          <MetricRow
            key={f.key}
            label={f.label}
            value={Number(cfg[f.key])}
            digits={f.integer ? 0 : 2}
          />
        ))}
      {desc && <p className="text-xs text-text-tertiary mt-1">{desc}</p>}
    </>
  )
}

/**
 * Render the analysis panel for whichever WDW ⊗ ζ suite mode is active.
 *
 * @returns The active suite mode's analysis content.
 */
export const WdwZetaAnalysisContent: React.FC = () => {
  const mode = useExtendedObjectStore((s) => s.schroedinger.quantumMode) as WdwZetaModeKey
  const cfg = useExtendedObjectStore(
    (s) => (s.schroedinger as unknown as Record<string, unknown>)[mode]
  ) as Record<string, number | boolean> | undefined
  const ui = getWdwZetaUi(mode)
  if (!ui || !cfg) return null
  return (
    <ControlGroup title={ui.label} data-testid={`wz-analysis-${mode}`}>
      {mode === 'constraintSeam' ? (
        <ConstraintSeamAnalysis cfg={cfg} />
      ) : mode === 'weilPositivity' ? (
        <WeilAnalysis cfg={cfg} />
      ) : mode === 'primonMultiverse' ? (
        <PrimonAnalysis cfg={cfg} />
      ) : (
        <GenericAnalysis mode={mode} cfg={cfg} />
      )}
    </ControlGroup>
  )
}
