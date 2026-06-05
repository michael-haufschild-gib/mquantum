import React from 'react'

import { SchroedingerEntropicTimeShearControls } from '@/components/sections/Analysis/SchroedingerEntropicTimeShearControls'
import { SchroedingerSpectralDimensionFlowControls } from '@/components/sections/Analysis/SchroedingerSpectralDimensionFlowControls'
import { SchroedingerVacuumBubbleLensControls } from '@/components/sections/Analysis/SchroedingerVacuumBubbleLensControls'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { DEFAULT_SCHROEDINGER_CONFIG, type SchroedingerConfig } from '@/lib/geometry/extended/types'

interface SchroedingerSpacetimeLensControlsProps {
  config: SchroedingerConfig
  isComputeMode: boolean
  setQuantumBackreactionLensingEnabled: (enabled: boolean) => void
  setQuantumBackreactionLensingStrength: (strength: number) => void
  setQuantumBackreactionCausticGain: (gain: number) => void
  setQuantumBackreactionSoftening: (softening: number) => void
  setBilocalERBridgeEnabled: (enabled: boolean) => void
  setBilocalERBridgeStrength: (strength: number) => void
  setBilocalERBridgeThroatRadius: (radius: number) => void
  setBilocalERBridgePhaseLock: (phaseLock: number) => void
  setEntropicTimeShearEnabled: (enabled: boolean) => void
  setEntropicTimeShearStrength: (strength: number) => void
  setEntropicTimeShearFilamentScale: (scale: number) => void
  setEntropicTimeShearIrreversibility: (irreversibility: number) => void
  setSpectralDimensionFlowEnabled: (enabled: boolean) => void
  setSpectralDimensionFlowStrength: (strength: number) => void
  setSpectralDimensionFlowUvDimension: (dimension: number) => void
  setSpectralDimensionFlowDiffusionScale: (scale: number) => void
  setBornNullWeaveEnabled: (enabled: boolean) => void
  setBornNullWeaveStrength: (strength: number) => void
  setBornNullWeaveNodeWidth: (width: number) => void
  setBornNullWeaveCirculation: (circulation: number) => void
  setPhaseMaterialityEnabled: (enabled: boolean) => void
  setPhaseMaterialityStrength: (strength: number) => void
}

