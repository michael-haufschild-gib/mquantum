/**
 * SRMT null-baseline robustness strip.
 *
 * Surfaces the multi-metric quality scores (`q_L2`, `q_L∞`, `q_rigid`)
 * and the three null-hypothesis baselines (`q_shuffled`, `q_reversed`,
 * `q_synthetic`) for the snapshot's selected clock. Renders a single
 * compact "wins by Nx vs best null" headline plus an expanded readout
 * row.
 *
 * Falsification gate: when `min(baselines) ≤ q_L2`, the real fit failed
 * to beat at least one null hypothesis — a publication-grade red flag.
 * The component highlights the row with the danger palette in that case.
 *
 * @module components/sections/Geometry/SchroedingerControls/SrmtNullBaselineStrip
 */

import React from 'react'

import { Tooltip } from '@/components/ui/Tooltip'
import { bestBaselineRatio } from '@/lib/physics/srmt'
import type { SrmtSnapshot } from '@/stores/diagnostics/srmtDiagnosticStore'

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1000 || abs < 0.001) return value.toExponential(2)
  return value.toFixed(3)
}

function formatRatio(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return '∞'
  if (!Number.isFinite(value)) return '—'
  if (value >= 1000) return value.toExponential(1)
  if (value >= 100) return value.toFixed(0)
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

/** Props for {@link SrmtNullBaselineStrip}. */
export interface SrmtNullBaselineStripProps {
  snapshot: SrmtSnapshot
}

/**
 * Robustness readout: L2 / L∞ / rigid metrics and the three null
 * baselines (affine + rigid) for the snapshot's selected clock. Pure
 * presentation — renders nothing when no falsification fields are
 * present (legacy snapshots).
 *
 * The strip displays two parallel rows of baseline ratios:
 *  - **affine** baselines scored against `affineMatchQuality` (L2).
 *    Caveat: reversed is direction-symmetric under L2; document'd.
 *  - **rigid** baselines scored against `qualityMetrics.rigid`
 *    (α=1 pinned). Reversed regains direction sensitivity.
 *
 * Falsification (`data-falsified="true"`) fires when EITHER ratio
 * drops below 1 — i.e. ANY baseline beats the corresponding real fit.
 */
export const SrmtNullBaselineStrip: React.FC<SrmtNullBaselineStripProps> = ({ snapshot }) => {
  const metrics = snapshot.qualityMetrics
  const baselines = snapshot.nullBaselines
  const baselinesRigid = snapshot.nullBaselinesRigid
  if (!metrics && !baselines && !baselinesRigid) return null

  const realQ = snapshot.affineMatchQuality
  const realRigid = metrics?.rigid ?? Number.NaN
  const ratio = baselines
    ? bestBaselineRatio(realQ, {
        shuffled: baselines.shuffled,
        reversed: baselines.reversed,
        synthetic: baselines.synthetic,
      })
    : Number.NaN
  const ratioRigid = baselinesRigid
    ? bestBaselineRatio(realRigid, {
        shuffled: baselinesRigid.shuffled,
        reversed: baselinesRigid.reversed,
        synthetic: baselinesRigid.synthetic,
      })
    : Number.NaN
  // Falsification: the real fit failed to beat at least one baseline.
  // ratio <= 1 means min(baseline) <= realQ — i.e. a null met or beat
  // the real fit, which is the SRMT-failure signal we explicitly want
  // to flag. A tie (ratio === 1) is treated as falsification: the real
  // fit does not strictly beat the best null.
  const falsified =
    (Number.isFinite(ratio) && ratio <= 1) || (Number.isFinite(ratioRigid) && ratioRigid <= 1)

  const palette = falsified
    ? {
        color: 'var(--color-danger)',
        border: 'var(--color-danger-border)',
        bg: 'var(--color-danger-bg)',
      }
    : {
        color: 'var(--text-secondary)',
        border: 'var(--border-subtle)',
        bg: 'transparent',
      }

  return (
    <div
      className="rounded-md border px-2 py-1 text-[10px] font-mono tabular-nums"
      style={{ color: palette.color, borderColor: palette.border, background: palette.bg }}
      data-testid="wdw-srmt-null-baseline-strip"
      data-falsified={falsified ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between gap-2">
        <Tooltip content="Ratio of best (smallest) null-baseline q over the real q. Larger = the real fit beats every null by a wider margin. Below 1 = a null beat the real fit, a falsification signal.">
          <span>
            {falsified ? 'BASELINE WIN  ' : 'wins by '}
            <span style={{ fontWeight: 600 }}>{formatRatio(ratio)}×</span>
            {falsified ? '  vs real' : ' vs best null'}
          </span>
        </Tooltip>
        <span style={{ opacity: 0.6 }}>clock {snapshot.clock}</span>
      </div>
      {metrics && (
        <div className="mt-1 grid grid-cols-3 gap-x-2">
          <Tooltip content="L2 affine residual — the headline q. Identical to affineMatchQuality.">
            <span data-testid="wdw-srmt-metric-l2">L2 {formatNumber(realQ)}</span>
          </Tooltip>
          <Tooltip content="L∞ worst-mode residual / max|K|. A clock that wins under L2 but fails here has averaged out a bad mode.">
            <span data-testid="wdw-srmt-metric-linf">L∞ {formatNumber(metrics.lInf)}</span>
          </Tooltip>
          <Tooltip content="Strict α=1 residual. Directly tests K ≈ E + const, the SRMT conjecture statement.">
            <span data-testid="wdw-srmt-metric-rigid">rigid {formatNumber(metrics.rigid)}</span>
          </Tooltip>
        </div>
      )}
      {baselines && (
        <div className="mt-1 grid grid-cols-3 gap-x-2" style={{ opacity: 0.8 }}>
          <Tooltip content="q with K randomly permuted (deterministic Fisher-Yates). Tests whether the affine fit succeeds from spectral-shape coincidence alone.">
            <span data-testid="wdw-srmt-baseline-shuffled">
              shuf {formatNumber(baselines.shuffled)}
            </span>
          </Tooltip>
          <Tooltip content="q with K reversed. Tests whether the SRMT match depends on monotone alignment of K with E.">
            <span data-testid="wdw-srmt-baseline-reversed">
              rev {formatNumber(baselines.reversed)}
            </span>
          </Tooltip>
          <Tooltip content="q with K replaced by Gaussian noise matching mean+stdev. Tests whether the fit succeeds from bulk statistics alone.">
            <span data-testid="wdw-srmt-baseline-synthetic">
              syn {formatNumber(baselines.synthetic)}
            </span>
          </Tooltip>
        </div>
      )}
      {baselinesRigid && (
        <div className="mt-1 flex items-center justify-between gap-2">
          <Tooltip content="Same shuffle/reverse/synthetic baselines but scored under the rigid α=1 fit. Reversed regains direction sensitivity here. The v2 empirical investigation found rigid is the primary SRMT metric.">
            <span style={{ fontWeight: 600 }}>
              rigid-ratio <span data-testid="wdw-srmt-rigid-ratio">{formatRatio(ratioRigid)}×</span>
            </span>
          </Tooltip>
          <span className="text-[10px] grid grid-cols-3 gap-x-2" style={{ opacity: 0.75 }}>
            <span data-testid="wdw-srmt-rigid-baseline-shuffled">
              rshuf {formatNumber(baselinesRigid.shuffled)}
            </span>
            <span data-testid="wdw-srmt-rigid-baseline-reversed">
              rrev {formatNumber(baselinesRigid.reversed)}
            </span>
            <span data-testid="wdw-srmt-rigid-baseline-synthetic">
              rsyn {formatNumber(baselinesRigid.synthetic)}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
