/**
 * Atlas-sweep sub-panel for the Bell experiment.
 *
 * Scans the (η, v) plane and draws the |S| heatmap. Sweep runs in an
 * async loop that yields to the UI thread between cells via setTimeout
 * (0) so the panel stays interactive at 256+ cells.
 *
 * Extracted from `BellExperimentSection.tsx` to keep that file under
 * the project's 500-line cap.
 *
 * @module components/sections/Analysis/BellSweepPanel
 */

import React, { useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { BellAtlasHeatmap } from '@/components/sections/Analysis/BellAtlasHeatmap'
import { Button } from '@/components/ui/Button'
import { Slider } from '@/components/ui/Slider'
import { type AtlasSweepPlan, stepEtaVisibilitySweep } from '@/lib/physics/bell/atlasSweep'
import { useBellExperimentStore } from '@/stores/diagnostics/bellExperimentStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

/**
 * Atlas-sweep sub-panel React component. Drives the (η, v) sweep and
 * renders the heatmap.
 *
 * @returns The sweep panel.
 */
export const BellSweepPanel: React.FC = React.memo(() => {
  const {
    sweepConfig,
    sweepStatus,
    sweepResults,
    sweepProgress,
    activeSweepGrid,
    setSweepConfig,
    setSweepStatus,
    pushSweepResult,
    setSweepProgress,
    clearSweepResults,
    setActiveSweepGrid,
  } = useBellExperimentStore(
    useShallow((s) => ({
      sweepConfig: s.sweepConfig,
      sweepStatus: s.sweepStatus,
      sweepResults: s.sweepResults,
      sweepProgress: s.sweepProgress,
      activeSweepGrid: s.activeSweepGrid,
      setSweepConfig: s.setSweepConfig,
      setSweepStatus: s.setSweepStatus,
      pushSweepResult: s.pushSweepResult,
      setSweepProgress: s.setSweepProgress,
      clearSweepResults: s.clearSweepResults,
      setActiveSweepGrid: s.setActiveSweepGrid,
    }))
  )
  const analysisMode = useExtendedObjectStore((s) => s.bellPair.analysisMode)
  const seed = useExtendedObjectStore((s) => s.bellPair.seed)

  const isRunning = sweepStatus === 'running'

  // Token guarding the currently-owning sweep generation. Each
  // handleStart creates a fresh token and revokes the prior one, so a
  // stale `run` from an aborted-then-restarted sweep can detect it no
  // longer owns the chain and exit without pushing rogue results.
  const runTokenRef = useRef<{ alive: boolean } | null>(null)

  const handleStart = useCallback(() => {
    if (runTokenRef.current) runTokenRef.current.alive = false
    const token = { alive: true }
    runTokenRef.current = token

    clearSweepResults()
    setActiveSweepGrid({
      etaSteps: sweepConfig.etaSteps,
      visibilitySteps: sweepConfig.visibilitySteps,
    })
    setSweepStatus('running')
    setSweepProgress(0, 0)
    const plan: AtlasSweepPlan = {
      etaMin: sweepConfig.etaMin,
      etaMax: sweepConfig.etaMax,
      etaSteps: sweepConfig.etaSteps,
      visibilityMin: sweepConfig.visibilityMin,
      visibilityMax: sweepConfig.visibilityMax,
      visibilitySteps: sweepConfig.visibilitySteps,
      trialsPerCell: sweepConfig.trialsPerCell,
      analysisMode,
      baseSeed: seed,
    }
    const total = plan.etaSteps * plan.visibilitySteps
    let cell = 0
    const run = () => {
      if (!token.alive) return
      const state = useBellExperimentStore.getState()
      if (state.sweepStatus !== 'running') return
      if (cell >= total) {
        setSweepStatus('complete')
        setSweepProgress(1, total)
        return
      }
      const row = Math.floor(cell / plan.visibilitySteps)
      const col = cell % plan.visibilitySteps
      const result = stepEtaVisibilitySweep(plan, row, col)
      pushSweepResult({
        rowIndex: result.rowIndex,
        colIndex: result.colIndex,
        eta: result.eta,
        visibility: result.visibility,
        absS: result.absS,
        violated: result.violated,
        coincidenceFraction: result.coincidenceFraction,
        postSelectedTrials: result.postSelectedTrials,
        nonDetections: result.nonDetections,
      })
      cell++
      setSweepProgress(cell / total, cell)
      setTimeout(run, 0)
    }
    setTimeout(run, 0)
  }, [
    sweepConfig,
    analysisMode,
    seed,
    clearSweepResults,
    setSweepStatus,
    setSweepProgress,
    pushSweepResult,
    setActiveSweepGrid,
  ])

  const handleAbort = useCallback(() => {
    if (runTokenRef.current) runTokenRef.current.alive = false
    setSweepStatus('idle')
  }, [setSweepStatus])

  // Heatmap dimensions come from the snapshot captured at sweep start —
  // editing the sweepConfig sliders afterwards must not relayout cells
  // that were computed under the old grid.
  const heatmapEtaSteps = activeSweepGrid?.etaSteps ?? sweepConfig.etaSteps
  const heatmapVisibilitySteps = activeSweepGrid?.visibilitySteps ?? sweepConfig.visibilitySteps

  return (
    <div className="space-y-1 border-t border-[var(--border-subtle)] pt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">(η, v) atlas sweep</p>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <>
              <span className="text-xs text-text-secondary">
                {(sweepProgress * 100).toFixed(0)}%
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAbort}
                data-testid="bell-atlas-abort"
              >
                Abort
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStart}
              data-testid="bell-atlas-start"
            >
              {sweepStatus === 'complete' ? 'Re-run sweep' : 'Run sweep'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
        <Slider
          label="η steps"
          min={2}
          max={32}
          step={1}
          value={sweepConfig.etaSteps}
          onChange={(v) => setSweepConfig({ etaSteps: Math.max(2, Math.round(v)) })}
          showValue
        />
        <Slider
          label="v steps"
          min={2}
          max={32}
          step={1}
          value={sweepConfig.visibilitySteps}
          onChange={(v) => setSweepConfig({ visibilitySteps: Math.max(2, Math.round(v)) })}
          showValue
        />
        <Slider
          label="Trials / cell"
          min={500}
          max={50_000}
          step={500}
          value={sweepConfig.trialsPerCell}
          onChange={(v) => setSweepConfig({ trialsPerCell: Math.max(100, Math.round(v)) })}
          showValue
        />
      </div>

      {sweepResults.length > 0 && (
        <BellAtlasHeatmap
          results={sweepResults}
          etaSteps={heatmapEtaSteps}
          visibilitySteps={heatmapVisibilitySteps}
        />
      )}
    </div>
  )
})

BellSweepPanel.displayName = 'BellSweepPanel'
