/**
 * Monitoring Sweep Section
 *
 * UI for the continuous monitoring transition exploration (Feature B).
 * Shows current IPR, sweep controls, and IPR(γ) sparkline. Drives the
 * sweep state machine via a polling interval on diagnostics.
 *
 * @module components/sections/Advanced/MonitoringSweepSection
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Sparkline } from '@/components/ui/Sparkline'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { type MonitoringSweepConfig, useMonitoringSweepStore } from '@/stores/monitoringSweepStore'

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

  const sweepTickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleStartSweep = useCallback(() => {
    const cfg: MonitoringSweepConfig = {
      gammaMin: 0.01,
      gammaMax: 5.0,
      steps: 20,
      timePerStep: 1.0,
    }
    startSweep(cfg)
  }, [startSweep])

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

      const nextGamma = useMonitoringSweepStore
        .getState()
        .tick(diag.simTime, diag.ipr, diag.normDrift)

      if (nextGamma !== null) {
        // Advance to next γ value — update config and trigger reset
        const { schroedinger } = useExtendedObjectStore.getState()
        useExtendedObjectStore.setState({
          schroedinger: {
            ...schroedinger,
            tdse: {
              ...schroedinger.tdse,
              needsReset: true,
              stochasticGamma: nextGamma,
            },
          },
        })
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
          <span>IPR (participation ratio)</span>
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
