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
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Slider } from '@/components/ui/Slider'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { isComputeQuantumType } from '@/lib/geometry/registry'
import { type ExtendedObjectState, useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

import { AnimationDrawerContainer } from './AnimationDrawerContainer'
import { ProbabilityCurrentPanel } from './ProbabilityCurrentPanel'

/** Props for the Schroedinger animation configuration drawer. */
export interface SchroedingerAnimationDrawerProps {
  /** Callback to close the drawer */
  onClose?: () => void
}

/**
 * SchroedingerAnimationDrawer component
 *
 * Renders animation controls for Schroedinger quantum modes within
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
      setPhaseShimmerEnabled: state.setSchroedingerPhaseShimmerEnabled,
      setPhaseShimmerSpeed: state.setSchroedingerPhaseShimmerSpeed,
      setPhaseShimmerStrength: state.setSchroedingerPhaseShimmerStrength,
      // Probability Current (j-field)
      setProbabilityCurrentEnabled: state.setSchroedingerProbabilityCurrentEnabled,
      setProbabilityCurrentStyle: state.setSchroedingerProbabilityCurrentStyle,
      setProbabilityCurrentPlacement: state.setSchroedingerProbabilityCurrentPlacement,
      setProbabilityCurrentColorMode: state.setSchroedingerProbabilityCurrentColorMode,
      setProbabilityCurrentScale: state.setSchroedingerProbabilityCurrentScale,
      setProbabilityCurrentSpeed: state.setSchroedingerProbabilityCurrentSpeed,
      setProbabilityCurrentDensityThreshold:
        state.setSchroedingerProbabilityCurrentDensityThreshold,
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
      setPhaseShimmerEnabled,
      setPhaseShimmerSpeed,
      setPhaseShimmerStrength,
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
    const isHydrogenNDMode =
      config.quantumMode === 'hydrogenND' || config.quantumMode === 'hydrogenNDCoupled'
    const isTdse = config.quantumMode === 'tdseDynamics'
    // Compute modes (FSF/TDSE/BEC/Dirac/QW/Pauli) use GPU density grids, not inline evalPsi().
    // Shader features that depend on inline wavefunction evaluation (interference,
    // probability flow, probability current) are forcibly disabled in extractSchrodingerConfig.
    const isComputeMode = isPauliSpinor || isComputeQuantumType(config.quantumMode)

    return (
      <AnimationDrawerContainer onClose={onClose} data-testid="schroedinger-animation-drawer">
        {/* Empty state for compute modes with no animation content */}
        {isComputeMode && !isTdse && (
          <div className="break-inside-avoid mb-6 last:mb-0 px-4 py-6 text-center">
            <p className="text-xs text-text-tertiary italic">
              Animation effects are not available in this mode.
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              These effects use inline wavefunction evaluation, which requires Harmonic Oscillator
              or Hydrogen mode.
            </p>
          </div>
        )}

        {/* Probability Current (j-field) — not applicable for compute modes (requires inline wavefunction) */}
        {!isComputeMode && (
          <div className="break-inside-avoid mb-6 last:mb-0">
            <ProbabilityCurrentPanel
              config={config}
              setProbabilityCurrentEnabled={setProbabilityCurrentEnabled}
              setProbabilityCurrentStyle={setProbabilityCurrentStyle}
              setProbabilityCurrentPlacement={setProbabilityCurrentPlacement}
              setProbabilityCurrentColorMode={setProbabilityCurrentColorMode}
              setProbabilityCurrentScale={setProbabilityCurrentScale}
              setProbabilityCurrentSpeed={setProbabilityCurrentSpeed}
              setProbabilityCurrentDensityThreshold={setProbabilityCurrentDensityThreshold}
              setProbabilityCurrentMagnitudeThreshold={setProbabilityCurrentMagnitudeThreshold}
              setProbabilityCurrentLineDensity={setProbabilityCurrentLineDensity}
              setProbabilityCurrentStepSize={setProbabilityCurrentStepSize}
              setProbabilityCurrentSteps={setProbabilityCurrentSteps}
              setProbabilityCurrentOpacity={setProbabilityCurrentOpacity}
            />
          </div>
        )}

        {/* Time Evolution — not applicable for compute modes (each uses its own dt/stepsPerFrame) */}
        {!isComputeMode && (
          <div
            className="break-inside-avoid mb-6 last:mb-0 space-y-4"
            data-testid="animation-panel-timeEvolution"
          >
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
                tooltip="Scales the dt fed to the Schrödinger phase integrator each frame. At 1× the wavefunction evolves at natural units; increasing it compresses time so phase winding and beating in superpositions becomes faster and more visible."
                value={config.timeScale}
                onChange={setTimeScale}
                showValue
              />
            </div>
          </div>
        )}

        {/* TDSE Auto-Loop — reinitialize wavefunction when norm decays */}
        {isTdse && (
          <div
            className="break-inside-avoid mb-6 last:mb-0 space-y-4"
            data-testid="animation-panel-tdseAutoLoop"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                Auto-Loop
              </label>
              <ToggleButton
                pressed={config.tdse?.autoLoop ?? false}
                onToggle={() => setTdseAutoLoop(!(config.tdse?.autoLoop ?? false))}
                className="text-xs px-2 py-1 h-auto"
                tooltip="When absorbing boundary conditions have drained most of the norm, the wave packet is re-initialized automatically. Disable to let the simulation run past full absorption into the flat steady state."
                ariaLabel="Toggle TDSE auto-loop"
              >
                {(config.tdse?.autoLoop ?? false) ? 'ON' : 'OFF'}
              </ToggleButton>
            </div>
            <p className="text-xs text-text-tertiary">
              Automatically restarts the simulation when the wavefunction is mostly absorbed.
            </p>
          </div>
        )}

        {/* Interference Fringing — not applicable for compute modes (requires inline wavefunction) */}
        {!isComputeMode && (
          <div
            className="break-inside-avoid mb-6 last:mb-0 space-y-4"
            data-testid="animation-panel-interference"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                Interference Fringing
              </label>
              <ToggleButton
                pressed={config.interferenceEnabled}
                onToggle={() => setInterferenceEnabled(!config.interferenceEnabled)}
                className="text-xs px-2 py-1 h-auto"
                tooltip="Modulates the rendered density with a sinusoidal term derived from the wavefunction's local phase. Makes constructive and destructive interference bands visible in superposition states as bright and dark fringes."
                ariaLabel="Toggle interference fringing"
              >
                {config.interferenceEnabled ? 'ON' : 'OFF'}
              </ToggleButton>
            </div>
            <div
              role="group"
              aria-label="Interference parameters"
              aria-disabled={!config.interferenceEnabled}
              className={`space-y-3 ${!config.interferenceEnabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Slider
                label="Amplitude"
                min={0}
                max={1}
                step={0.05}
                tooltip="How strongly the fringe modulation is mixed into the density. At 0 the effect is invisible; at 1 the fringes dominate, fully overriding the base density in dark bands."
                value={config.interferenceAmp ?? 0.5}
                onChange={setInterferenceAmp}
                showValue
              />
              <Slider
                label="Frequency"
                min={1}
                max={50}
                step={1}
                tooltip="Spatial frequency of the fringe pattern in phase-space units. Low values produce wide, sweeping interference bands; high values create fine, tightly-packed fringes."
                value={config.interferenceFreq ?? 10.0}
                onChange={setInterferenceFreq}
                showValue
              />
              <Slider
                label="Speed"
                min={0}
                max={10}
                step={0.5}
                tooltip="Rate at which the fringe pattern sweeps through phase. Low values give a slow, breathing oscillation; high values produce rapid flickering that tracks fast phase winding."
                value={config.interferenceSpeed ?? 1.0}
                onChange={setInterferenceSpeed}
                showValue
              />
            </div>
          </div>
        )}

        {/* Phase Shimmer — visual-only noise effect, not applicable for compute modes */}
        {!isComputeMode && (
          <div
            className="break-inside-avoid mb-6 last:mb-0 space-y-4"
            data-testid="animation-panel-phaseShimmer"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                Phase Shimmer
              </label>
              <ToggleButton
                pressed={config.phaseShimmerEnabled}
                onToggle={() => setPhaseShimmerEnabled(!config.phaseShimmerEnabled)}
                className="text-xs px-2 py-1 h-auto"
                tooltip="Visual effect — not a physical measurement. Multiplies the density by animated gradient noise whose spatial pattern is biased by the local wavefunction phase angle (cos φ, sin φ). The shimmer moves fastest in low-density regions and stalls at probability peaks, giving a phase-textured glow to the empty space between density lobes."
                ariaLabel="Toggle phase shimmer"
              >
                {config.phaseShimmerEnabled ? 'ON' : 'OFF'}
              </ToggleButton>
            </div>
            <div
              role="group"
              aria-label="Phase shimmer parameters"
              aria-disabled={!config.phaseShimmerEnabled}
              className={`space-y-3 ${!config.phaseShimmerEnabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Slider
                label="Strength"
                min={0}
                max={1}
                step={0.05}
                tooltip="How strongly the noise modulates the density. Low values add a subtle shimmer in interstitial regions; high values make the noise dominate, visibly eating into the density field."
                value={config.phaseShimmerStrength ?? 0.3}
                onChange={setPhaseShimmerStrength}
                showValue
              />
              <Slider
                label="Speed"
                min={0.1}
                max={5}
                step={0.1}
                tooltip="Rate at which the noise pattern drifts over time. The effect is most visible in low-density regions; high-density peaks are always near-static regardless of this value."
                value={config.phaseShimmerSpeed ?? 1.0}
                onChange={setPhaseShimmerSpeed}
                showValue
              />
            </div>
          </div>
        )}

        {/* Slice Animation - 4D+ only */}
        {dimension >= 4 && (
          <div
            className="break-inside-avoid mb-6 last:mb-0 space-y-4"
            data-testid="animation-panel-sliceAnimation"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                Dimensional Sweeps
              </label>
              <ToggleButton
                pressed={config.sliceAnimationEnabled}
                onToggle={() => setSliceAnimationEnabled(!config.sliceAnimationEnabled)}
                className="text-xs px-2 py-1 h-auto"
                tooltip="Continuously oscillates the 4D slice position so the rendered 3D cross-section sweeps through different hyperplanar cuts of the N-dimensional wavefunction over time."
                ariaLabel="Toggle dimensional sweeps"
              >
                {config.sliceAnimationEnabled ? 'ON' : 'OFF'}
              </ToggleButton>
            </div>

            <div
              role="group"
              aria-label="Slice animation parameters"
              aria-disabled={!config.sliceAnimationEnabled}
              className={`space-y-3 ${!config.sliceAnimationEnabled ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Slider
                label="Amplitude"
                min={0.1}
                max={1.0}
                step={0.05}
                tooltip="How far the 4D slice position oscillates from the origin (in wavefunction units). Large values sweep into the outer regions of the hypervolume, revealing more exotic cross-sections; small values stay near the central slice."
                value={config.sliceAmplitude}
                onChange={setSliceAmplitude}
                showValue
              />
              <Slider
                label="Speed"
                min={0.01}
                max={0.1}
                step={0.01}
                tooltip="Oscillation rate of the slice position. Slow values give a leisurely drift through dimensional layers; fast values cycle rapidly through the full amplitude, blurring distinctions between cross-sections."
                value={config.sliceSpeed}
                onChange={setSliceSpeed}
                showValue
              />
            </div>
          </div>
        )}

        {/* Quantum Phase Evolution - Hydrogen ND mode only */}
        {isHydrogenNDMode && (
          <div
            className="break-inside-avoid mb-6 last:mb-0 space-y-4"
            data-testid="animation-panel-phaseEvolution"
          >
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
                Quantum Phase Evolution
              </label>
              <ToggleButton
                pressed={config.phaseAnimationEnabled}
                onToggle={() => setPhaseAnimationEnabled(!config.phaseAnimationEnabled)}
                className="text-xs px-2 py-1 h-auto"
                tooltip="Continuously winds the hue coloring at a rate proportional to the energy eigenvalue — the visual equivalent of watching ψ(x) e^{−iEt/ℏ} rotate in the complex plane. Speed is set by Time Scale."
                ariaLabel="Toggle phase evolution animation"
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
