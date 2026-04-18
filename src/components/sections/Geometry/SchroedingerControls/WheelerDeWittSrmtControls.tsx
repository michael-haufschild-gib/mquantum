/**
 * SRMT (Superspace-Relational Modular Time) controls for the Wheeler–DeWitt
 * quantum mode. Enable switch, clock selector (a / phi1 / phi2), cut
 * position slider, Schmidt rank cap, and heatmap overlay intensity.
 *
 * This panel is gated by the parent (`WheelerDeWittControls`) via the
 * `quantumMode === 'wheelerDeWitt'` check. When `srmtEnabled` is false the
 * remaining controls are rendered in a disabled state so their current
 * values remain visible but uninteractive.
 *
 * @module components/sections/Geometry/SchroedingerControls/WheelerDeWittSrmtControls
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { SrmtSpectrumPanel } from '@/components/sections/Geometry/SchroedingerControls/SrmtSpectrumPanel'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { WdwSrmtClock } from '@/lib/geometry/extended/wheelerDeWitt'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

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
 * SRMT controls panel for Wheeler–DeWitt minisuperspace. Render this inside
 * the parent `<Section>` created by `WheelerDeWittControls` — it emits a
 * flat stack of inputs (no nested section) plus the spectrum panel.
 *
 * @returns SRMT controls + spectrum panel React element.
 */
export const WheelerDeWittSrmtControls: React.FC = React.memo(() => {
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
    <div
      className="space-y-3 pt-3 mt-1 border-t"
      style={{ borderColor: 'var(--border-subtle)' }}
      data-testid="wdw-srmt-controls"
    >
      <div
        className="text-[11px] uppercase tracking-wide"
        style={{ color: 'var(--text-tertiary)' }}
      >
        SRMT diagnostic
      </div>

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
          className="text-[11px] font-mono"
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
        tooltip="Brightness of the SRMT `K_A` eigenvalue heatmap painted on the clock slice."
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
  )
})

WheelerDeWittSrmtControls.displayName = 'WheelerDeWittSrmtControls'
