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
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { getGitSha } from '@/lib/buildInfo'
import { downloadFile, exportFilename } from '@/lib/export/dataExport'
import { SRMT_DIAGNOSTIC_VERSION } from '@/lib/physics/srmt'
import { srmtSweepDefaultRange } from '@/lib/physics/srmt/sweepDefaults'
import { buildSrmtSweepManifest } from '@/lib/physics/srmt/sweepManifest'
import type { SrmtSweepKind } from '@/lib/physics/srmt/sweepTypes'
import { WDW_SOLVER_VERSION } from '@/lib/physics/wheelerDeWitt/solver'
import { useSrmtSweepStore } from '@/stores/diagnostics/srmtSweepStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import {
  clampUiStateToPhiExtent,
  type SrmtSweepUiState as SweepUiState,
  sweepPointsToCsv,
} from './srmtSweepHelpers'
import { SweepKindControls } from './SrmtSweepKindControls'
import { SrmtSweepPlot } from './SrmtSweepPlot'

const SECTION_TITLE = 'SRMT Sweep'

const KIND_OPTIONS: { value: SrmtSweepKind; label: string }[] = [
  { value: 'cut', label: 'cut' },
  { value: 'mass', label: 'mass' },
  { value: 'lambda', label: 'Λ' },
  { value: 'bc', label: 'bc' },
  { value: 'phiRef', label: 'φref' },
  { value: 'rankCap', label: 'rank' },
  { value: 'phiExtent', label: 'φext' },
  { value: 'gridNa', label: 'gridN_a' },
  { value: 'gridNphi', label: 'gridN_φ' },
  { value: 'gridNphiCoupled', label: 'gridN_φ*' },
]

function defaultUiStateFor(
  kind: SrmtSweepKind,
  phiExtent: number,
  srmtCutNormalized: number
): SweepUiState {
  const defaults = srmtSweepDefaultRange(kind, phiExtent)
  const commonPhiRef = phiExtent / 2
  if (kind === 'cut') {
    return {
      kind,
      ...defaults,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'mass') {
    return {
      kind,
      ...defaults,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'lambda') {
    // Default range straddles the AdS (Λ<0) / dS (Λ>0) boundary so the
    // sweep reveals the turning-surface regime change in one pass.
    return {
      kind,
      ...defaults,
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
      ...defaults,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'rankCap') {
    // Integer rankCap ∈ [8, 256] per driver. The 9-point cadence below
    // yields 8, 23, 38, …, 128 once the driver rounds + dedups.
    return {
      kind,
      ...defaults,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'phiExtent') {
    return {
      kind,
      ...defaults,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'gridNa') {
    // Cauchy / grid-convergence sweep on the a-axis. Driver clamps
    // `points` to [3, 9]; Nₐ to [64, 1024]. Defaults span a >2× range
    // so the leapfrog's 2nd-order convergence is observable in one
    // sweep without blowing the per-point solve budget at the upper
    // end.
    return {
      kind,
      ...defaults,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'gridNphi') {
    // Cauchy / grid-convergence sweep on the φ-axes. Driver clamps
    // `points` to [3, 9]; Nφ to [32, 64]. Upper bound is conservative:
    // the explicit-leapfrog CFL term grows as `N_φ²` at fixed `gridNa`,
    // so callers hunting a true Cauchy tail should switch to
    // `gridNphiCoupled` once the solver warns.
    return {
      kind,
      ...defaults,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  if (kind === 'gridNphiCoupled') {
    // Joint (Nφ, Nₐ) grid-convergence sweep. Driver clamps `points` to
    // [3, 7]; Nφ to [32, 64]. Per-point `gridNa` is co-scaled via the
    // coupling formula so the CFL term stays bounded.
    return {
      kind,
      ...defaults,
      phiRef: commonPhiRef,
      cutAnchor: srmtCutNormalized,
    }
  }
  return {
    kind,
    ...defaults,
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

  // Clamp UI state back into the active domain when phiExtent shrinks
  // beneath a pinned phiRef bound; otherwise `Start` would dispatch a
  // sweep whose bounds no longer match the active physics config.
  React.useEffect(() => {
    setUi((s) => clampUiStateToPhiExtent(s, phiExtent))
  }, [phiExtent])

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
          tooltip="Which parameter to vary across sweep points. Cut: cut position. Mass: inflaton mass. Lambda: cosmological constant. BC: boundary conditions. PhiRef/RankCap/PhiExtent: sensitivity. GridNa/GridNphi: convergence. GridNphiCoupled: joint (Nφ, Nₐ) convergence with CFL coupling."
          fullWidth
          disabled={running}
          data-testid="srmt-sweep-kind-selector"
        />

        <SweepKindControls ui={ui} running={running} setUi={setUi} phiExtent={phiExtent} />

        <div className="flex gap-2 items-center">
          {running ? (
            <Button
              onClick={abortSweep}
              tooltip="Abort the in-progress SRMT sweep"
              data-testid="srmt-sweep-abort"
            >
              Abort
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              tooltip="Start a fresh SRMT parameter sweep"
              data-testid="srmt-sweep-start"
            >
              Start
            </Button>
          )}
          {(complete || showError) && (
            <Button
              onClick={reset}
              tooltip="Clear results and reset the SRMT sweep state"
              data-testid="srmt-sweep-reset"
            >
              Reset
            </Button>
          )}
          {complete && points.length > 0 && (
            <Button
              onClick={handleExportCsv}
              tooltip="Download the SRMT sweep results as CSV"
              data-testid="srmt-sweep-export-csv"
            >
              Export CSV
            </Button>
          )}
        </div>

        {progressLabel && (
          <div
            className="text-2xs font-mono"
            style={{ color: 'var(--text-tertiary)' }}
            data-testid="srmt-sweep-progress"
          >
            Running sweep: {progressLabel}
          </div>
        )}

        {showError && errorMessage && (
          <div
            className="text-2xs font-mono"
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
