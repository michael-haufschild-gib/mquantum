/**
 * Probability Current (j-field) Controls
 *
 * Extracted from SchroedingerAnimationDrawer to reduce component complexity.
 * Controls the physical probability current field overlay.
 *
 * @module components/layout/TimelineControls/ProbabilityCurrentPanel
 */

import React from 'react'

import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { ToggleButton } from '@/components/ui/ToggleButton'
import type {
  SchroedingerConfig,
  SchroedingerProbabilityCurrentColorMode,
  SchroedingerProbabilityCurrentPlacement,
  SchroedingerProbabilityCurrentStyle,
} from '@/lib/geometry/extended/types'

const STYLE_OPTIONS: { value: SchroedingerProbabilityCurrentStyle; label: string }[] = [
  { value: 'magnitude', label: 'Magnitude' },
  { value: 'arrows', label: 'Arrows' },
  { value: 'surfaceLIC', label: 'Surface LIC' },
  { value: 'streamlines', label: 'Streamlines' },
]

const PLACEMENT_OPTIONS: { value: SchroedingerProbabilityCurrentPlacement; label: string }[] = [
  { value: 'isosurface', label: 'Isosurface' },
  { value: 'volume', label: 'Volume' },
]

const COLOR_MODE_OPTIONS: { value: SchroedingerProbabilityCurrentColorMode; label: string }[] = [
  { value: 'magnitude', label: 'Magnitude' },
  { value: 'direction', label: 'Direction' },
  { value: 'circulationSign', label: 'Circulation Sign' },
]

/** Props for ProbabilityCurrentPanel. */
interface ProbabilityCurrentPanelProps {
  config: Partial<SchroedingerConfig>
  setProbabilityCurrentEnabled: (v: boolean) => void
  setProbabilityCurrentStyle: (v: SchroedingerProbabilityCurrentStyle) => void
  setProbabilityCurrentPlacement: (v: SchroedingerProbabilityCurrentPlacement) => void
  setProbabilityCurrentColorMode: (v: SchroedingerProbabilityCurrentColorMode) => void
  setProbabilityCurrentScale: (v: number) => void
  setProbabilityCurrentSpeed: (v: number) => void
  setProbabilityCurrentDensityThreshold: (v: number) => void
  setProbabilityCurrentMagnitudeThreshold: (v: number) => void
  setProbabilityCurrentLineDensity: (v: number) => void
  setProbabilityCurrentStepSize: (v: number) => void
  setProbabilityCurrentSteps: (v: number) => void
  setProbabilityCurrentOpacity: (v: number) => void
}

/**
 * Controls for the probability current (j) field overlay.
 *
 * @param props - Panel properties with config and setter callbacks
 * @returns React component
 */
