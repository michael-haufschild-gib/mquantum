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
 * - Animated Flow: Curl noise turbulence (both modes)
 * - Wavepacket Dispersion: Animates frequency spread
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
import { AnimationDrawerContainer } from './AnimationDrawerContainer'

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
      // Animated Flow
      setCurlEnabled: state.setSchroedingerCurlEnabled,
      setCurlStrength: state.setSchroedingerCurlStrength,
      setCurlScale: state.setSchroedingerCurlScale,
      setCurlSpeed: state.setSchroedingerCurlSpeed,
      // Spread Animation
      setSpreadAnimationEnabled: state.setSchroedingerSpreadAnimationEnabled,
      setSpreadAnimationSpeed: state.setSchroedingerSpreadAnimationSpeed,
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
    }))

    const {
      config,
      // Time Evolution
      setTimeScale,
      // Animated Flow (Curl)
      setCurlEnabled,
      setCurlStrength,
      setCurlScale,
      setCurlSpeed,
      // Spread Animation (Dispersion)
      setSpreadAnimationEnabled,
      setSpreadAnimationSpeed,
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
    } = useExtendedObjectStore(extendedObjectSelector)

    // Check quantum mode for UI visibility
    const isHydrogenNDMode = config.quantumMode === 'hydrogenND'

    return (
      <AnimationDrawerContainer onClose={onClose} data-testid="schroedinger-animation-drawer">
        {/* Time Evolution (Always Active) */}
        <div className="space-y-4" data-testid="animation-panel-timeEvolution">
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
        </div>

        {/* Wavepacket Dispersion (Spread Animation) */}
        <div className="space-y-4" data-testid="animation-panel-dispersion">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              Wavepacket Dispersion
            </label>
            <ToggleButton
              pressed={config.spreadAnimationEnabled}
              onToggle={() => setSpreadAnimationEnabled(!config.spreadAnimationEnabled)}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle spread animation"
            >
              {config.spreadAnimationEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          <div
            className={`space-y-3 ${!config.spreadAnimationEnabled ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Slider
              label="Breathing Speed"
              min={0.1}
              max={2.0}
              step={0.1}
              value={config.spreadAnimationSpeed ?? 0.5}
              onChange={setSpreadAnimationSpeed}
              showValue
            />
          </div>
        </div>

        {/* Animated Flow (Curl Noise) */}
        <div className="space-y-4" data-testid="animation-panel-flow">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-text-secondary uppercase tracking-widest">
              Animated Flow
            </label>
            <ToggleButton
              pressed={config.curlEnabled}
              onToggle={() => setCurlEnabled(!config.curlEnabled)}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle flow animation"
            >
              {config.curlEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>
          <div
            className={`space-y-3 ${!config.curlEnabled ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Slider
              label="Strength"
              min={0.0}
              max={1.0}
              step={0.05}
              value={config.curlStrength}
              onChange={setCurlStrength}
              showValue
            />
            <Slider
              label="Scale"
              min={0.25}
              max={4.0}
              step={0.25}
              value={config.curlScale}
              onChange={setCurlScale}
              showValue
            />
            <Slider
              label="Speed"
              min={0.1}
              max={5.0}
              step={0.1}
              value={config.curlSpeed}
              onChange={setCurlSpeed}
              showValue
            />
          </div>
        </div>

        {/* Interference Fringing */}
        <div className="space-y-4" data-testid="animation-panel-interference">
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
        </div>

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
