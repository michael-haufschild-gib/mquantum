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
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import {
  gammaForStep,
  type MonitoringSweepConfig,
  useMonitoringSweepStore,
} from '@/stores/monitoringSweepStore'

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

  // Force diagnostics to stay enabled while sweep is running
  useEffect(() => {
    if (status === 'running') {
      useExtendedObjectStore.getState().setTdseDiagnosticsEnabled(true)
    }
  }, [status])

  const handleStartSweep = useCallback(() => {
    const cfg: MonitoringSweepConfig = {
      gammaMin,
      gammaMax,
      steps,
      timePerStep,
    }
    // Force diagnostics on before starting
    const store = useExtendedObjectStore.getState()
    store.setTdseDiagnosticsEnabled(true)
    // Set initial γ and trigger reset so step 0 starts deterministically
    const initialGamma = gammaForStep(cfg, 0)
    store.setTdseStochasticGamma(initialGamma)
    store.resetTdseField()
    startSweep(cfg)
  }, [gammaMin, gammaMax, steps, timePerStep, startSweep])

  // Drive the sweep state machine by polling diagnostics
  useEffect(() => {
    if (status !== 'running') {
      if (sweepTickRef.current) {
        clearInterval(sweepTickRef.current)
        sweepTickRef.current = null
      }
      return
    }

    sweepTickRef.current = setInterval(() => {
      const diag = useDiagnosticsStore.getState().tdse
      if (!diag.hasData) return

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

  if (!tdse?.stochasticEnabled) return null

  const isRunning = status === 'running'
  const isComplete = status === 'complete'

  return (
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

        {/* Sweep controls */}
        <div className="border-t border-panel-border/50 pt-2 mt-2">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
            <span>γ Sweep</span>
            <span className="font-mono">
              {isRunning && `${currentStep}/${config.steps}`}
              {isComplete && `${results.length} pts`}
              {!isRunning && !isComplete && 'Ready'}
            </span>
          </div>

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
                />
                <NumberInput
                  label="γ max"
                  value={gammaMax}
                  onChange={setGammaMax}
                  min={0.01}
                  max={10}
                  step={0.1}
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
                />
                <NumberInput
                  label="Time/step"
                  value={timePerStep}
                  onChange={setTimePerStep}
                  min={0.1}
                  max={10}
                  step={0.1}
                />
              </div>
            </div>
          )}

          {!isRunning && !isComplete && (
            <Button size="sm" onClick={handleStartSweep}>
              Start Sweep
            </Button>
          )}
          {isRunning && (
            <Button size="sm" variant="secondary" onClick={abort}>
              Abort
            </Button>
          )}
          {isComplete && (
            <Button size="sm" variant="secondary" onClick={reset}>
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
              <div className="flex justify-between text-[10px] text-text-tertiary mt-0.5">
                <span>γ={results[0]?.gamma.toFixed(2)}</span>
                <span>γ={results[results.length - 1]?.gamma.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </ControlGroup>
  )
})

MonitoringSweepSection.displayName = 'MonitoringSweepSection'
