/**
 * SRMT Parameter Sweep section.
 *
 * Runs the SRMT diagnostic across a swept parameter (cut position,
 * inflaton mass, or boundary condition) and plots per-clock
 * affine-match quality vs the swept parameter. The headline physics
 * read is the landscape of `q_a(x)`, `q_phi1(x)`, `q_phi2(x)` curves
 * with the classical-turning-point landmark overlaid — the sweep makes
 * "where does the SRMT conjecture start to fail?" a concrete
 * observable rather than a single-point anecdote.
 *
 * The dispatch flow is store-driven:
 *   1. User configures the sweep in this panel.
 *   2. User clicks Start → `useSrmtSweepStore.setPendingSweep(...)`.
 *   3. `WheelerDeWittStrategy.executeFrame` calls
 *      `WheelerDeWittSrmtSweepCoordinator.maybeDispatchPending` on the
 *      next frame; coordinator posts the worker request, streams
 *      results back to the store.
 *
 * Unavailable outside Wheeler–DeWitt mode.
 *
 * @module components/sections/Analysis/SrmtSweepSection
 */

import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { Button } from '@/components/ui/Button'
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { getGitSha } from '@/lib/build/buildInfo'
import { downloadFile, exportFilename } from '@/lib/export/dataExport'
import { SRMT_DIAGNOSTIC_VERSION } from '@/lib/physics/srmt'
import { buildSrmtSweepManifest } from '@/lib/physics/srmt/sweepManifest'
import type { SrmtSweepKind } from '@/lib/physics/srmt/sweepTypes'
import { WDW_SOLVER_VERSION } from '@/lib/physics/wheelerDeWitt/solver'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useSrmtSweepStore } from '@/stores/srmtSweepStore'

import { sweepPointsToCsv } from './srmtSweepHelpers'
import { SrmtSweepPlot } from './SrmtSweepPlot'

const SECTION_TITLE = 'SRMT Sweep'

/** Per-kind upper bound on the Points slider, mirrors the driver clamps. */
function pointsMaxFor(kind: SrmtSweepKind): number {
  if (kind === 'cut') return 64
  if (kind === 'rankCap') return 32
  if (kind === 'phiExtent') return 13
  return 21
}

const KIND_OPTIONS: { value: SrmtSweepKind; label: string }[] = [
  { value: 'cut', label: 'cut' },
  { value: 'mass', label: 'mass' },
  { value: 'lambda', label: 'Λ' },
  { value: 'bc', label: 'bc' },
  { value: 'phiRef', label: 'φref' },
  { value: 'rankCap', label: 'rank' },
  { value: 'phiExtent', label: 'φext' },
]

interface SweepUiState {
  kind: SrmtSweepKind
  points: number
  sweepMin: number
  sweepMax: number
  phiRef: number
  cutAnchor: number
}

