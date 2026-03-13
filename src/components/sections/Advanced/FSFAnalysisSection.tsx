/**
 * FSF Analysis Section
 *
 * Right-editor section for freeScalarField mode. Displays:
 * - Diagnostics enable toggle + interval slider
 * - Live field observables (energy, norm, max phi/pi, energy drift)
 * - Field statistics (mean, variance)
 *
 * @module components/sections/Advanced/FSFAnalysisSection
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Switch } from '@/components/ui/Switch'
import { Slider } from '@/components/ui/Slider'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useFsfDiagnosticsStore } from '@/stores/fsfDiagnosticsStore'

/**
 * Props for FSFAnalysisSection.
 *
 * @param defaultOpen - Whether the section starts expanded
 */
export interface FSFAnalysisSectionProps {
  defaultOpen?: boolean
}

/**
 * Compact metric row for diagnostics display.
 */
const MetricRow: React.FC<{
  label: string
  value: number
  digits?: number
  unit?: string
}> = ({ label, value, digits = 4, unit = '' }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-[10px] text-text-tertiary">{label}</span>
    <span className="text-[10px] font-mono text-text-secondary tabular-nums">
      {isFinite(value) ? value.toFixed(digits) : 'NaN'}
      {unit && <span className="text-text-tertiary ml-0.5">{unit}</span>}
    </span>
  </div>
)

/**
 * Analysis section shown in the right editor panel when quantumMode === 'freeScalarField'.
 *
 * @param props - Component props
 * @returns The analysis section, UnavailableSection in other compute modes, or null in analytic modes
 *
 * @example
 * ```tsx
 * <FSFAnalysisSection defaultOpen={true} />
 * ```
 */
export const FSFAnalysisSection: React.FC<FSFAnalysisSectionProps> = React.memo(
  ({ defaultOpen = true }) => {
    const objectType = useGeometryStore((s) => s.objectType)
    const { fsf, quantumMode, setDiagnosticsEnabled, setDiagnosticsInterval } =
      useExtendedObjectStore(
        useShallow((s) => ({
          fsf: s.schroedinger.freeScalar,
          quantumMode: s.schroedinger.quantumMode,
          setDiagnosticsEnabled: s.setFreeScalarDiagnosticsEnabled,
          setDiagnosticsInterval: s.setFreeScalarDiagnosticsInterval,
        })),
      )

    if (objectType !== 'schroedinger') return null
    if (quantumMode !== 'freeScalarField') {
      const isComputeMode = quantumMode === 'tdseDynamics' || quantumMode === 'becDynamics' || quantumMode === 'diracEquation'
      if (!isComputeMode) return null
      return <UnavailableSection title="FSF Analysis" reason="Switch to Free Scalar Field mode" />
    }

    return (
      <Section
        title="FSF Analysis"
        defaultOpen={defaultOpen}
        data-testid="fsf-analysis-section"
      >
        {/* Diagnostics toggle + interval */}
        <ControlGroup
          title="Diagnostics"
          collapsible
          defaultOpen
          tooltip="GPU readback for field statistics. Costs ~1ms per readback."
        >
          <Switch
            label="Enable"
            checked={fsf.diagnosticsEnabled}
            onCheckedChange={setDiagnosticsEnabled}
          />
          {fsf.diagnosticsEnabled && (
            <Slider
              label="Interval"
              value={fsf.diagnosticsInterval}
              min={1}
              max={120}
              step={1}
              onChange={setDiagnosticsInterval}
              unit=" frames"
              tooltip="How many frames between diagnostic readbacks"
            />
          )}
        </ControlGroup>

        {/* Live metrics */}
        {fsf.diagnosticsEnabled && <DiagnosticsDisplay />}
      </Section>
    )
  }
)

FSFAnalysisSection.displayName = 'FSFAnalysisSection'

/** Separated component to isolate diagnostics store subscriptions */
const DiagnosticsDisplay: React.FC = React.memo(() => {
  const {
    hasData,
    totalEnergy,
    totalNorm,
    maxPhi,
    maxPi,
    energyDrift,
    meanPhi,
    variancePhi,
  } = useFsfDiagnosticsStore(
    useShallow((s) => ({
      hasData: s.hasData,
      totalEnergy: s.totalEnergy,
      totalNorm: s.totalNorm,
      maxPhi: s.maxPhi,
      maxPi: s.maxPi,
      energyDrift: s.energyDrift,
      meanPhi: s.meanPhi,
      variancePhi: s.variancePhi,
    }))
  )

  if (!hasData) {
    return (
      <div className="px-1 py-3 text-center">
        <p className="text-[10px] text-text-tertiary italic">
          Waiting for first readback...
        </p>
      </div>
    )
  }

  return (
    <ControlGroup title="Field Observables" collapsible defaultOpen>
      <div className="space-y-0.5 px-1">
        <MetricRow label="Total Energy" value={totalEnergy} digits={6} />
        <MetricRow label="Energy Drift" value={energyDrift * 100} digits={4} unit="%" />
        <div className="border-t border-panel-border my-1" />
        <MetricRow label="∫φ² dV (norm)" value={totalNorm} digits={4} />
        <MetricRow label="max |φ|" value={maxPhi} digits={4} />
        <MetricRow label="max |π|" value={maxPi} digits={4} />
        <div className="border-t border-panel-border my-1" />
        <MetricRow label="⟨φ⟩" value={meanPhi} digits={6} />
        <MetricRow label="Var(φ)" value={variancePhi} digits={6} />
      </div>
    </ControlGroup>
  )
})

DiagnosticsDisplay.displayName = 'DiagnosticsDisplay'