export const ProbabilityCurrentPanel: React.FC<ProbabilityCurrentPanelProps> = React.memo(
  ({
    config,
    setProbabilityCurrentEnabled,
    setProbabilityCurrentStyle,
    setProbabilityCurrentPlacement,
    setProbabilityCurrentColorMode,
    setProbabilityCurrentScale,
    setProbabilityCurrentSpeed,
    setProbabilityCurrentDensityThreshold,
    setProbabilityCurrentMagnitudeThreshold,
    setProbabilityCurrentLineDensity,
    setProbabilityCurrentStepSize,
    setProbabilityCurrentSteps,
    setProbabilityCurrentOpacity,
  }) => (
    <div className="space-y-4" data-testid="animation-panel-probabilityCurrent">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
          Probability Current (j)
        </label>
        <ToggleButton
          pressed={config.probabilityCurrentEnabled ?? false}
          onToggle={() =>
            setProbabilityCurrentEnabled(!(config.probabilityCurrentEnabled ?? false))
          }
          className="text-xs px-2 py-1 h-auto"
          ariaLabel="Toggle probability current field"
          data-testid="schroedinger-probability-current-toggle"
        >
          {config.probabilityCurrentEnabled ? 'ON' : 'OFF'}
        </ToggleButton>
      </div>
      <div
        className={`space-y-3 ${!config.probabilityCurrentEnabled ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <Select
          label="Style"
          options={STYLE_OPTIONS}
          value={config.probabilityCurrentStyle ?? 'magnitude'}
          onChange={setProbabilityCurrentStyle}
          data-testid="schroedinger-probability-current-style"
        />
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Placement"
            options={PLACEMENT_OPTIONS}
            value={config.probabilityCurrentPlacement ?? 'isosurface'}
            onChange={setProbabilityCurrentPlacement}
            data-testid="schroedinger-probability-current-placement"
          />
          <Select
            label="Color Mode"
            options={COLOR_MODE_OPTIONS}
            value={config.probabilityCurrentColorMode ?? 'magnitude'}
            onChange={setProbabilityCurrentColorMode}
            data-testid="schroedinger-probability-current-color-mode"
          />
        </div>
        <Slider
          label="Scale"
          min={0.0}
          max={5.0}
          step={0.05}
          value={config.probabilityCurrentScale ?? 1.0}
          onChange={setProbabilityCurrentScale}
          showValue
          data-testid="schroedinger-probability-current-scale"
        />
        <Slider
          label="Speed"
          min={0.0}
          max={10.0}
          step={0.1}
          value={config.probabilityCurrentSpeed ?? 1.0}
          onChange={setProbabilityCurrentSpeed}
          showValue
          data-testid="schroedinger-probability-current-speed"
        />
        <Slider
          label="Density Threshold"
          min={0.0}
          max={1.0}
          step={0.001}
          value={config.probabilityCurrentDensityThreshold ?? 0.01}
          onChange={setProbabilityCurrentDensityThreshold}
          showValue
          data-testid="schroedinger-probability-current-density-threshold"
        />
        <Slider
          label="Current Threshold"
          min={0.0}
          max={10.0}
          step={0.01}
          value={config.probabilityCurrentMagnitudeThreshold ?? 0.0}
          onChange={setProbabilityCurrentMagnitudeThreshold}
          showValue
          data-testid="schroedinger-probability-current-magnitude-threshold"
        />
        <p className="text-xs text-text-tertiary">
          Flow is physically zero for many real stationary states. Use complex states (for example,
          Hydrogen with real orbitals OFF and m ≠ 0, or oscillator superpositions) to see
          circulation.
        </p>
        {config.probabilityCurrentStyle === 'magnitude' && (
          <p className="text-xs text-text-tertiary">Colors the local |j| magnitude directly.</p>
        )}
        {config.probabilityCurrentStyle === 'arrows' && (
          <Slider
            label="Arrow Opacity"
            min={0.0}
            max={1.0}
            step={0.01}
            value={config.probabilityCurrentOpacity ?? 0.7}
            onChange={setProbabilityCurrentOpacity}
            showValue
            data-testid="schroedinger-probability-current-opacity"
          />
        )}
        {(config.probabilityCurrentStyle === 'surfaceLIC' ||
          config.probabilityCurrentStyle === 'streamlines') && (
          <>
            <Slider
              label="Line Density"
              min={1.0}
              max={64.0}
              step={0.5}
              value={config.probabilityCurrentLineDensity ?? 8.0}
              onChange={setProbabilityCurrentLineDensity}
              showValue
              data-testid="schroedinger-probability-current-line-density"
            />
            <Slider
              label="Integration Step"
              min={0.005}
              max={0.2}
              step={0.005}
              value={config.probabilityCurrentStepSize ?? 0.04}
              onChange={setProbabilityCurrentStepSize}
              showValue
              data-testid="schroedinger-probability-current-step-size"
            />
            <Slider
              label="Integration Steps"
              min={4}
              max={64}
              step={1}
              value={config.probabilityCurrentSteps ?? 20}
              onChange={setProbabilityCurrentSteps}
              showValue
              data-testid="schroedinger-probability-current-steps"
            />
          </>
        )}
      </div>
    </div>
  )
)
ProbabilityCurrentPanel.displayName = 'ProbabilityCurrentPanel'
