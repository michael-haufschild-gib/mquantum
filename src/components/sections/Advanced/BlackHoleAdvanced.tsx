import { ColorPicker } from '@/components/ui/ColorPicker';
import { ControlGroup } from '@/components/ui/ControlGroup';
import { NumberInput } from '@/components/ui/NumberInput';
import { Select } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { ToggleButton } from '@/components/ui/ToggleButton';
import type { BlackHoleRayBendingMode } from '@/lib/geometry/extended/types';
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';

export const BlackHoleAdvanced: React.FC = React.memo(() => {
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.blackhole,
    // Visuals (gravity-related moved to global GravityAdvanced)
    setBloomBoost: state.setBlackHoleBloomBoost,
    setDiskTemperature: state.setBlackHoleDiskTemperature,
    setManifoldIntensity: state.setBlackHoleManifoldIntensity,
    // Lensing (non-gravity params only - gravity params in GravityAdvanced)
    setDimensionEmphasis: state.setBlackHoleDimensionEmphasis,
    setRayBendingMode: state.setBlackHoleRayBendingMode,
    setEpsilonMul: state.setBlackHoleEpsilonMul,
    // Manifold Visuals
    setNoiseScale: state.setBlackHoleNoiseScale,
    setNoiseAmount: state.setBlackHoleNoiseAmount,
    // Shell
    setPhotonShellWidth: state.setBlackHolePhotonShellWidth,
    setShellGlowStrength: state.setBlackHoleShellGlowStrength,
    setShellGlowColor: state.setBlackHoleShellGlowColor,
    // Doppler
    setDopplerEnabled: state.setBlackHoleDopplerEnabled,
    setDopplerStrength: state.setBlackHoleDopplerStrength,
    // Rendering
    setMaxSteps: state.setBlackHoleMaxSteps,
    setStepBase: state.setBlackHoleStepBase,
    setEnableAbsorption: state.setBlackHoleEnableAbsorption,
    setAbsorption: state.setBlackHoleAbsorption,
    // Motion blur
    setMotionBlurEnabled: state.setBlackHoleMotionBlurEnabled,
    setMotionBlurStrength: state.setBlackHoleMotionBlurStrength,
    // Polar Jets
    setJetsEnabled: state.setBlackHoleJetsEnabled,
    setJetsHeight: state.setBlackHoleJetsHeight,
    setJetsWidth: state.setBlackHoleJetsWidth,
    setJetsIntensity: state.setBlackHoleJetsIntensity,
    setJetsColor: state.setBlackHoleJetsColor,
    setJetsFalloff: state.setBlackHoleJetsFalloff,
    setJetsNoiseAmount: state.setBlackHoleJetsNoiseAmount,
    setJetsPulsation: state.setBlackHoleJetsPulsation,
    setJetsGodRaysEnabled: state.setBlackHoleJetsGodRaysEnabled,
    setJetsGodRaysIntensity: state.setBlackHoleJetsGodRaysIntensity,
    setJetsGodRaysSamples: state.setBlackHoleJetsGodRaysSamples,
    setJetsGodRaysDecay: state.setBlackHoleJetsGodRaysDecay,
  }));
  const {
    config,
    setBloomBoost,
    setDiskTemperature,
    setManifoldIntensity,
    setDimensionEmphasis,
    setRayBendingMode,
    setEpsilonMul,
    setNoiseScale,
    setNoiseAmount,
    setPhotonShellWidth,
    setShellGlowStrength,
    setShellGlowColor,
    setDopplerEnabled,
    setDopplerStrength,
    setMaxSteps,
    setStepBase,
    setEnableAbsorption,
    setAbsorption,
    setMotionBlurEnabled,
    setMotionBlurStrength,
    // Polar Jets
    setJetsEnabled,
    setJetsHeight,
    setJetsWidth,
    setJetsIntensity,
    setJetsColor,
    setJetsFalloff,
    setJetsNoiseAmount,
    setJetsPulsation,
    setJetsGodRaysEnabled,
    setJetsGodRaysIntensity,
    setJetsGodRaysSamples,
    setJetsGodRaysDecay,
  } = useExtendedObjectStore(extendedObjectSelector);

  return (
    <div className="space-y-4">
      {/* Accretion Disk */}
      <ControlGroup title="Accretion Disk" collapsible defaultOpen>
        <Slider
          label="Intensity"
          min={0}
          max={10.0}
          step={0.1}
          value={config.manifoldIntensity}
          onChange={setManifoldIntensity}
          showValue
        />
        <Slider
          label="Temperature (K)"
          min={1000}
          max={40000}
          step={100}
          value={config.diskTemperature}
          onChange={setDiskTemperature}
          showValue
        />
        <Slider
          label="Bloom Boost"
          min={0}
          max={5.0}
          step={0.1}
          value={config.bloomBoost}
          onChange={setBloomBoost}
          showValue
          data-testid="blackhole-bloom-boost"
        />

        {/* Turbulence */}
        <div className="space-y-2 mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary font-medium">Turbulence</label>
          <Slider
            label="Noise Amount"
            min={0}
            max={1}
            step={0.05}
            value={config.noiseAmount}
            onChange={setNoiseAmount}
            showValue
          />
          <Slider
            label="Noise Scale"
            min={0.1}
            max={5}
            step={0.1}
            value={config.noiseScale}
            onChange={setNoiseScale}
            showValue
          />
        </div>

        {/* Absorption */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary">Absorption</label>
          <ToggleButton
            pressed={config.enableAbsorption}
            onToggle={() => setEnableAbsorption(!config.enableAbsorption)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle absorption"
            data-testid="blackhole-absorption-toggle"
          >
            {config.enableAbsorption ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.enableAbsorption && (
          <Slider
            label="Absorption Strength"
            min={0}
            max={5}
            step={0.1}
            value={config.absorption}
            onChange={setAbsorption}
            showValue
            data-testid="blackhole-absorption"
          />
        )}

        {/* Motion Blur */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary">Motion Blur</label>
          <ToggleButton
            pressed={config.motionBlurEnabled}
            onToggle={() => setMotionBlurEnabled(!config.motionBlurEnabled)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle motion blur"
            data-testid="blackhole-motion-blur-toggle"
          >
            {config.motionBlurEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.motionBlurEnabled && (
          <Slider
            label="Blur Strength"
            min={0}
            max={2}
            step={0.1}
            value={config.motionBlurStrength}
            onChange={setMotionBlurStrength}
            showValue
            data-testid="blackhole-motion-blur-strength"
          />
        )}
      </ControlGroup>

      {/* Photon Shell */}
      <ControlGroup title="Photon Shell" collapsible defaultOpen>
        <Slider
          label="Width"
          min={0}
          max={0.3}
          step={0.01}
          value={config.photonShellWidth}
          onChange={setPhotonShellWidth}
          showValue
        />
        <Slider
          label="Glow Strength"
          min={0}
          max={10.0}
          step={0.5}
          value={config.shellGlowStrength}
          onChange={setShellGlowStrength}
          showValue
        />
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">Color</label>
          <ColorPicker
            value={config.shellGlowColor}
            onChange={setShellGlowColor}
            disableAlpha={true}
            className="w-24"
          />
        </div>
      </ControlGroup>

      {/* Relativistic Effects */}
      <ControlGroup title="Relativistic Effects" collapsible defaultOpen>
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">Doppler Effect</label>
          <ToggleButton
            pressed={config.dopplerEnabled}
            onToggle={() => setDopplerEnabled(!config.dopplerEnabled)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle doppler effect"
          >
            {config.dopplerEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.dopplerEnabled && (
          <Slider
            label="Doppler Strength"
            min={0}
            max={2.0}
            step={0.1}
            value={config.dopplerStrength}
            onChange={setDopplerStrength}
            showValue
          />
        )}
      </ControlGroup>

      {/* Polar Jets */}
      <ControlGroup title="Polar Jets" collapsible defaultOpen>
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">Enable Jets</label>
          <ToggleButton
            pressed={config.jetsEnabled}
            onToggle={() => setJetsEnabled(!config.jetsEnabled)}
            className="text-xs px-2 py-1 h-auto"
            ariaLabel="Toggle polar jets"
            data-testid="blackhole-jets-toggle"
          >
            {config.jetsEnabled ? 'ON' : 'OFF'}
          </ToggleButton>
        </div>
        {config.jetsEnabled && (
          <>
            <Slider
              label="Height"
              min={10}
              max={50}
              step={1}
              value={config.jetsHeight}
              onChange={setJetsHeight}
              showValue
              data-testid="blackhole-jets-height"
            />
            <Slider
              label="Width"
              min={0.1}
              max={0.5}
              step={0.01}
              value={config.jetsWidth}
              onChange={setJetsWidth}
              showValue
              data-testid="blackhole-jets-width"
            />
            <Slider
              label="Intensity"
              min={0}
              max={10}
              step={0.1}
              value={config.jetsIntensity}
              onChange={setJetsIntensity}
              showValue
              data-testid="blackhole-jets-intensity"
            />
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-secondary">Color</label>
              <ColorPicker
                value={config.jetsColor}
                onChange={setJetsColor}
                disableAlpha={true}
                className="w-24"
                data-testid="blackhole-jets-color"
              />
            </div>
            <Slider
              label="Falloff"
              min={1}
              max={5}
              step={0.1}
              value={config.jetsFalloff}
              onChange={setJetsFalloff}
              showValue
              data-testid="blackhole-jets-falloff"
            />

            {/* Turbulence */}
            <div className="space-y-2 mt-3 pt-3 border-t border-border-subtle">
              <label className="text-xs text-text-secondary font-medium">Turbulence</label>
              <Slider
                label="Noise Amount"
                min={0}
                max={1}
                step={0.05}
                value={config.jetsNoiseAmount}
                onChange={setJetsNoiseAmount}
                showValue
                data-testid="blackhole-jets-noise"
              />
              <Slider
                label="Pulsation"
                min={0}
                max={2}
                step={0.1}
                value={config.jetsPulsation}
                onChange={setJetsPulsation}
                showValue
                data-testid="blackhole-jets-pulsation"
              />
            </div>

            {/* God Rays */}
            <div className="space-y-2 mt-3 pt-3 border-t border-border-subtle">
              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary font-medium">God Rays</label>
                <ToggleButton
                  pressed={config.jetsGodRaysEnabled}
                  onToggle={() => setJetsGodRaysEnabled(!config.jetsGodRaysEnabled)}
                  className="text-xs px-2 py-1 h-auto"
                  ariaLabel="Toggle god rays"
                  data-testid="blackhole-jets-godrays-toggle"
                >
                  {config.jetsGodRaysEnabled ? 'ON' : 'OFF'}
                </ToggleButton>
              </div>
              {config.jetsGodRaysEnabled && (
                <>
                  <Slider
                    label="Intensity"
                    min={0}
                    max={2}
                    step={0.05}
                    value={config.jetsGodRaysIntensity}
                    onChange={setJetsGodRaysIntensity}
                    showValue
                    data-testid="blackhole-jets-godrays-intensity"
                  />
                  <Slider
                    label="Samples"
                    min={16}
                    max={128}
                    step={8}
                    value={config.jetsGodRaysSamples}
                    onChange={setJetsGodRaysSamples}
                    showValue
                    data-testid="blackhole-jets-godrays-samples"
                  />
                  <Slider
                    label="Decay"
                    min={0.9}
                    max={1.0}
                    step={0.01}
                    value={config.jetsGodRaysDecay}
                    onChange={setJetsGodRaysDecay}
                    showValue
                    data-testid="blackhole-jets-godrays-decay"
                  />
                </>
              )}
            </div>
          </>
        )}
      </ControlGroup>

      {/* Rendering */}
      <ControlGroup title="Rendering" collapsible defaultOpen>
        <Slider
          label="Max Steps"
          min={128}
          max={768}
          step={64}
          value={config.maxSteps}
          onChange={setMaxSteps}
          showValue
          data-testid="blackhole-max-steps"
        />
        <Slider
          label="Step Size"
          min={0.02}
          max={0.15}
          step={0.01}
          value={config.stepBase}
          onChange={setStepBase}
          showValue
          data-testid="blackhole-step-size"
        />
        <p className="text-xs text-text-tertiary">
          Lower step size = higher quality, slower. Higher max steps = more detail.
        </p>

        {/* Advanced Lensing */}
        <div className="space-y-2 mt-3 pt-3 border-t border-border-subtle">
          <label className="text-xs text-text-secondary font-medium">Advanced Lensing</label>
          <Slider
            label="Dim. Emphasis"
            min={0}
            max={2}
            step={0.1}
            value={config.dimensionEmphasis}
            onChange={setDimensionEmphasis}
            showValue
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <Select
                label="Mode"
                options={[
                  { value: 'spiral', label: 'Spiral' },
                  { value: 'orbital', label: 'Orbital' },
                ]}
                value={config.rayBendingMode}
                onChange={(v) => setRayBendingMode(v as BlackHoleRayBendingMode)}
              />
            </div>
            <div className="flex-1">
              <NumberInput
                label="Stability"
                value={config.epsilonMul}
                onChange={setEpsilonMul}
                min={0.0001}
                max={0.5}
                step={0.001}
                precision={4}
              />
            </div>
          </div>
        </div>
      </ControlGroup>

      {/* NOTE: Deferred Lensing / Gravity controls moved to global GravityAdvanced section */}
    </div>
  );
});

BlackHoleAdvanced.displayName = 'BlackHoleAdvanced';
