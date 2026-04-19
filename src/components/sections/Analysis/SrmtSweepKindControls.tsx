/**
 * Per-kind slider controls for the SRMT sweep section.
 *
 * Extracted from `SrmtSweepSection.tsx` so the parent stays under the
 * `max-lines` budget and the kind-specific slider blocks live next to
 * one another.
 *
 * @module components/sections/Analysis/SrmtSweepKindControls
 */

import React from 'react'

import { Slider } from '@/components/ui/Slider'
import type { SrmtSweepKind } from '@/lib/physics/srmt/sweepTypes'

import type { SrmtSweepUiState } from './srmtSweepHelpers'

/** Per-kind upper bound on the Points slider, mirrors the driver clamps. */
function pointsMaxFor(kind: SrmtSweepKind): number {
  if (kind === 'cut') return 64
  if (kind === 'rankCap') return 32
  if (kind === 'phiExtent') return 13
  return 21
}

/** Props for the per-kind slider block. */
export interface SweepKindControlsProps {
  ui: SrmtSweepUiState
  running: boolean
  phiExtent: number
  setUi: React.Dispatch<React.SetStateAction<SrmtSweepUiState>>
}

/**
 * Render the per-kind slider block for the active sweep kind. Shows the
 * point count slider, the kind-specific min/max bound pair, and
 * (where meaningful) the φref and cut-anchor sliders.
 */
export const SweepKindControls: React.FC<SweepKindControlsProps> = ({
  ui,
  running,
  phiExtent,
  setUi,
}) => {
  return (
    <>
      {ui.kind !== 'bc' && (
        <Slider
          label="Points"
          tooltip="Number of sweep points."
          min={ui.kind === 'cut' ? 4 : 3}
          max={pointsMaxFor(ui.kind)}
          step={1}
          value={ui.points}
          onChange={(v) => setUi((s) => ({ ...s, points: v }))}
          showValue
          disabled={running}
          data-testid="srmt-sweep-points-slider"
        />
      )}
      {ui.kind === 'cut' && (
        <>
          <Slider
            label="Cut min"
            min={0}
            max={0.9}
            step={0.01}
            value={ui.sweepMin}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMin: v, sweepMax: Math.max(v + 0.05, s.sweepMax) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-cutmin-slider"
          />
          <Slider
            label="Cut max"
            min={0.1}
            max={1}
            step={0.01}
            value={ui.sweepMax}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMax: v, sweepMin: Math.min(v - 0.05, s.sweepMin) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-cutmax-slider"
          />
        </>
      )}
      {ui.kind === 'mass' && (
        <>
          <Slider
            label="Mass min"
            min={0}
            max={2}
            step={0.01}
            value={ui.sweepMin}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMin: v, sweepMax: Math.max(v + 0.05, s.sweepMax) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-massmin-slider"
          />
          <Slider
            label="Mass max"
            min={0}
            max={2}
            step={0.01}
            value={ui.sweepMax}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMax: v, sweepMin: Math.min(v - 0.05, s.sweepMin) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-massmax-slider"
          />
        </>
      )}
      {ui.kind === 'lambda' && (
        <>
          <Slider
            label="Λ min"
            tooltip="Cosmological constant lower bound. Negative values are AdS; positive are dS."
            min={-1}
            max={1}
            step={0.01}
            value={ui.sweepMin}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMin: v, sweepMax: Math.max(v + 0.05, s.sweepMax) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-lambdamin-slider"
          />
          <Slider
            label="Λ max"
            min={-1}
            max={1}
            step={0.01}
            value={ui.sweepMax}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMax: v, sweepMin: Math.min(v - 0.05, s.sweepMin) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-lambdamax-slider"
          />
        </>
      )}
      {ui.kind === 'phiRef' && (
        <>
          <Slider
            label="φref min"
            tooltip="Lower bound for φref. q is invariant under φref by construction; the plot's read is that q stays flat while the landmark slides."
            min={0}
            max={phiExtent}
            step={0.01}
            value={ui.sweepMin}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMin: v, sweepMax: Math.max(v + 0.05, s.sweepMax) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-phirefmin-slider"
          />
          <Slider
            label="φref max"
            min={0}
            max={phiExtent}
            step={0.01}
            value={ui.sweepMax}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMax: v, sweepMin: Math.min(v - 0.05, s.sweepMin) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-phirefmax-slider"
          />
        </>
      )}
      {ui.kind === 'rankCap' && (
        <>
          <Slider
            label="rank min"
            tooltip="Lower rankCap. Integer-valued; driver rounds + dedups adjacent points."
            min={8}
            max={256}
            step={1}
            value={ui.sweepMin}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMin: v, sweepMax: Math.max(v + 1, s.sweepMax) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-rankmin-slider"
          />
          <Slider
            label="rank max"
            min={8}
            max={256}
            step={1}
            value={ui.sweepMax}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMax: v, sweepMin: Math.min(v - 1, s.sweepMin) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-rankmax-slider"
          />
        </>
      )}
      {ui.kind === 'phiExtent' && (
        <>
          <Slider
            label="φext min"
            tooltip="Lower φ-extent bound. CFL stability tightens as φext shrinks at fixed gridNphi; the solver dev-warns below the safe envelope."
            min={0.5}
            max={5}
            step={0.05}
            value={ui.sweepMin}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMin: v, sweepMax: Math.max(v + 0.1, s.sweepMax) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-phiextmin-slider"
          />
          <Slider
            label="φext max"
            min={0.5}
            max={5}
            step={0.05}
            value={ui.sweepMax}
            onChange={(v) =>
              setUi((s) => ({ ...s, sweepMax: v, sweepMin: Math.min(v - 0.1, s.sweepMin) }))
            }
            showValue
            disabled={running}
            data-testid="srmt-sweep-phiextmax-slider"
          />
        </>
      )}
      {ui.kind !== 'phiRef' && (
        <Slider
          label="phi ref"
          tooltip="φ used to locate the classical turning point landmark on the plot."
          min={0}
          max={phiExtent}
          step={0.01}
          value={ui.phiRef}
          onChange={(v) => setUi((s) => ({ ...s, phiRef: v }))}
          showValue
          disabled={running}
          data-testid="srmt-sweep-phiref-slider"
        />
      )}
      {ui.kind !== 'cut' && (
        <Slider
          label="Cut anchor"
          tooltip="Cut position held fixed while the varying parameter changes."
          min={0.1}
          max={0.9}
          step={0.01}
          value={ui.cutAnchor}
          onChange={(v) => setUi((s) => ({ ...s, cutAnchor: v }))}
          showValue
          disabled={running}
          data-testid="srmt-sweep-cutanchor-slider"
        />
      )}
    </>
  )
}
