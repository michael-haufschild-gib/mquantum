/**
 * SchroedingerAnimationDrawer Component
 *
 * Animation controls for Schroedinger quantum visualization, displayed in the
 * TimelineControls bottom drawer.
 *
 * Supports both active physics modes:
 * - Harmonic Oscillator: Full animation suite including superposition-specific effects
 * - Hydrogen ND: Time evolution and flow effects in N-dimensional hydrogen space
 *
 * Animation Systems:
 * - Time Evolution: Controls the speed of quantum phase evolution (both modes)
 * - Interference Fringing: Phase-modulated density ripples
 * - Probability Flow: Density-gradient-modulated flowing noise
 * - Probability Current (j): Physical current-density field overlay controls
 * - Slice Animation: 4D+ only, animates the 4D slice position
 *
 * @see docs/prd/ndimensional-visualizer.md
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { Slider } from '@/components/ui/Slider'
import { Select } from '@/components/ui/Select'
import { AnimationDrawerContainer } from './AnimationDrawerContainer'
import type {
  SchroedingerProbabilityCurrentColorMode,
  SchroedingerProbabilityCurrentPlacement,
  SchroedingerProbabilityCurrentStyle,
} from '@/lib/geometry/extended/types'

const PROBABILITY_CURRENT_STYLE_OPTIONS: {
  value: SchroedingerProbabilityCurrentStyle
  label: string
}[] = [
  { value: 'magnitude', label: 'Magnitude' },
  { value: 'arrows', label: 'Arrows' },
  { value: 'surfaceLIC', label: 'Surface LIC' },
  { value: 'streamlines', label: 'Streamlines' },
]

const PROBABILITY_CURRENT_PLACEMENT_OPTIONS: {
  value: SchroedingerProbabilityCurrentPlacement
  label: string
}[] = [
  { value: 'isosurface', label: 'Isosurface' },
  { value: 'volume', label: 'Volume' },
]

const PROBABILITY_CURRENT_COLOR_MODE_OPTIONS: {
  value: SchroedingerProbabilityCurrentColorMode
  label: string
}[] = [
  { value: 'magnitude', label: 'Magnitude' },
  { value: 'direction', label: 'Direction' },
  { value: 'circulationSign', label: 'Circulation Sign' },
]

/**
 *
 */
export interface SchroedingerAnimationDrawerProps {
  /** Callback to close the drawer */
  onClose?: () => void
}

/**
 * SchroedingerAnimationDrawer component
 *
 * Renders animation controls for Schroedinger/Schroedinger fractals within
 * the timeline drawer. Uses consistent styling with other animation
 * system panels.
 *
 * @returns React component
 */
