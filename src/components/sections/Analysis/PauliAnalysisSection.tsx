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
 * @module components/sections/Analysis/PauliAnalysisSection
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Slider } from '@/components/ui/Slider'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import { DiagnosticsCard, NormDriftRow } from './AnalysisPrimitives'

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
  const { diagnosticsInterval, setDiagnosticsInterval } = useExtendedObjectStore(
    useShallow((s) => ({
      diagnosticsInterval: s.pauliSpinor.diagnosticsInterval,
      setDiagnosticsInterval: s.setPauliDiagnosticsInterval,
    }))
  )

  return (
    <>
      <Slider
        label="Diagnostics Interval (frames)"
        tooltip="How often to compute Pauli observables (spin fractions, coherence, Larmor frequency). Lower values update faster but use more GPU time."
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
  } = useDiagnosticsStore(
    useShallow((s) => ({
      hasData: s.pauli.hasData,
      totalNorm: s.pauli.totalNorm,
      normDrift: s.pauli.normDrift,
      maxDensity: s.pauli.maxDensity,
      spinUpFraction: s.pauli.spinUpFraction,
      spinDownFraction: s.pauli.spinDownFraction,
      spinExpectationZ: s.pauli.spinExpectationZ,
      coherenceMagnitude: s.pauli.coherenceMagnitude,
      larmorFrequency: s.pauli.larmorFrequency,
    }))
  )

  return (
    <DiagnosticsCard testId="pauli-analysis-inline" hasData={hasData}>
      {/* Spin component fractions */}
      <div className="flex gap-3">
        <span>↑={(spinUpFraction * 100).toFixed(1)}%</span>
        <span>↓={(spinDownFraction * 100).toFixed(1)}%</span>
      </div>

      {/* Spin expectation and coherence */}
      <div className="flex gap-3">
        <span>
          ⟨σ_z⟩={spinExpectationZ >= 0 ? '+' : ''}
          {spinExpectationZ.toFixed(3)}
        </span>
        <span>|ρ_↑↓|={coherenceMagnitude.toFixed(3)}</span>
      </div>

      <NormDriftRow totalNorm={totalNorm} normDrift={normDrift} />
      <div className="flex gap-3">
        <span>n_max={maxDensity.toFixed(4)}</span>
      </div>

      {/* Characteristic scale */}
      <div className="mt-1 pt-1 border-t border-[var(--border-subtle)]">
        <div className="flex gap-3">
          <span>ω_L={larmorFrequency.toFixed(3)}</span>
        </div>
      </div>
    </DiagnosticsCard>
  )
})

PauliDiagnosticsInline.displayName = 'PauliDiagnosticsInline'
