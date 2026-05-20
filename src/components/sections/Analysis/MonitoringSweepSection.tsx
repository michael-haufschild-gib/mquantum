/**
 * Monitoring Sweep Section
 *
 * UI for the continuous monitoring transition exploration (Feature B).
 * Shows current IPR, sweep controls with configurable parameters,
 * and IPR(γ) sparkline. Drives the sweep state machine via a polling
 * interval on diagnostics.
 *
 * Forces TDSE diagnostics to remain enabled while a sweep is running,
 * preventing a silent stall if the analysis panel is collapsed.
 *
 * @module components/sections/Analysis/MonitoringSweepSection
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { NumberInput } from '@/components/ui/NumberInput'
import { Sparkline } from '@/components/ui/Sparkline'
import { useAnySweepRunning } from '@/hooks/useAnySweepRunning'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import {
  gammaForStep,
  type MonitoringSweepConfig,
  useMonitoringSweepStore,
} from '@/stores/diagnostics/monitoringSweepStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

/** Monitoring sweep controls and IPR display. */
export const MonitoringSweepSection: React.FC = React.memo(() => {
  const tdse = useExtendedObjectStore((s) => s.schroedinger?.tdse)
  const { ipr, totalNorm, normDrift, historyIpr, head, count } = useDiagnosticsStore(
    useShallow((s) => ({
      ipr: s.tdse.ipr,
      totalNorm: s.tdse.totalNorm,
      normDrift: s.tdse.normDrift,
      historyIpr: s.tdse.historyIpr,
      head: s.tdse.historyHead,
      count: s.tdse.historyCount,
    }))
  )

  const { status, results, currentStep, config, startSweep, abort, reset } =
    useMonitoringSweepStore(
      useShallow((s) => ({
        status: s.status,
        results: s.results,
        currentStep: s.currentStep,
        config: s.config,
        startSweep: s.startSweep,
        abort: s.abort,
        reset: s.reset,
      }))
    )

  // User-configurable sweep parameters
  const [gammaMin, setGammaMin] = useState(0.01)
  const [gammaMax, setGammaMax] = useState(5.0)
  const [steps, setSteps] = useState(20)
  const [timePerStep, setTimePerStep] = useState(1.0)

  const sweepTickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Snapshot of the user's pre-sweep TDSE state. The sweep forces diagnostics
  // on + cycles stochasticGamma; without restoration the user's original γ is
  // permanently replaced by the sweep's last step. Same pattern as the Atlas
  // and CoordinateEntanglement sweep controllers.
  const preSweepRef = useRef<{ diagnosticsEnabled: boolean; stochasticGamma: number } | null>(null)

  const restorePreSweepState = useCallback(() => {
    const snap = preSweepRef.current
    if (!snap) return
    preSweepRef.current = null
    const store = useExtendedObjectStore.getState()
    store.setTdseDiagnosticsEnabled(snap.diagnosticsEnabled)
    store.setTdseStochasticGamma(snap.stochasticGamma)
  }, [])

  // Force diagnostics to stay enabled while sweep is running
  useEffect(() => {
    if (status === 'running') {
      useExtendedObjectStore.getState().setTdseDiagnosticsEnabled(true)
    }
  }, [status])

  const handleStartSweep = useCallback(() => {
    // Validate inputs are finite before mutating state
    if (![gammaMin, gammaMax, steps, timePerStep].every(Number.isFinite)) return
    if (steps < 1) return

    const gMin = Math.min(gammaMin, gammaMax)
    const gMax = Math.max(gammaMin, gammaMax)
    const cfg: MonitoringSweepConfig = {
      gammaMin: gMin,
      gammaMax: gMax,
      steps,
      timePerStep,
    }
    // Capture the user's pre-sweep TDSE state so Abort/Clear can put it back.
    const store = useExtendedObjectStore.getState()
    preSweepRef.current = {
      diagnosticsEnabled: store.schroedinger.tdse.diagnosticsEnabled,
      stochasticGamma: store.schroedinger.tdse.stochasticGamma,
    }
    // Force diagnostics on before starting
    store.setTdseDiagnosticsEnabled(true)
    // Set initial γ and trigger reset so step 0 starts deterministically
    const initialGamma = gammaForStep(cfg, 0)
    store.setTdseStochasticGamma(initialGamma)
    store.resetTdseField()
    startSweep(cfg)
  }, [gammaMin, gammaMax, steps, timePerStep, startSweep])

  const handleAbort = useCallback(() => {
    abort()
    restorePreSweepState()
  }, [abort, restorePreSweepState])

  const handleClear = useCallback(() => {
    reset()
    restorePreSweepState()
  }, [reset, restorePreSweepState])

  // Drive the sweep state machine by polling diagnostics
  useEffect(() => {
    if (status !== 'running') {
      if (sweepTickRef.current) {
        clearInterval(sweepTickRef.current)
        sweepTickRef.current = null
      }
      return
    }

    // Skip ticks that see the same diagnostic snapshot we already sampled.
    // The UI polls at 200 ms but `pushTdseSnapshot` only fires when the GPU
    // readback completes — at low FPS or high `diagnosticsInterval` the
    // store can go several polls without advancing. Without this dedup,
    // identical `(simTime, ipr, normDrift)` triples get folded into the
    // time-average multiple times, biasing it toward over-sampled values.
    // `readbackGeneration` is the canonical monotonic counter for
    // `diagnosticsStore.tdse` (bumped inside `pushTdseSnapshot`), and
    // re-creating this closure on every sweep start resets it naturally.
    // Seed from the current readback generation so any stale snapshot
    // already in the diagnostics store is skipped. Starting from -1 would
    // let a pre-reset snapshot through on the first tick.
    let lastGen = useDiagnosticsStore.getState().tdse.readbackGeneration

    sweepTickRef.current = setInterval(() => {
      const diag = useDiagnosticsStore.getState().tdse
      if (!diag.hasData || diag.readbackGeneration === lastGen) return
      lastGen = diag.readbackGeneration

      // Ensure diagnostics stay enabled even if user closes the analysis panel
      const extState = useExtendedObjectStore.getState()
      if (!extState.schroedinger?.tdse?.diagnosticsEnabled) {
        extState.setTdseDiagnosticsEnabled(true)
      }

      const nextGamma = useMonitoringSweepStore
        .getState()
        .tick(diag.simTime, diag.ipr, diag.normDrift)

      if (nextGamma !== null) {
        // Advance to next γ value via store actions so version counters
        // bump and validation/clamping is applied consistently
        extState.setTdseStochasticGamma(nextGamma)
        extState.resetTdseField()
      }
    }, 200)

    return () => {
      if (sweepTickRef.current) {
        clearInterval(sweepTickRef.current)
        sweepTickRef.current = null
      }
    }
  }, [status])

  // Convert sweep results to Float32Array for Sparkline
  const sweepData = useMemo(() => {
    if (results.length === 0) return null
    const arr = new Float32Array(results.length)
    for (let i = 0; i < results.length; i++) arr[i] = results[i]!.ipr
    return arr
  }, [results])

  const otherSweepRunning = useAnySweepRunning()

  if (!tdse?.stochasticEnabled) return null

  const isRunning = status === 'running'
  const isComplete = status === 'complete'

  return (
    <>
      <ControlGroup title="Monitoring Dynamics" collapsible defaultOpen={false}>
        <div className="space-y-2">
          {/* Current IPR display */}
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>IPR (1=localized, N=delocalized)</span>
            <span className="font-mono">{ipr.toFixed(4)}</span>
          </div>
          {count > 2 && <Sparkline data={historyIpr} head={head} count={count} height={32} />}

          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Norm</span>
            <span className="font-mono">{totalNorm.toFixed(4)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Norm drift</span>
            <span className="font-mono">{(normDrift * 100).toFixed(2)}%</span>
          </div>
        </div>
      </ControlGroup>

      <ControlGroup
        title="Sweep"
        collapsible
        defaultOpen
        data-testid="control-group-monitoring-sweep"
        className={isRunning ? 'opacity-70' : ''}
        rightElement={
          <span className="font-mono text-xs">
            {isRunning && `${currentStep}/${config.steps}`}
            {isComplete && `${results.length} pts`}
            {!isRunning && !isComplete && 'Ready'}
          </span>
        }
      >
        {/* Sweep controls */}

        {/* Configurable sweep parameters — hidden while running */}
        {!isRunning && !isComplete && (
          <div className="space-y-1 mb-2">
            <div className="flex gap-2">
              <NumberInput
                label="γ min"
                value={gammaMin}
                onChange={setGammaMin}
                min={0.001}
                max={10}
                step={0.01}
                tooltip="Lower bound of the monitoring-rate sweep range γ"
              />
              <NumberInput
                label="γ max"
                value={gammaMax}
                onChange={setGammaMax}
                min={0.01}
                max={10}
                step={0.1}
                tooltip="Upper bound of the monitoring-rate sweep range γ"
              />
            </div>
            <div className="flex gap-2">
              <NumberInput
                label="Steps"
                value={steps}
                onChange={(v) => setSteps(Math.floor(v))}
                min={5}
                max={50}
                step={1}
                tooltip="Number of γ sample points across the sweep range"
              />
              <NumberInput
                label="Time/step"
                value={timePerStep}
                onChange={setTimePerStep}
                min={0.1}
                max={10}
                step={0.1}
                tooltip="Simulation time accumulated at each γ point"
              />
            </div>
          </div>
        )}

        {!isRunning && !isComplete && (
          <Button
            size="sm"
            onClick={handleStartSweep}
            disabled={otherSweepRunning}
            tooltip="Begin the CSL monitoring-rate sweep"
          >
            Start Sweep
          </Button>
        )}
        {isRunning && (
          <Button
            size="sm"
            variant="primary"
            onClick={handleAbort}
            tooltip="Abort the in-progress monitoring-rate sweep"
          >
            Abort
          </Button>
        )}
        {isComplete && (
          <Button
            size="sm"
            variant="primary"
            onClick={handleClear}
            tooltip="Clear sweep results and start over"
          >
            Clear
          </Button>
        )}

        {/* Sweep results plot */}
        {sweepData && sweepData.length > 1 && (
          <div className="mt-2">
            <Sparkline
              data={sweepData}
              head={sweepData.length}
              count={sweepData.length}
              height={48}
            />
            <div className="flex justify-between text-xs text-text-tertiary mt-0.5">
              <span>γ={results[0]?.gamma.toFixed(2)}</span>
              <span>γ={results[results.length - 1]?.gamma.toFixed(2)}</span>
            </div>
          </div>
        )}
      </ControlGroup>
    </>
  )
})
MonitoringSweepSection.displayName = 'MonitoringSweepSection'
