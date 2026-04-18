/**
 * SRMT affine-match quality chip.
 *
 * Takes a numeric quality score and renders a small colour-coded chip
 * with three tiers (`good`, `marginal`, `poor`) plus a neutral `pending`
 * tier for `NaN` inputs. Shared by the main chip (selected clock) and
 * the per-clock table rows.
 *
 * @module components/sections/Geometry/SchroedingerControls/SrmtQualityChip
 */

import React from 'react'

import { Tooltip } from '@/components/ui/Tooltip'

import { qualityTier, type SrmtQualityTier } from './srmtPanelHelpers'

/**
 * Per-tier visual tokens. Theme variables are used for colour so the
 * chip re-themes cleanly; borders / backgrounds use the semantic
 * `color-*-bg` / `color-*-border` palette entries.
 */
const TIER_STYLES: Record<SrmtQualityTier, { bg: string; color: string; border: string }> = {
  good: {
    bg: 'var(--color-success-bg)',
    color: 'var(--color-success)',
    border: 'var(--color-success-border)',
  },
  marginal: {
    bg: 'var(--color-warning-bg)',
    color: 'var(--color-warning)',
    border: 'var(--color-warning-border)',
  },
  poor: {
    bg: 'var(--color-danger-bg)',
    color: 'var(--color-danger)',
    border: 'var(--color-danger-border)',
  },
  pending: {
    bg: 'transparent',
    color: 'var(--text-tertiary)',
    border: 'var(--border-subtle)',
  },
}

/** Props for {@link SrmtQualityChip}. */
export interface SrmtQualityChipProps {
  value: number
  testId: string
  tooltipWhenPending?: string
}

/**
 * Quality chip rendering. For `pending` tiers an optional tooltip is
 * surfaced explaining why no value is available yet (typically because
 * the clock is still queued in the worker).
 */
export const SrmtQualityChip: React.FC<SrmtQualityChipProps> = ({
  value,
  testId,
  tooltipWhenPending,
}) => {
  const tier = qualityTier(value)
  const style = TIER_STYLES[tier]
  const text = tier === 'pending' ? 'pending' : value.toFixed(3)
  const chip = (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-mono tabular-nums"
      style={{
        backgroundColor: style.bg,
        color: style.color,
        borderColor: style.border,
      }}
      data-testid={testId}
      data-tier={tier}
    >
      {text}
    </span>
  )
  if (tier === 'pending' && tooltipWhenPending) {
    return <Tooltip content={tooltipWhenPending}>{chip}</Tooltip>
  }
  return chip
}