function defaultUiStateFor(
  kind: SrmtSweepKind,
  phiExtent: number,
  srmtCutNormalized: number
): SweepUiState {
  const commonPhiRef = phiExtent / 2
  if (kind === 'cut') {
    return {
      kind,
      points: 17,
      sweepMin: 0.1,
      sweepMax: 0.9,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'mass') {
    return {
      kind,
      points: 9,
      sweepMin: 0.1,
      sweepMax: 1.5,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'lambda') {
    // Default range straddles the AdS (Λ<0) / dS (Λ>0) boundary so the
    // sweep reveals the turning-surface regime change in one pass.
    return {
      kind,
      points: 9,
      sweepMin: -0.5,
      sweepMax: 0.5,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'phiRef') {
    // phiRef does not enter the q-compute — the plot will be flat by
    // construction and the physics read is per-point landmark motion.
    // Range spans (0, phiExtent).
    return {
      kind,
      points: 11,
      sweepMin: 0.05,
      sweepMax: Math.max(0.05, phiExtent - 0.05),
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'rankCap') {
    // Integer rankCap ∈ [8, 256] per driver. The 9-point cadence below
    // yields 8, 23, 38, …, 128 once the driver rounds + dedups.
    return {
      kind,
      points: 9,
      sweepMin: 8,
      sweepMax: 128,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'phiExtent') {
    return {
      kind,
      points: 5,
      sweepMin: 1.0,
      sweepMax: 3.0,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  return {
    kind,
    points: 3,
    sweepMin: 0,
    sweepMax: 2,
    phiRef: commonPhiRef,
    cutAnchor: srmtCutNormalized,
  }
}

/** Main entry point: gated by quantum mode. */
export function SrmtSweepSection(): React.ReactElement {
  const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)
  if (quantumMode !== 'wheelerDeWitt') {
    return (
      <UnavailableSection
        title={SECTION_TITLE}
        reason="Available in Wheeler–DeWitt mode"
        data-testid="srmt-sweep-section-unavailable"
      />
    )
  }
  return <SrmtSweepContent />
}

const SrmtSweepContent: React.FC = React.memo(() => {
  const { phiExtent, srmtCutNormalized } = useExtendedObjectStore(
    useShallow((s) => ({
      phiExtent: s.schroedinger.wheelerDeWitt.phiExtent,
      srmtCutNormalized: s.schroedinger.wheelerDeWitt.srmtCutNormalized,
    }))
  )
  const {
    status,
    config,
    wdwConfigSnapshot,
    points,
    landmarks,
    totalPoints,
    errorMessage,
    setPendingSweep,
    abortSweep,
    reset,
  } = useSrmtSweepStore(
    useShallow((s) => ({
      status: s.status,
      config: s.config,
      wdwConfigSnapshot: s.wdwConfigSnapshot,
      points: s.points,
      landmarks: s.landmarks,
      totalPoints: s.totalPoints,
      errorMessage: s.errorMessage,
      setPendingSweep: s.setPendingSweep,
      abortSweep: s.abortSweep,
      reset: s.reset,
    }))
  )
  const [ui, setUi] = React.useState<SweepUiState>(() =>
    defaultUiStateFor('cut', phiExtent, srmtCutNormalized)
  )

  const running = status === 'running'
  const complete = status === 'complete'
  const showError = status === 'error'
  const activeKind = config?.kind ?? ui.kind

  const handleKindChange = useCallback(
    (value: string): void => {
      const kind = value as SrmtSweepKind
      setUi(defaultUiStateFor(kind, phiExtent, srmtCutNormalized))
    },
    [phiExtent, srmtCutNormalized]
  )

  const handleStart = useCallback((): void => {
    if (running) return
    setPendingSweep({
      kind: ui.kind,
      points: ui.points,
      sweepMin: ui.sweepMin,
      sweepMax: ui.sweepMax,
      phiRef: ui.phiRef,
      cutAnchor: ui.cutAnchor,
    })
  }, [running, setPendingSweep, ui])

  const handleAbort = useCallback((): void => {
    abortSweep()
  }, [abortSweep])

  const handleReset = useCallback((): void => {
    reset()
  }, [reset])

  const handleExportCsv = useCallback((): void => {
    if (points.length === 0) return
    // Build the reproducibility manifest from the sweep-start snapshot.
    // UI only enables the export button in `complete` state, where both
    // snapshots are populated — but guard defensively so a future
    // refactor that flips the gating can't silently ship a manifest-less
    // CSV.
    const manifest =
      config && wdwConfigSnapshot
        ? buildSrmtSweepManifest({
            wdwConfig: wdwConfigSnapshot,
            srmtConfig: config,
            gitSha: getGitSha(),
            wdwSolverVersion: WDW_SOLVER_VERSION,
            srmtDiagnosticVersion: SRMT_DIAGNOSTIC_VERSION,
          })
        : []
    const csv = sweepPointsToCsv(points, activeKind, landmarks, manifest)
    downloadFile(csv, exportFilename('mdim-srmt-sweep', 'csv'), 'text/csv')
  }, [activeKind, config, landmarks, points, wdwConfigSnapshot])

  const progressLabel = useMemo((): string | null => {
    if (!running) return null
    return `${points.length} / ${totalPoints}`
  }, [points.length, running, totalPoints])

  return (
    <Section title={SECTION_TITLE} data-testid="srmt-sweep-section">
      <div className="space-y-3">
        <ToggleGroup
          options={KIND_OPTIONS}
          value={ui.kind}
          onChange={handleKindChange}
          ariaLabel="SRMT sweep kind"
          tooltip="Which parameter to vary across sweep points. Cut: sweep the cut position at fixed physics. Mass: sweep inflaton mass. BC: iterate the three boundary conditions."
          fullWidth
          disabled={running}
          data-testid="srmt-sweep-kind-selector"
        />

        <SweepKindControls ui={ui} running={running} setUi={setUi} phiExtent={phiExtent} />

        <div className="flex gap-2 items-center">
          {running ? (
            <Button onClick={handleAbort} data-testid="srmt-sweep-abort">
              Abort
            </Button>
          ) : (
            <Button onClick={handleStart} data-testid="srmt-sweep-start">
              Start
            </Button>
          )}
          {(complete || showError) && (
            <Button onClick={handleReset} data-testid="srmt-sweep-reset">
              Reset
            </Button>
          )}
          {complete && points.length > 0 && (
            <Button onClick={handleExportCsv} data-testid="srmt-sweep-export-csv">
              Export CSV
            </Button>
          )}
        </div>

        {progressLabel && (
          <div
            className="text-[11px] font-mono"
            style={{ color: 'var(--text-tertiary)' }}
            data-testid="srmt-sweep-progress"
          >
            Running sweep: {progressLabel}
          </div>
        )}

        {showError && errorMessage && (
          <div
            className="text-[11px] font-mono"
            style={{ color: 'var(--danger)' }}
            data-testid="srmt-sweep-error"
          >
            {errorMessage}
          </div>
        )}

        {points.length >= 2 && (
          <SrmtSweepPlot points={points} landmarks={landmarks} kind={activeKind} />
        )}
      </div>
    </Section>
  )
})
SrmtSweepContent.displayName = 'SrmtSweepContent'

interface SweepKindControlsProps {
  ui: SweepUiState
  running: boolean
  phiExtent: number
  setUi: React.Dispatch<React.SetStateAction<SweepUiState>>
}

const SweepKindControls: React.FC<SweepKindControlsProps> = ({ ui, running, phiExtent, setUi }) => {
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
