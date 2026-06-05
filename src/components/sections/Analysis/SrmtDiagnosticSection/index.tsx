/**
 * SRMT (Superspace-Relational Modular Time) diagnostic section for the
 * right panel's Analysis tab. Exposes the enable switch, clock selector
 * (a / phi1 / phi2), cut position slider, Schmidt rank cap, heatmap
 * overlay intensity, and the spectrum panel readout.
 *
 * Shown as an `UnavailableSection` placeholder when the current quantum
 * mode is not Wheeler–DeWitt.
 *
 * @module components/sections/Analysis/SrmtDiagnosticSection
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { SrmtSpectrumPanel } from '@/components/sections/Geometry/SchroedingerControls/SrmtSpectrumPanel'
import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { WdwSrmtClock } from '@/lib/geometry/extended/wheelerDeWitt'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const SECTION_TITLE = 'SRMT Diagnostic'

const CLOCK_OPTIONS: { value: WdwSrmtClock; label: string }[] = [
  { value: 'a', label: 'a' },
  { value: 'phi1', label: 'phi1' },
  { value: 'phi2', label: 'phi2' },
]

/**
 * Format the SRMT cut position as an absolute coordinate on the selected
 * clock axis:
 *
 * - `a`      → `a* = aMin + cut·(aMax − aMin)`
 * - `phi1/2` → `φ* = phiExtent·(2·cut − 1)` (since φ ∈ [−phiExtent, +phiExtent])
 *
 * Mirrors the index-space mapping in `WheelerDeWittStrategy.resolveSrmtCutIndex`
 * up to the interior-clamp that the solver applies at render time.
 */
function formatCutCoordinate(params: {
  clock: WdwSrmtClock
  cutNormalized: number
  aMin: number
  aMax: number
  phiExtent: number
}): string {
  const { clock, cutNormalized, aMin, aMax, phiExtent } = params
  if (clock === 'a') {
    const a = aMin + cutNormalized * (aMax - aMin)
    return `a* = ${a.toFixed(3)}`
  }
  const phi = phiExtent * (2 * cutNormalized - 1)
  const symbol = clock === 'phi1' ? 'phi1*' : 'phi2*'
  return `${symbol} = ${phi.toFixed(3)}`
}

/**
 * Analysis-tab section exposing the Wheeler–DeWitt SRMT diagnostic
 * controls. Renders an `UnavailableSection` placeholder when the current
 * quantum mode is not Wheeler–DeWitt, matching the visible-but-disabled
 * pattern used by other analysis sections.
 *
 * @returns The SRMT diagnostic section, or an unavailable placeholder.
 */
export function SrmtDiagnosticSection() {
  const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)

  if (quantumMode !== 'wheelerDeWitt') {
    return (
      <UnavailableSection
        title={SECTION_TITLE}
        reason="Available in Wheeler–DeWitt mode"
        data-testid="srmt-diagnostic-section-unavailable"
      />
    )
  }

  return <SrmtDiagnosticContent />
}

const SrmtDiagnosticContent: React.FC = React.memo(() => {
  const {
    srmtEnabled,
    srmtClock,
    srmtCutNormalized,
    srmtRankCap,
    srmtHeatmapIntensity,
    aMin,
    aMax,
    phiExtent,
    setSrmtEnabled,
    setSrmtClock,
    setSrmtCutNormalized,
    setSrmtRankCap,
    setSrmtHeatmapIntensity,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      srmtEnabled: s.schroedinger.wheelerDeWitt.srmtEnabled,
      srmtClock: s.schroedinger.wheelerDeWitt.srmtClock,
      srmtCutNormalized: s.schroedinger.wheelerDeWitt.srmtCutNormalized,
      srmtRankCap: s.schroedinger.wheelerDeWitt.srmtRankCap,
      srmtHeatmapIntensity: s.schroedinger.wheelerDeWitt.srmtHeatmapIntensity,
      aMin: s.schroedinger.wheelerDeWitt.aMin,
      aMax: s.schroedinger.wheelerDeWitt.aMax,
      phiExtent: s.schroedinger.wheelerDeWitt.phiExtent,
      setSrmtEnabled: s.setWdwSrmtEnabled,
      setSrmtClock: s.setWdwSrmtClock,
      setSrmtCutNormalized: s.setWdwSrmtCutNormalized,
      setSrmtRankCap: s.setWdwSrmtRankCap,
      setSrmtHeatmapIntensity: s.setWdwSrmtHeatmapIntensity,
    }))
  )

  const cutCoordLabel = formatCutCoordinate({
    clock: srmtClock,
    cutNormalized: srmtCutNormalized,
    aMin,
    aMax,
    phiExtent,
  })

  return (
    <Section title={SECTION_TITLE} data-testid="srmt-diagnostic-section">
      <div className="space-y-3" data-testid="wdw-srmt-controls">
        <Switch
          label="Enable SRMT"
          checked={srmtEnabled}
          onCheckedChange={setSrmtEnabled}
          tooltip="Superspace-Relational Modular Time: compares modular-Hamiltonian and Hamilton-Jacobi spectra under different clock choices."
          data-testid="wdw-srmt-enable-switch"
        />

        <ToggleGroup
          options={CLOCK_OPTIONS}
          value={srmtClock}
          onChange={(v) => setSrmtClock(v as WdwSrmtClock)}
          ariaLabel="SRMT clock axis"
          tooltip="Clock axis for the Schmidt decomposition. DeWitt-timelike `a` is the SRMT conjecture's preferred clock; phi1/phi2 are controls."
          fullWidth
          disabled={!srmtEnabled}
          data-testid="wdw-srmt-clock-selector"
        />

        <div className="space-y-1">
          <Slider
            label="Cut"
            tooltip="Normalized cut position along the clock axis. Determines the slice at which the Hamilton-Jacobi operator is evaluated."
            min={0.1}
            max={0.9}
            step={0.01}
            value={srmtCutNormalized}
            onChange={setSrmtCutNormalized}
            showValue
            disabled={!srmtEnabled}
            data-testid="wdw-srmt-cut-slider"
          />
          <div
            className="text-2xs font-mono"
            style={{
              color: srmtEnabled ? 'var(--text-tertiary)' : 'var(--text-disabled)',
            }}
            data-testid="wdw-srmt-cut-coord-readout"
          >
            {cutCoordLabel}
          </div>
        </div>

        <Slider
          label="Rank cap"
          tooltip="Upper bound on the number of Schmidt singular values retained. Lower values = cheaper, rougher spectrum."
          min={8}
          max={256}
          step={8}
          value={srmtRankCap}
          onChange={setSrmtRankCap}
          showValue
          disabled={!srmtEnabled}
          data-testid="wdw-srmt-rank-slider"
        />

        <Slider
          label="Overlay"
          tooltip="Brightness of the SRMT conditional-density heatmap painted on the clock slice. The modular-Hamiltonian spectrum is shown in the panel below."
          min={0}
          max={1}
          step={0.05}
          value={srmtHeatmapIntensity}
          onChange={setSrmtHeatmapIntensity}
          showValue
          disabled={!srmtEnabled}
          data-testid="wdw-srmt-intensity-slider"
        />

        <SrmtSpectrumPanel srmtEnabled={srmtEnabled} selectedClock={srmtClock} />
      </div>
    </Section>
  )
})

SrmtDiagnosticContent.displayName = 'SrmtDiagnosticContent'
