import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { HOEnergyDiagram } from '@/components/sections/Analysis/HOEnergyDiagram'
import { HydrogenEnergyDiagram } from '@/components/sections/Analysis/HydrogenEnergyDiagram'
import { SecondQuantizationSection } from '@/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection'
import type { SecondQuantizationActions } from '@/components/sections/Geometry/SchroedingerControls/types'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type {
  SchroedingerCrossSectionAxis,
  SchroedingerCrossSectionCompositeMode,
  SchroedingerCrossSectionPlaneMode,
  SchroedingerCrossSectionScalar,
} from '@/lib/geometry/extended/types'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'
import { type ExtendedObjectState, useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

const CROSS_SECTION_COMPOSITE_OPTIONS: {
  value: SchroedingerCrossSectionCompositeMode
  label: string
}[] = [
  { value: 'overlay', label: 'Overlay' },
  { value: 'sliceOnly', label: 'Slice Only' },
]

const CROSS_SECTION_SCALAR_OPTIONS: { value: SchroedingerCrossSectionScalar; label: string }[] = [
  { value: 'density', label: '|ψ|² Density' },
  { value: 'real', label: 'Re(ψ)' },
  { value: 'imag', label: 'Im(ψ)' },
]

const CROSS_SECTION_PLANE_MODE_OPTIONS: {
  value: SchroedingerCrossSectionPlaneMode
  label: string
}[] = [
  { value: 'axisAligned', label: 'Axis-Aligned' },
  { value: 'free', label: 'Free Plane' },
]

const CROSS_SECTION_AXIS_OPTIONS: { value: SchroedingerCrossSectionAxis; label: string }[] = [
  { value: 'x', label: 'YZ (X-Normal)' },
  { value: 'y', label: 'XZ (Y-Normal)' },
  { value: 'z', label: 'XY (Z-Normal)' },
]

/**
 * Analysis content for harmonicOscillator and hydrogenND modes.
 * Renders cross-section slice plane, radial probability, and second quantization controls.
 *
 * @returns Cross-section controls and related analysis features
 *
 * @example
 * ```tsx
 * <CrossSectionAnalysisContent />
 * ```
 */
export const CrossSectionAnalysisContent: React.FC = React.memo(() => {
  const dimension = useGeometryStore((state) => state.dimension)
  const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
    config: state.schroedinger,
    // Cross-section actions
    setCrossSectionEnabled: state.setSchroedingerCrossSectionEnabled,
    setCrossSectionCompositeMode: state.setSchroedingerCrossSectionCompositeMode,
    setCrossSectionScalar: state.setSchroedingerCrossSectionScalar,
    setCrossSectionPlaneMode: state.setSchroedingerCrossSectionPlaneMode,
    setCrossSectionAxis: state.setSchroedingerCrossSectionAxis,
    setCrossSectionPlaneNormal: state.setSchroedingerCrossSectionPlaneNormal,
    setCrossSectionPlaneOffset: state.setSchroedingerCrossSectionPlaneOffset,
    setCrossSectionOpacity: state.setSchroedingerCrossSectionOpacity,
    setCrossSectionThickness: state.setSchroedingerCrossSectionThickness,
    setCrossSectionPlaneColor: state.setSchroedingerCrossSectionPlaneColor,
    setCrossSectionAutoWindow: state.setSchroedingerCrossSectionAutoWindow,
    setCrossSectionWindowMin: state.setSchroedingerCrossSectionWindowMin,
    setCrossSectionWindowMax: state.setSchroedingerCrossSectionWindowMax,
    setRadialProbabilityEnabled: state.setSchroedingerRadialProbabilityEnabled,
    setRadialProbabilityOpacity: state.setSchroedingerRadialProbabilityOpacity,
    setRadialProbabilityColor: state.setSchroedingerRadialProbabilityColor,
    // Second quantization actions
    setSqLayerEnabled: state.setSchroedingerSqLayerEnabled,
    setSqLayerMode: state.setSchroedingerSqLayerMode,
    setSqLayerSelectedModeIndex: state.setSchroedingerSqLayerSelectedModeIndex,
    setSqLayerFockQuantumNumber: state.setSchroedingerSqLayerFockQuantumNumber,
    setSqLayerShowOccupation: state.setSchroedingerSqLayerShowOccupation,
    setSqLayerShowUncertainty: state.setSchroedingerSqLayerShowUncertainty,
    setSqLayerCoherentAlphaRe: state.setSchroedingerSqLayerCoherentAlphaRe,
    setSqLayerCoherentAlphaIm: state.setSchroedingerSqLayerCoherentAlphaIm,
    setSqLayerSqueezeR: state.setSchroedingerSqLayerSqueezeR,
    setSqLayerSqueezeTheta: state.setSchroedingerSqLayerSqueezeTheta,
  }))
  const {
    config,
    setCrossSectionEnabled,
    setCrossSectionCompositeMode,
    setCrossSectionScalar,
    setCrossSectionPlaneMode,
    setCrossSectionAxis,
    setCrossSectionPlaneNormal,
    setCrossSectionPlaneOffset,
    setCrossSectionOpacity,
    setCrossSectionThickness,
    setCrossSectionPlaneColor,
    setCrossSectionAutoWindow,
    setCrossSectionWindowMin,
    setCrossSectionWindowMax,
    setRadialProbabilityEnabled,
    setRadialProbabilityOpacity,
    setRadialProbabilityColor,
    // SQ actions
    setSqLayerEnabled,
    setSqLayerMode,
    setSqLayerSelectedModeIndex,
    setSqLayerFockQuantumNumber,
    setSqLayerShowOccupation,
    setSqLayerShowUncertainty,
    setSqLayerCoherentAlphaRe,
    setSqLayerCoherentAlphaIm,
    setSqLayerSqueezeR,
    setSqLayerSqueezeTheta,
  } = useExtendedObjectStore(extendedObjectSelector)

  const crossSectionNormal = config.crossSectionPlaneNormal ?? [0, 0, 1]

  const isHarmonicOscillatorMode = config.quantumMode === 'harmonicOscillator'

  const sqActions: SecondQuantizationActions = {
    setEnabled: setSqLayerEnabled,
    setMode: setSqLayerMode,
    setSelectedModeIndex: setSqLayerSelectedModeIndex,
    setFockQuantumNumber: setSqLayerFockQuantumNumber,
    setShowOccupation: setSqLayerShowOccupation,
    setShowUncertainty: setSqLayerShowUncertainty,
    setCoherentAlphaRe: setSqLayerCoherentAlphaRe,
    setCoherentAlphaIm: setSqLayerCoherentAlphaIm,
    setSqueezeR: setSqLayerSqueezeR,
    setSqueezeTheta: setSqLayerSqueezeTheta,
  }

  return (
    <>
      {/* Energy level + wavefunction diagrams */}
      {isHarmonicOscillatorMode && <HOEnergyDiagram />}
      {(config.quantumMode === 'hydrogenND' || config.quantumMode === 'hydrogenNDCoupled') && (
        <HydrogenEnergyDiagram />
      )}

      {/* Slice Plane */}
      <ControlGroup
        title="Slice Plane"
        collapsible
        defaultOpen
        data-testid="control-group-slice-plane"
        rightElement={
          <Switch
            checked={config.crossSectionEnabled ?? false}
            onCheckedChange={(checked) => setCrossSectionEnabled(checked)}
            tooltip="Show a 2D cross-section slice through the 3D wavefunction volume."
            data-testid="schroedinger-cross-section-toggle"
          />
        }
      >
        {config.crossSectionEnabled && (
          <div className="space-y-2">
            <Select
              label="Compositing"
              tooltip="How the slice plane combines with the 3D volume. Overlay blends the slice into the volume; Slice Only shows the plane alone."
              options={CROSS_SECTION_COMPOSITE_OPTIONS}
              value={config.crossSectionCompositeMode ?? 'overlay'}
              onChange={(value) =>
                setCrossSectionCompositeMode(value as SchroedingerCrossSectionCompositeMode)
              }
              data-testid="schroedinger-cross-section-composite-mode"
            />
            <Select
              label="Scalar"
              tooltip="Which quantity to color-map on the slice plane: probability density |psi|^2, real part Re(psi), or imaginary part Im(psi)."
              options={CROSS_SECTION_SCALAR_OPTIONS}
              value={config.crossSectionScalar ?? 'density'}
              onChange={(value) => setCrossSectionScalar(value as SchroedingerCrossSectionScalar)}
              data-testid="schroedinger-cross-section-scalar"
            />
            <Select
              label="Plane Mode"
              tooltip="Axis-Aligned restricts the slice to XY, XZ, or YZ planes. Free Plane allows arbitrary normal direction."
              options={CROSS_SECTION_PLANE_MODE_OPTIONS}
              value={config.crossSectionPlaneMode ?? 'axisAligned'}
              onChange={(value) =>
                setCrossSectionPlaneMode(value as SchroedingerCrossSectionPlaneMode)
              }
              data-testid="schroedinger-cross-section-plane-mode"
            />

            {(config.crossSectionPlaneMode ?? 'axisAligned') === 'axisAligned' ? (
              <Select
                label="Orientation"
                tooltip="Which plane to slice through: YZ (normal to X), XZ (normal to Y), or XY (normal to Z)."
                options={CROSS_SECTION_AXIS_OPTIONS}
                value={config.crossSectionAxis ?? 'z'}
                onChange={(value) => setCrossSectionAxis(value as SchroedingerCrossSectionAxis)}
                data-testid="schroedinger-cross-section-axis"
              />
            ) : (
              <>
                <Slider
                  label="Normal X"
                  tooltip="X component of the free-plane normal vector."
                  min={-1}
                  max={1}
                  step={0.01}
                  value={crossSectionNormal[0]}
                  onChange={(value) =>
                    setCrossSectionPlaneNormal([
                      value,
                      crossSectionNormal[1],
                      crossSectionNormal[2],
                    ])
                  }
                  showValue
                  data-testid="schroedinger-cross-section-normal-x"
                />
                <Slider
                  label="Normal Y"
                  tooltip="Y component of the free-plane normal vector."
                  min={-1}
                  max={1}
                  step={0.01}
                  value={crossSectionNormal[1]}
                  onChange={(value) =>
                    setCrossSectionPlaneNormal([
                      crossSectionNormal[0],
                      value,
                      crossSectionNormal[2],
                    ])
                  }
                  showValue
                  data-testid="schroedinger-cross-section-normal-y"
                />
                <Slider
                  label="Normal Z"
                  tooltip="Z component of the free-plane normal vector."
                  min={-1}
                  max={1}
                  step={0.01}
                  value={crossSectionNormal[2]}
                  onChange={(value) =>
                    setCrossSectionPlaneNormal([
                      crossSectionNormal[0],
                      crossSectionNormal[1],
                      value,
                    ])
                  }
                  showValue
                  data-testid="schroedinger-cross-section-normal-z"
                />
              </>
            )}

            <Slider
              label="Plane Offset"
              tooltip="Position of the slice plane along its normal direction. 0 is centered; positive moves forward."
              min={-1}
              max={1}
              step={0.01}
              value={config.crossSectionPlaneOffset ?? 0.0}
              onChange={setCrossSectionPlaneOffset}
              showValue
              data-testid="schroedinger-cross-section-offset"
            />
            <Slider
              label="Opacity"
              tooltip="Transparency of the cross-section plane. 0 = fully transparent, 1 = fully opaque."
              min={0}
              max={1}
              step={0.01}
              value={config.crossSectionOpacity ?? 0.75}
              onChange={setCrossSectionOpacity}
              showValue
              data-testid="schroedinger-cross-section-opacity"
            />
            <Slider
              label="Thickness"
              tooltip="Thickness of the slice slab in normalized coordinates. Thicker slabs average more of the wavefunction."
              min={0}
              max={0.2}
              step={0.005}
              value={config.crossSectionThickness ?? 0.02}
              onChange={setCrossSectionThickness}
              showValue
              data-testid="schroedinger-cross-section-thickness"
            />
            <div data-testid="schroedinger-cross-section-plane-color">
              <ColorPicker
                label="Plane Color"
                tooltip="Base color of the cross-section plane border and background tint."
                value={
                  config.crossSectionPlaneColor ??
                  DEFAULT_SCHROEDINGER_CONFIG.crossSectionPlaneColor
                }
                onChange={setCrossSectionPlaneColor}
                disableAlpha={true}
                className="w-full"
              />
            </div>

            <Switch
              label="Auto Window"
              tooltip="Automatically compute the color-mapping range from the wavefunction data. Disable for manual min/max control."
              checked={config.crossSectionAutoWindow ?? true}
              onCheckedChange={(checked) => setCrossSectionAutoWindow(checked)}
              data-testid="schroedinger-cross-section-auto-window-toggle"
            />

            {!config.crossSectionAutoWindow && (
              <>
                <Slider
                  label="Window Min"
                  tooltip="Lower bound of the color-mapping range for the slice scalar."
                  min={-5}
                  max={5}
                  step={0.01}
                  value={config.crossSectionWindowMin ?? 0}
                  onChange={setCrossSectionWindowMin}
                  showValue
                  data-testid="schroedinger-cross-section-window-min"
                />
                <Slider
                  label="Window Max"
                  tooltip="Upper bound of the color-mapping range for the slice scalar."
                  min={-5}
                  max={5}
                  step={0.01}
                  value={config.crossSectionWindowMax ?? 1}
                  onChange={setCrossSectionWindowMax}
                  showValue
                  data-testid="schroedinger-cross-section-window-max"
                />
              </>
            )}
            <p className="text-xs text-text-tertiary">
              Slice scalar colors use the active Faces color algorithm and palette settings.
            </p>
          </div>
        )}
      </ControlGroup>

      {/* Radial Probability (hydrogen ND and coupled hydrogen ND modes) */}
      {(config.quantumMode === 'hydrogenND' || config.quantumMode === 'hydrogenNDCoupled') && (
        <ControlGroup
          title="Radial Probability P(r)"
          collapsible
          defaultOpen={false}
          data-testid="control-group-radial-probability"
          rightElement={
            <Switch
              checked={config.radialProbabilityEnabled ?? false}
              onCheckedChange={(checked) => setRadialProbabilityEnabled(checked)}
              tooltip="Show the radial probability distribution P(r) as a spherical shell overlay."
              data-testid="schroedinger-radial-probability-toggle"
            />
          }
        >
          {config.radialProbabilityEnabled && (
            <div className="space-y-2">
              <Slider
                label="Opacity"
                tooltip="Transparency of the radial probability shell overlay. 0 = invisible, 1 = fully opaque."
                min={0}
                max={1}
                step={0.05}
                value={config.radialProbabilityOpacity ?? 0.6}
                onChange={setRadialProbabilityOpacity}
                showValue
                data-testid="schroedinger-radial-probability-opacity"
              />
              <div
                className="flex items-center justify-between"
                data-testid="schroedinger-radial-probability-color"
              >
                <label className="text-xs text-text-secondary">Shell Color</label>
                <ColorPicker
                  value={
                    config.radialProbabilityColor ??
                    DEFAULT_SCHROEDINGER_CONFIG.radialProbabilityColor
                  }
                  onChange={setRadialProbabilityColor}
                  tooltip="Color of the radial probability shell rendered at the most probable radius."
                  disableAlpha={true}
                  className="w-24"
                />
              </div>
            </div>
          )}
        </ControlGroup>
      )}

      {/* Second Quantization Educational Layer (HO modes only) */}
      {isHarmonicOscillatorMode && (
        <SecondQuantizationSection config={config} dimension={dimension} actions={sqActions} />
      )}
    </>
  )
})

CrossSectionAnalysisContent.displayName = 'CrossSectionAnalysisContent'