export const SchroedingerSpacetimeLensControls: React.FC<SchroedingerSpacetimeLensControlsProps> =
  React.memo(
    ({
      config,
      isComputeMode,
      setQuantumBackreactionLensingEnabled,
      setQuantumBackreactionLensingStrength,
      setQuantumBackreactionCausticGain,
      setQuantumBackreactionSoftening,
      setBilocalERBridgeEnabled,
      setBilocalERBridgeStrength,
      setBilocalERBridgeThroatRadius,
      setBilocalERBridgePhaseLock,
      setEntropicTimeShearEnabled,
      setEntropicTimeShearStrength,
      setEntropicTimeShearFilamentScale,
      setEntropicTimeShearIrreversibility,
      setSpectralDimensionFlowEnabled,
      setSpectralDimensionFlowStrength,
      setSpectralDimensionFlowUvDimension,
      setSpectralDimensionFlowDiffusionScale,
      setBornNullWeaveEnabled,
      setBornNullWeaveStrength,
      setBornNullWeaveNodeWidth,
      setBornNullWeaveCirculation,
      setPhaseMaterialityEnabled,
      setPhaseMaterialityStrength,
    }) => (
      <>
        <div className="space-y-1 mt-2">
          <Switch
            label="Quantum Backreaction Lensing"
            tooltip="Bend raymarch sampling through a density-derived optical metric so coherent lobes lens nearby structure."
            checked={config.quantumBackreactionLensingEnabled ?? false}
            onCheckedChange={setQuantumBackreactionLensingEnabled}
            data-testid="schroedinger-quantum-backreaction-toggle"
          />
          {config.quantumBackreactionLensingEnabled && (
            <div className="ps-2 border-s border-border-default space-y-2">
              <Slider
                label="Strength"
                tooltip="How strongly probability density perturbs the sampling metric."
                min={0}
                max={3}
                step={0.05}
                value={
                  config.quantumBackreactionLensingStrength ??
                  DEFAULT_SCHROEDINGER_CONFIG.quantumBackreactionLensingStrength
                }
                onChange={setQuantumBackreactionLensingStrength}
                showValue
                data-testid="schroedinger-quantum-backreaction-strength"
              />
              <Slider
                label="Caustic Gain"
                tooltip="Emission lift from lens focusing after sample coordinates have been deformed."
                min={0}
                max={2}
                step={0.05}
                value={
                  config.quantumBackreactionCausticGain ??
                  DEFAULT_SCHROEDINGER_CONFIG.quantumBackreactionCausticGain
                }
                onChange={setQuantumBackreactionCausticGain}
                showValue
                data-testid="schroedinger-quantum-backreaction-caustic-gain"
              />
              <Slider
                label="Softening"
                tooltip="Radius that prevents singular metric spikes while setting the lensing range."
                min={0.05}
                max={2}
                step={0.05}
                value={
                  config.quantumBackreactionSoftening ??
                  DEFAULT_SCHROEDINGER_CONFIG.quantumBackreactionSoftening
                }
                onChange={setQuantumBackreactionSoftening}
                showValue
                data-testid="schroedinger-quantum-backreaction-softening"
              />
            </div>
          )}
        </div>

        <div className="space-y-1 mt-2">
          <Switch
            label="Bilocal ER Bridge"
            tooltip="Warp raymarch sampling toward a mirrored nonlocal throat when local and remote wavefunction phases lock."
            checked={config.bilocalERBridgeEnabled ?? false}
            onCheckedChange={setBilocalERBridgeEnabled}
            data-testid="schroedinger-bilocal-er-bridge-toggle"
          />
          {config.bilocalERBridgeEnabled && (
            <div className="ps-2 border-s border-border-default space-y-2">
              <Slider
                label="Strength"
                tooltip="How strongly coherent mirrored endpoints bend sample coordinates through the bridge."
                min={0}
                max={2}
                step={0.05}
                value={
                  config.bilocalERBridgeStrength ??
                  DEFAULT_SCHROEDINGER_CONFIG.bilocalERBridgeStrength
                }
                onChange={setBilocalERBridgeStrength}
                showValue
                data-testid="schroedinger-bilocal-er-bridge-strength"
              />
              <Slider
                label="Throat Radius"
                tooltip="Softened radius of the transverse bridge throat around the mirror plane."
                min={0.05}
                max={2}
                step={0.05}
                value={
                  config.bilocalERBridgeThroatRadius ??
                  DEFAULT_SCHROEDINGER_CONFIG.bilocalERBridgeThroatRadius
                }
                onChange={setBilocalERBridgeThroatRadius}
                showValue
                data-testid="schroedinger-bilocal-er-bridge-throat-radius"
              />
              <Slider
                label="Phase Lock"
                tooltip="How strongly the bridge requires phase agreement between local and mirrored endpoints."
                min={0}
                max={1}
                step={0.05}
                value={
                  config.bilocalERBridgePhaseLock ??
                  DEFAULT_SCHROEDINGER_CONFIG.bilocalERBridgePhaseLock
                }
                onChange={setBilocalERBridgePhaseLock}
                showValue
                data-testid="schroedinger-bilocal-er-bridge-phase-lock"
              />
            </div>
          )}
        </div>

        <SchroedingerEntropicTimeShearControls
          config={config}
          setEnabled={setEntropicTimeShearEnabled}
          setStrength={setEntropicTimeShearStrength}
          setFilamentScale={setEntropicTimeShearFilamentScale}
          setIrreversibility={setEntropicTimeShearIrreversibility}
        />

        <SchroedingerSpectralDimensionFlowControls
          config={config}
          setEnabled={setSpectralDimensionFlowEnabled}
          setStrength={setSpectralDimensionFlowStrength}
          setUvDimension={setSpectralDimensionFlowUvDimension}
          setDiffusionScale={setSpectralDimensionFlowDiffusionScale}
        />

        <SchroedingerVacuumBubbleLensControls config={config} />

        {!isComputeMode && (
          <>
            <div className="space-y-1 mt-2">
              <Switch
                label="Born-Null Weave"
                tooltip="Turn low-density, high-current wavefunction nodes into braided null membranes that deform raymarch sampling and open emission apertures."
                checked={config.bornNullWeaveEnabled ?? false}
                onCheckedChange={setBornNullWeaveEnabled}
                data-testid="schroedinger-born-null-weave-toggle"
              />
              {config.bornNullWeaveEnabled && (
                <div className="ps-2 border-s border-border-default space-y-2">
                  <Slider
                    label="Strength"
                    tooltip="How strongly nodal apertures deform sample coordinates and lift emission."
                    min={0}
                    max={2}
                    step={0.05}
                    value={
                      config.bornNullWeaveStrength ??
                      DEFAULT_SCHROEDINGER_CONFIG.bornNullWeaveStrength
                    }
                    onChange={setBornNullWeaveStrength}
                    showValue
                    data-testid="schroedinger-born-null-weave-strength"
                  />
                  <Slider
                    label="Node Width"
                    tooltip="Born-density aperture width as a fraction of peak density."
                    min={0.0001}
                    max={0.2}
                    step={0.001}
                    value={
                      config.bornNullWeaveNodeWidth ??
                      DEFAULT_SCHROEDINGER_CONFIG.bornNullWeaveNodeWidth
                    }
                    onChange={setBornNullWeaveNodeWidth}
                    showValue
                    formatValue={(value) => value.toFixed(4)}
                    data-testid="schroedinger-born-null-weave-node-width"
                  />
                  <Slider
                    label="Circulation"
                    tooltip="Sensitivity to probability current divided by local Born density."
                    min={0}
                    max={8}
                    step={0.1}
                    value={
                      config.bornNullWeaveCirculation ??
                      DEFAULT_SCHROEDINGER_CONFIG.bornNullWeaveCirculation
                    }
                    onChange={setBornNullWeaveCirculation}
                    showValue
                    data-testid="schroedinger-born-null-weave-circulation"
                  />
                </div>
              )}
            </div>

            <div className="space-y-1 mt-2">
              <Switch
                label="Phase Materiality"
                tooltip="Modulate material properties (roughness, metalness) based on the complex phase of the wavefunction, making phase visible through surface appearance."
                checked={config.phaseMaterialityEnabled ?? false}
                onCheckedChange={setPhaseMaterialityEnabled}
                data-testid="schroedinger-phase-materiality-toggle"
              />
              {config.phaseMaterialityEnabled && (
                <Slider
                  label="Strength"
                  tooltip="How strongly the wavefunction phase modulates the surface material properties."
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.phaseMaterialityStrength ?? 1.0}
                  onChange={setPhaseMaterialityStrength}
                  showValue
                  data-testid="schroedinger-phase-materiality-strength"
                />
              )}
            </div>
          </>
        )}
      </>
    )
  )

SchroedingerSpacetimeLensControls.displayName = 'SchroedingerSpacetimeLensControls'
