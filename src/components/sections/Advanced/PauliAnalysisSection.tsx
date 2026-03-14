/**
 * Pauli Analysis Content
 *
 * Content component for pauliSpinor mode analysis. Displays:
 * - Diagnostics interval slider
 * - Live Pauli observables (spin fractions, ⟨σ_z⟩, coherence, norm)
 * - Larmor frequency readout
 *
 * Used inside the unified AnalysisSection.
 *
 * @module components/sections/Advanced/PauliAnalysisSection
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Slider } from '@/components/ui/Slider'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { usePauliDiagnosticsStore } from '@/stores/pauliDiagnosticsStore'

/**
 * Analysis content for pauliSpinor mode.
 * Renders diagnostics controls and live spin observables.
 *
 * @returns Diagnostics controls and Pauli observables
 *
 * @example
 * ```tsx
 * <PauliAnalysisContent />
 * ```
 */
export const PauliAnalysisContent: React.FC = React.memo(() => {
  const { diagnosticsInterval, setDiagnosticsInterval } =
    useExtendedObjectStore(
      useShallow((s) => ({
        diagnosticsInterval: s.pauliSpinor.diagnosticsInterval,
        setDiagnosticsInterval: s.setPauliDiagnosticsInterval,
      })),
    )

  return (
    <>
      <Slider
        label="Diagnostics Interval (frames)"
        min={1}
        max={60}
        step={1}
        value={diagnosticsInterval}
        onChange={setDiagnosticsInterval}
        showValue
        data-testid="pauli-diagnostics-interval"
      />

      <PauliDiagnosticsInline />
    </>
  )
})

PauliAnalysisContent.displayName = 'PauliAnalysisContent'

/* ────────────────────────────────────────────────────────────── */
/*  Inline Pauli diagnostics display                              */
/* ────────────────────────────────────────────────────────────── */

const PauliDiagnosticsInline: React.FC = React.memo(() => {
  const {
    hasData,
    totalNorm,
    normDrift,
    maxDensity,
    spinUpFraction,
    spinDownFraction,
    spinExpectationZ,
    coherenceMagnitude,
    larmorFrequency,
  } = usePauliDiagnosticsStore(
    useShallow((s) => ({
      hasData: s.hasData,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      maxDensity: s.maxDensity,
      spinUpFraction: s.spinUpFraction,
      spinDownFraction: s.spinDownFraction,
      spinExpectationZ: s.spinExpectationZ,
      coherenceMagnitude: s.coherenceMagnitude,
      larmorFrequency: s.larmorFrequency,
    })),
  )

  return (
    <div className="mt-2" data-testid="pauli-analysis-inline">
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <div className="px-2 py-1.5 space-y-0.5 text-[9px] font-mono leading-tight text-text-secondary">
          {hasData ? (
            <>
              {/* Spin component fractions */}
              <div className="flex gap-3">
                <span>↑={( spinUpFraction * 100).toFixed(1)}%</span>
                <span>↓={( spinDownFraction * 100).toFixed(1)}%</span>
              </div>

              {/* Spin expectation and coherence */}
              <div className="flex gap-3">
                <span>⟨σ_z⟩={spinExpectationZ >= 0 ? '+' : ''}{spinExpectationZ.toFixed(3)}</span>
                <span>|ρ_↑↓|={coherenceMagnitude.toFixed(3)}</span>
              </div>

              {/* Norm and density */}
              <div className="flex gap-3">
                <span className="text-text-tertiary">||ψ||²={totalNorm.toFixed(4)}</span>
                <span className={Math.abs(normDrift) > 0.01 ? 'text-red-400' : 'text-text-tertiary'}>
                  Δ={normDrift >= 0 ? '+' : ''}{(normDrift * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex gap-3">
                <span>n_max={maxDensity.toFixed(4)}</span>
              </div>

              {/* Characteristic scale */}
              <div className="mt-1 pt-1 border-t border-[var(--border-subtle)]">
                <div className="flex gap-3">
                  <span>ω_L={larmorFrequency.toFixed(3)}</span>
                </div>
              </div>
            </>
          ) : (
            <span className="text-text-tertiary">Awaiting diagnostics...</span>
          )}
        </div>
      </div>
    </div>
  )
})

PauliDiagnosticsInline.displayName = 'PauliDiagnosticsInline'
