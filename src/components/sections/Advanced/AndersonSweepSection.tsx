/**
 * Anderson Disorder Sweep UI
 *
 * Controls for automated parameter scans across disorder strength W.
 * Displays a scatter plot of W vs IPR after the sweep completes.
 *
 * @module components/sections/Advanced/AndersonSweepSection
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { Slider } from '@/components/ui/Slider'
import type { SweepConfig, SweepResult } from '@/stores/andersonSweepStore'
import { seedForStep, useAndersonSweepStore, wForStep } from '@/stores/andersonSweepStore'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

/** SVG layout for the sweep results scatter plot. */
const SVG_W = 260
const SVG_H = 100
const PAD = { left: 36, right: 8, top: 8, bottom: 20 }
const PLOT_W = SVG_W - PAD.left - PAD.right
const PLOT_H = SVG_H - PAD.top - PAD.bottom

/**
 * Scatter plot of sweep results: W vs IPR.
 *
 * @param props - Component props
 * @returns SVG scatter plot
 */
const SweepPlot: React.FC<{ results: SweepResult[]; config: SweepConfig }> = React.memo(
  ({ results, config }) => {
    if (results.length === 0) return null

    const iprMax = Math.max(...results.map((r) => r.ipr), 1e-6)
    const toX = (w: number) =>
      PAD.left + ((w - config.wMin) / (config.wMax - config.wMin || 1)) * PLOT_W
    const toY = (ipr: number) => PAD.top + (1 - ipr / iprMax) * PLOT_H

    return (
      <div className="mt-2" data-testid="anderson-sweep-plot">
        <p className="text-[10px] text-text-secondary mb-1">W vs IPR</p>
        <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
          <svg width="100%" viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="block">
            {/* Axes */}
            <line
              x1={PAD.left}
              y1={PAD.top}
              x2={PAD.left}
              y2={PAD.top + PLOT_H}
              stroke="var(--text-secondary)"
              strokeWidth={0.5}
            />
            <line
              x1={PAD.left}
              y1={PAD.top + PLOT_H}
              x2={PAD.left + PLOT_W}
              y2={PAD.top + PLOT_H}
              stroke="var(--text-secondary)"
              strokeWidth={0.5}
            />
            {/* X label */}
            <text
              x={PAD.left + PLOT_W / 2}
              y={SVG_H - 2}
              textAnchor="middle"
              fill="var(--text-tertiary)"
              fontSize={8}
              fontFamily="monospace"
            >
              W (disorder)
            </text>
            {/* Y label */}
            <text
              x={4}
              y={PAD.top + PLOT_H / 2}
              textAnchor="middle"
              fill="var(--text-tertiary)"
              fontSize={8}
              fontFamily="monospace"
              transform={`rotate(-90, 4, ${PAD.top + PLOT_H / 2})`}
            >
              IPR
            </text>
            {/* Data points */}
            {results.map((r, i) => (
              <circle
                key={i}
                cx={toX(r.w)}
                cy={toY(r.ipr)}
                r={3}
                fill="var(--theme-accent)"
                fillOpacity={0.8}
                stroke="var(--theme-accent)"
                strokeWidth={0.5}
              />
            ))}
            {/* Connecting line */}
            {results.length > 1 && (
              <polyline
                points={results.map((r) => `${toX(r.w)},${toY(r.ipr)}`).join(' ')}
                fill="none"
                stroke="var(--theme-accent)"
                strokeWidth={1}
                strokeOpacity={0.5}
              />
            )}
            {/* Axis tick labels */}
            <text
              x={PAD.left}
              y={SVG_H - 10}
              textAnchor="middle"
              fill="var(--text-tertiary)"
              fontSize={7}
              fontFamily="monospace"
            >
              {config.wMin.toFixed(0)}
            </text>
            <text
              x={PAD.left + PLOT_W}
              y={SVG_H - 10}
              textAnchor="middle"
              fill="var(--text-tertiary)"
              fontSize={7}
              fontFamily="monospace"
            >
              {config.wMax.toFixed(0)}
            </text>
            <text
              x={PAD.left - 3}
              y={PAD.top + 3}
              textAnchor="end"
              fill="var(--text-tertiary)"
              fontSize={7}
              fontFamily="monospace"
            >
              {iprMax.toExponential(1)}
            </text>
          </svg>
        </div>
      </div>
    )
  }
)
SweepPlot.displayName = 'SweepPlot'

/**
 * Anderson disorder sweep controls and results display.
 * Shown when potential type is 'andersonDisorder' in TDSE mode.
 *
 * @returns Sweep control section
 */