export const SchroedingerAnimationDrawer: React.FC<SchroedingerAnimationDrawerProps> = React.memo(
  ({ onClose }) => {
    const dimension = useGeometryStore((state) => state.dimension)

    // Get config and setters from store
    const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
      config: state.schroedinger,
      // Time Evolution
      setTimeScale: state.setSchroedingerTimeScale,
      // TDSE Auto-Loop
      setTdseAutoLoop: state.setTdseAutoLoop,
      // Slice Animation
      setSliceAnimationEnabled: state.setSchroedingerSliceAnimationEnabled,
      setSliceSpeed: state.setSchroedingerSliceSpeed,
      setSliceAmplitude: state.setSchroedingerSliceAmplitude,
      // Phase Animation (Hydrogen ND only)
      setPhaseAnimationEnabled: state.setSchroedingerPhaseAnimationEnabled,
      // Interference Fringing
      setInterferenceEnabled: state.setSchroedingerInterferenceEnabled,
      setInterferenceAmp: state.setSchroedingerInterferenceAmp,
      setInterferenceFreq: state.setSchroedingerInterferenceFreq,
      setInterferenceSpeed: state.setSchroedingerInterferenceSpeed,
      // Probability Current Flow
      setProbabilityFlowEnabled: state.setSchroedingerProbabilityFlowEnabled,
      setProbabilityFlowSpeed: state.setSchroedingerProbabilityFlowSpeed,
      setProbabilityFlowStrength: state.setSchroedingerProbabilityFlowStrength,
      // Probability Current (j-field)
      setProbabilityCurrentEnabled: state.setSchroedingerProbabilityCurrentEnabled,
      setProbabilityCurrentStyle: state.setSchroedingerProbabilityCurrentStyle,
      setProbabilityCurrentPlacement: state.setSchroedingerProbabilityCurrentPlacement,
      setProbabilityCurrentColorMode: state.setSchroedingerProbabilityCurrentColorMode,
      setProbabilityCurrentScale: state.setSchroedingerProbabilityCurrentScale,
      setProbabilityCurrentSpeed: state.setSchroedingerProbabilityCurrentSpeed,
      setProbabilityCurrentDensityThreshold: state.setSchroedingerProbabilityCurrentDensityThreshold,
      setProbabilityCurrentMagnitudeThreshold:
        state.setSchroedingerProbabilityCurrentMagnitudeThreshold,
      setProbabilityCurrentLineDensity: state.setSchroedingerProbabilityCurrentLineDensity,
      setProbabilityCurrentStepSize: state.setSchroedingerProbabilityCurrentStepSize,
      setProbabilityCurrentSteps: state.setSchroedingerProbabilityCurrentSteps,
      setProbabilityCurrentOpacity: state.setSchroedingerProbabilityCurrentOpacity,
    }))

    const {
      config,
      // Time Evolution
      setTimeScale,
      // TDSE Auto-Loop
      setTdseAutoLoop,
      // Slice Animation - 4D+
      setSliceAnimationEnabled,
      setSliceSpeed,
      setSliceAmplitude,
      // Phase Animation - Hydrogen ND only
      setPhaseAnimationEnabled,
      // Interference Fringing
      setInterferenceEnabled,
      setInterferenceAmp,
      setInterferenceFreq,
      setInterferenceSpeed,
      // Probability Current Flow
      setProbabilityFlowEnabled,
      setProbabilityFlowSpeed,
      setProbabilityFlowStrength,
      // Probability Current (j-field)
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
    } = useExtendedObjectStore(extendedObjectSelector)

    // Check quantum mode for UI visibility
    const objectType = useGeometryStore((state) => state.objectType)
    const isPauliSpinor = objectType === 'pauliSpinor'
    const isHydrogenNDMode = config.quantumMode === 'hydrogenND'
    const isFreeScalarField = config.quantumMode === 'freeScalarField'
    const isTdse = config.quantumMode === 'tdseDynamics'
    const isBec = config.quantumMode === 'becDynamics'
    const isDirac = config.quantumMode === 'diracEquation'
    // Compute modes (FSF/TDSE/BEC/Dirac/Pauli) use GPU density grids, not inline evalPsi().
    // Shader features that depend on inline wavefunction evaluation (interference,
    // probability flow, probability current) are forcibly disabled in extractSchrodingerConfig.
    const isComputeMode = isPauliSpinor || isFreeScalarField || isTdse || isBec || isDirac

    return (
      <AnimationDrawerContainer onClose={onClose} data-testid="schroedinger-animation-drawer">
        {/* Empty state for compute modes with no animation content */}
        {isComputeMode && !isTdse && (
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-text-tertiary italic">
              Animation effects are not available in this mode.
            </p>
            <p className="text-[10px] text-text-tertiary mt-1">
              These effects use inline wavefunction evaluation, which requires Harmonic Oscillator or Hydrogen mode.
            </p>
          </div>
        )}
        {/* Time Evolution — not applicable for free scalar field or TDSE (uses its own dt/stepsPerFrame) */}
        {!isFreeScalarField && !isTdse && !isBec && !isDirac && <div className="space-y-4" data-testid="animation-panel-timeEvolution">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              Time Evolution
            </label>
          </div>
          <div className="space-y-3">
            <Slider
              label="Time Scale"
              min={0.1}
              max={2.0}
              step={0.1}
              value={config.timeScale}
              onChange={setTimeScale}
              showValue
            />
          </div>
        </div>}

        {/* TDSE Auto-Loop — reinitialize wavefunction when norm decays */}
        {isTdse && <div className="space-y-4" data-testid="animation-panel-tdseAutoLoop">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              Auto-Loop
            </label>
            <ToggleButton
              pressed={config.tdse?.autoLoop ?? true}
              onToggle={() => setTdseAutoLoop(!(config.tdse?.autoLoop ?? true))}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle TDSE auto-loop"
            >
              {(config.tdse?.autoLoop ?? true) ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          <p className="text-xs text-text-tertiary">
            Automatically restarts the simulation when the wavefunction is mostly absorbed.
          </p>
        </div>}

        {/* Interference Fringing — not applicable for compute modes (requires inline wavefunction) */}
        {!isComputeMode && <div className="space-y-4" data-testid="animation-panel-interference">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              Interference Fringing
            </label>
            <ToggleButton
              pressed={config.interferenceEnabled}
              onToggle={() => setInterferenceEnabled(!config.interferenceEnabled)}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle interference fringing"
            >
              {config.interferenceEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          <div
            className={`space-y-3 ${!config.interferenceEnabled ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Slider
              label="Amplitude"
              min={0}
              max={1}
              step={0.05}
              value={config.interferenceAmp ?? 0.5}
              onChange={setInterferenceAmp}
              showValue
            />
            <Slider
              label="Frequency"
              min={1}
              max={50}
              step={1}
              value={config.interferenceFreq ?? 10.0}
              onChange={setInterferenceFreq}
              showValue
            />
            <Slider
              label="Speed"
              min={0}
              max={10}
              step={0.5}
              value={config.interferenceSpeed ?? 1.0}
              onChange={setInterferenceSpeed}
              showValue
            />
          </div>
        </div>}

        {/* Phase-coherent quantum texture — not applicable for compute modes */}
        {!isComputeMode && <div className="space-y-4" data-testid="animation-panel-probabilityFlow">
          <div className="flex items-center justify-between">
            <label
              className="text-xs font-bold text-text-secondary uppercase tracking-widest"
              title="Phase-coherent texture: noise patterns aligned with the wavefunction's phase structure. Highlights nodal surfaces for real eigenstates; flows with wavefronts for complex/superposition states."
            >
              Quantum Texture
            </label>
            <ToggleButton
              pressed={config.probabilityFlowEnabled}
              onToggle={() => setProbabilityFlowEnabled(!config.probabilityFlowEnabled)}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle probability current flow"
            >
              {config.probabilityFlowEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          <div
            className={`space-y-3 ${!config.probabilityFlowEnabled ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Slider
              label="Strength"
              min={0}
              max={1}
              step={0.05}
              value={config.probabilityFlowStrength ?? 0.3}
              onChange={setProbabilityFlowStrength}
              showValue
            />
            <Slider
              label="Speed"
              min={0.1}
              max={5}
              step={0.1}
              value={config.probabilityFlowSpeed ?? 1.0}
              onChange={setProbabilityFlowSpeed}
              showValue
            />
          </div>
        </div>}

        {/* Probability Current (j-field) — not applicable for compute modes (requires inline wavefunction) */}
        {!isComputeMode && <div className="space-y-4" data-testid="animation-panel-probabilityCurrent">
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
              options={PROBABILITY_CURRENT_STYLE_OPTIONS}
              value={config.probabilityCurrentStyle ?? 'magnitude'}
              onChange={setProbabilityCurrentStyle}
              data-testid="schroedinger-probability-current-style"
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                label="Placement"
                options={PROBABILITY_CURRENT_PLACEMENT_OPTIONS}
                value={config.probabilityCurrentPlacement ?? 'isosurface'}
                onChange={setProbabilityCurrentPlacement}
                data-testid="schroedinger-probability-current-placement"
              />
              <Select
                label="Color Mode"
                options={PROBABILITY_CURRENT_COLOR_MODE_OPTIONS}
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
              Flow is physically zero for many real stationary states. Use complex states (for
              example, Hydrogen with real orbitals OFF and m ≠ 0, or oscillator superpositions) to
              see circulation.
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
        </div>}

        {/* Slice Animation - 4D+ only */}
        {dimension >= 4 && (
          <div className="space-y-4" data-testid="animation-panel-sliceAnimation">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                Dimensional Sweeps
              </label>
              <ToggleButton
                pressed={config.sliceAnimationEnabled}
                onToggle={() => setSliceAnimationEnabled(!config.sliceAnimationEnabled)}
                className="text-xs px-2 py-1 h-auto"
                ariaLabel="Toggle slice animation"
              >
                {config.sliceAnimationEnabled ? 'ON' : 'OFF'}
              </ToggleButton>
            </div>

            <div
              className={`space-y-3 ${!config.sliceAnimationEnabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Slider
                label="Amplitude"
                min={0.1}
                max={1.0}
                step={0.05}
                value={config.sliceAmplitude}
                onChange={setSliceAmplitude}
                showValue
              />
              <Slider
                label="Speed"
                min={0.01}
                max={0.1}
                step={0.01}
                value={config.sliceSpeed}
                onChange={setSliceSpeed}
                showValue
              />
            </div>
          </div>
        )}

        {/* Quantum Phase Evolution - Hydrogen ND mode only */}
        {isHydrogenNDMode && (
          <div className="space-y-4" data-testid="animation-panel-phaseEvolution">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                Quantum Phase Evolution
              </label>
              <ToggleButton
                pressed={config.phaseAnimationEnabled}
                onToggle={() => setPhaseAnimationEnabled(!config.phaseAnimationEnabled)}
                className="text-xs px-2 py-1 h-auto"
                ariaLabel="Toggle phase animation"
              >
                {config.phaseAnimationEnabled ? 'ON' : 'OFF'}
              </ToggleButton>
            </div>
            <p className="text-xs text-text-tertiary">
              Animates phase coloring based on quantum energy eigenvalue. Speed controlled by Time
              Scale.
            </p>
          </div>
        )}

      </AnimationDrawerContainer>
    )
  }
)

SchroedingerAnimationDrawer.displayName = 'SchroedingerAnimationDrawer'

export default SchroedingerAnimationDrawer
