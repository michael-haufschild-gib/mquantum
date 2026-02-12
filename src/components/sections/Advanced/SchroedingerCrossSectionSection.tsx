import { Section } from '@/components/sections/Section'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { ToggleButton } from '@/components/ui/ToggleButton'
import type {
  SchroedingerCrossSectionAxis,
  SchroedingerCrossSectionCompositeMode,
  SchroedingerCrossSectionPlaneMode,
  SchroedingerCrossSectionScalar,
} from '@/lib/geometry/extended/types'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'

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

export interface SchroedingerCrossSectionSectionProps {
  defaultOpen?: boolean
}

export const SchroedingerCrossSectionSection: React.FC<SchroedingerCrossSectionSectionProps> =
  React.memo(({ defaultOpen = true }) => {
    const objectType = useGeometryStore((state) => state.objectType)
    const dimension = useGeometryStore((state) => state.dimension)
    const extendedObjectSelector = useShallow((state: ExtendedObjectState) => ({
      config: state.schroedinger,
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
    } = useExtendedObjectStore(extendedObjectSelector)

    if (objectType !== 'schroedinger') {
      return null
    }
    if (dimension <= 2 || config.representation === 'wigner') return null

    const crossSectionNormal = config.crossSectionPlaneNormal ?? [0, 0, 1]

    return (
      <Section
        title="Analysis"
        defaultOpen={defaultOpen}
        data-testid="cross-section-slice-section"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-secondary">Enable Slice Plane</label>
            <ToggleButton
              pressed={config.crossSectionEnabled ?? false}
              onToggle={() => setCrossSectionEnabled(!(config.crossSectionEnabled ?? false))}
              className="text-xs px-2 py-1 h-auto"
              ariaLabel="Toggle cross-section slice"
              data-testid="schroedinger-cross-section-toggle"
            >
              {config.crossSectionEnabled ? 'ON' : 'OFF'}
            </ToggleButton>
          </div>

          {config.crossSectionEnabled && (
            <div className="ps-2 mt-2 border-s border-border-default space-y-2">
              <Select
                label="Compositing"
                options={CROSS_SECTION_COMPOSITE_OPTIONS}
                value={config.crossSectionCompositeMode ?? 'overlay'}
                onChange={(value) =>
                  setCrossSectionCompositeMode(value as SchroedingerCrossSectionCompositeMode)
                }
                data-testid="schroedinger-cross-section-composite-mode"
              />
              <Select
                label="Scalar"
                options={CROSS_SECTION_SCALAR_OPTIONS}
                value={config.crossSectionScalar ?? 'density'}
                onChange={(value) => setCrossSectionScalar(value as SchroedingerCrossSectionScalar)}
                data-testid="schroedinger-cross-section-scalar"
              />
              <Select
                label="Plane Mode"
                options={CROSS_SECTION_PLANE_MODE_OPTIONS}
                value={config.crossSectionPlaneMode ?? 'axisAligned'}
                onChange={(value) => setCrossSectionPlaneMode(value as SchroedingerCrossSectionPlaneMode)}
                data-testid="schroedinger-cross-section-plane-mode"
              />

              {(config.crossSectionPlaneMode ?? 'axisAligned') === 'axisAligned' ? (
                <Select
                  label="Orientation"
                  options={CROSS_SECTION_AXIS_OPTIONS}
                  value={config.crossSectionAxis ?? 'z'}
                  onChange={(value) => setCrossSectionAxis(value as SchroedingerCrossSectionAxis)}
                  data-testid="schroedinger-cross-section-axis"
                />
              ) : (
                <>
                  <Slider
                    label="Normal X"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={crossSectionNormal[0]}
                    onChange={(value) =>
                      setCrossSectionPlaneNormal([value, crossSectionNormal[1], crossSectionNormal[2]])
                    }
                    showValue
                    data-testid="schroedinger-cross-section-normal-x"
                  />
                  <Slider
                    label="Normal Y"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={crossSectionNormal[1]}
                    onChange={(value) =>
                      setCrossSectionPlaneNormal([crossSectionNormal[0], value, crossSectionNormal[2]])
                    }
                    showValue
                    data-testid="schroedinger-cross-section-normal-y"
                  />
                  <Slider
                    label="Normal Z"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={crossSectionNormal[2]}
                    onChange={(value) =>
                      setCrossSectionPlaneNormal([crossSectionNormal[0], crossSectionNormal[1], value])
                    }
                    showValue
                    data-testid="schroedinger-cross-section-normal-z"
                  />
                </>
              )}

              <Slider
                label="Plane Offset"
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
                  value={config.crossSectionPlaneColor ?? '#66ccff'}
                  onChange={setCrossSectionPlaneColor}
                  disableAlpha={true}
                  className="w-full"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary">Auto Window</label>
                <ToggleButton
                  pressed={config.crossSectionAutoWindow ?? true}
                  onToggle={() => setCrossSectionAutoWindow(!(config.crossSectionAutoWindow ?? true))}
                  className="text-xs px-2 py-1 h-auto"
                  ariaLabel="Toggle cross-section auto window"
                  data-testid="schroedinger-cross-section-auto-window-toggle"
                >
                  {config.crossSectionAutoWindow ? 'ON' : 'OFF'}
                </ToggleButton>
              </div>

              {!config.crossSectionAutoWindow && (
                <>
                  <Slider
                    label="Window Min"
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
        </div>

        {config.quantumMode === 'hydrogenND' && (
          <div className="space-y-1 mt-3 pt-3 border-t border-border-subtle">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-secondary">Radial Probability P(r)</label>
              <ToggleButton
                pressed={config.radialProbabilityEnabled ?? false}
                onToggle={() => setRadialProbabilityEnabled(!(config.radialProbabilityEnabled ?? false))}
                className="text-xs px-2 py-1 h-auto"
                ariaLabel="Toggle radial probability overlay"
                data-testid="schroedinger-radial-probability-toggle"
              >
                {config.radialProbabilityEnabled ? 'ON' : 'OFF'}
              </ToggleButton>
            </div>
            {config.radialProbabilityEnabled && (
              <div className="ps-2 border-s border-border-default space-y-2">
                <Slider
                  label="Opacity"
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
                    value={config.radialProbabilityColor ?? '#44aaff'}
                    onChange={setRadialProbabilityColor}
                    disableAlpha={true}
                    className="w-24"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Section>
    )
  })

SchroedingerCrossSectionSection.displayName = 'SchroedingerCrossSectionSection'