export const AndersonSweepSection: React.FC = React.memo(() => {
  const { status, config, currentStep, results } = useAndersonSweepStore(
    useShallow((s) => ({
      status: s.status,
      config: s.config,
      currentStep: s.currentStep,
      results: s.results,
    }))
  )

  const [wMin, setWMin] = useState(1)
  const [wMax, setWMax] = useState(30)
  const [steps, setSteps] = useState(10)
  const [timePerStep, setTimePerStep] = useState(1.0)

  const isRunning = status === 'running'
  const isComplete = status === 'complete'

  // Ref to track the sweep's effect on the TDSE config
  const sweepTickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const handleStart = useCallback(() => {
    const sweepConfig: SweepConfig = {
      wMin,
      wMax,
      steps,
      timePerStep,
      distribution: 'uniform',
    }

    // Single atomic setState to avoid stale-snapshot overwrites.
    // Previous pattern called setters then spread a pre-mutation snapshot,
    // which reverted diagnosticsEnabled and potentialType.
    const firstW = wForStep(sweepConfig, 0)
    const firstSeed = seedForStep(0)
    const { schroedinger } = useExtendedObjectStore.getState()
    useExtendedObjectStore.setState({
      schroedinger: {
        ...schroedinger,
        tdse: {
          ...schroedinger.tdse,
          needsReset: true,
          disorderStrength: firstW,
          disorderSeed: firstSeed,
          diagnosticsEnabled: true,
          potentialType: 'andersonDisorder',
          absorberEnabled: false,
        },
      },
    })

    useAndersonSweepStore.getState().startSweep(sweepConfig)
  }, [wMin, wMax, steps, timePerStep])

  const handleAbort = () => {
    useAndersonSweepStore.getState().abort()
  }

  const handleReset = () => {
    useAndersonSweepStore.getState().reset()
  }

  // Tick the sweep state machine when diagnostics update
  useEffect(() => {
    if (status !== 'running') {
      if (sweepTickRef.current) {
        clearInterval(sweepTickRef.current)
        sweepTickRef.current = null
      }
      return
    }

    // Poll diagnostics every 200ms to check if enough simTime has elapsed
    sweepTickRef.current = setInterval(() => {
      const diag = useDiagnosticsStore.getState().tdse
      if (!diag.hasData) return

      const nextW = useAndersonSweepStore.getState().tick(diag.simTime, diag.ipr, diag.normDrift)

      if (nextW !== null) {
        // Advance to next W value — single atomic setState to avoid stale spread
        const seed = seedForStep(useAndersonSweepStore.getState().currentStep)
        const { schroedinger } = useExtendedObjectStore.getState()
        useExtendedObjectStore.setState({
          schroedinger: {
            ...schroedinger,
            tdse: {
              ...schroedinger.tdse,
              needsReset: true,
              disorderStrength: nextW,
              disorderSeed: seed,
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

  return (
    <div
      className="border-t border-border-subtle pt-3 space-y-3"
      data-testid="anderson-sweep-section"
    >
      <p className="text-[10px] font-medium text-text-secondary uppercase tracking-wide">
        Disorder Sweep
      </p>

      {!isRunning && !isComplete && (
        <>
          <Slider
            label="W min"
            tooltip="Minimum disorder strength for the sweep."
            min={0}
            max={50}
            step={0.5}
            value={wMin}
            onChange={setWMin}
            showValue
            data-testid="sweep-w-min"
          />
          <Slider
            label="W max"
            tooltip="Maximum disorder strength for the sweep."
            min={1}
            max={100}
            step={0.5}
            value={wMax}
            onChange={setWMax}
            showValue
            data-testid="sweep-w-max"
          />
          <Slider
            label="Steps"
            tooltip="Number of disorder strength values to scan between W min and W max."
            min={2}
            max={30}
            step={1}
            value={steps}
            onChange={setSteps}
            showValue
            data-testid="sweep-steps"
          />
          <Slider
            label="Time / step"
            tooltip="Simulation time per realization. Longer times give more accurate IPR measurements but take longer."
            min={0.1}
            max={5.0}
            step={0.1}
            value={timePerStep}
            onChange={setTimePerStep}
            showValue
            data-testid="sweep-time-per-step"
          />
          <Button size="sm" variant="primary" onClick={handleStart} data-testid="sweep-start">
            Start Sweep
          </Button>
        </>
      )}

      {isRunning && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-text-secondary font-mono">
              Step {currentStep + 1}/{config.steps} — W={wForStep(config, currentStep).toFixed(1)}
            </span>
            <Button size="sm" variant="secondary" onClick={handleAbort} data-testid="sweep-abort">
              Abort
            </Button>
          </div>
          {/* Progress bar */}
          <div className="h-1 rounded-full bg-[var(--bg-surface)] overflow-hidden">
            <div
              className="h-full bg-[var(--theme-accent)] transition-all duration-300"
              style={{ width: `${(currentStep / config.steps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {isComplete && (
        <div className="space-y-2">
          <span className="text-[10px] text-text-secondary font-mono">
            Sweep complete — {results.length} realizations
          </span>
          <Button size="sm" variant="secondary" onClick={handleReset} data-testid="sweep-reset">
            New Sweep
          </Button>
        </div>
      )}

      {results.length > 0 && <SweepPlot results={results} config={config} />}
    </div>
  )
})

AndersonSweepSection.displayName = 'AndersonSweepSection'
