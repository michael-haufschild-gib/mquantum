/**
 * KSpaceVizControls Component
 *
 * Controls for k-space occupation map display transforms: display mode,
 * exposure mapping, Gaussian broadening, and radial binning.
 * Shown in the Colors tab when colorAlgorithm === 'kSpaceOccupation'.
 */

import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { KSpaceDisplayMode, KSpaceExposureMode } from '@/lib/geometry/extended/types'
import { useExtendedObjectStore, type ExtendedObjectState } from '@/stores/extendedObjectStore'
import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

/** k-Space display mode toggle options */
const DISPLAY_MODE_OPTIONS = [
  { value: 'raw3d', label: 'Raw 3D' },
  { value: 'radial3d', label: 'Radial 3D' },
]

/** k-Space exposure mode toggle options */
const EXPOSURE_MODE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'linear', label: 'Linear' },
  { value: 'log', label: 'Log' },
]

/**
 * Self-contained k-space visualization controls.
 * Reads config and actions directly from useExtendedObjectStore.
 *
 * @example
 * ```tsx
 * {colorAlgorithm === 'kSpaceOccupation' && <KSpaceVizControls />}
 * ```
 */
export const KSpaceVizControls: React.FC = React.memo(() => {
  const selector = useShallow((s: ExtendedObjectState) => ({
    kv: s.schroedinger.freeScalar.kSpaceViz,
    setDisplayMode: s.setFreeScalarKSpaceDisplayMode,
    setFftShift: s.setFreeScalarKSpaceFftShift,
    setExposureMode: s.setFreeScalarKSpaceExposureMode,
    setLowPercentile: s.setFreeScalarKSpaceLowPercentile,
    setHighPercentile: s.setFreeScalarKSpaceHighPercentile,
    setGamma: s.setFreeScalarKSpaceGamma,
    setBroadeningEnabled: s.setFreeScalarKSpaceBroadeningEnabled,
    setBroadeningRadius: s.setFreeScalarKSpaceBroadeningRadius,
    setBroadeningSigma: s.setFreeScalarKSpaceBroadeningSigma,
    setRadialBinCount: s.setFreeScalarKSpaceRadialBinCount,
  }))

  const {
    kv,
    setDisplayMode,
    setFftShift,
    setExposureMode,
    setLowPercentile,
    setHighPercentile,
    setGamma,
    setBroadeningEnabled,
    setBroadeningRadius,
    setBroadeningSigma,
    setRadialBinCount,
  } = useExtendedObjectStore(selector)

  const handleDisplayMode = useCallback(
    (v: string) => setDisplayMode(v as KSpaceDisplayMode),
    [setDisplayMode]
  )

  const handleExposureMode = useCallback(
    (v: string) => setExposureMode(v as KSpaceExposureMode),
    [setExposureMode]
  )

  return (
    <div className="space-y-3 border-t border-border-subtle pt-3">
      <div className="text-xs text-text-secondary font-medium">
        k-Space Visualization
      </div>

      <ToggleGroup
        options={DISPLAY_MODE_OPTIONS}
        value={kv.displayMode}
        onChange={handleDisplayMode}
        ariaLabel="Display mode"
        data-testid="kspace-display-mode"
      />

      <Switch
        label="Center Low |k|"
        checked={kv.fftShiftEnabled}
        onCheckedChange={setFftShift}
        data-testid="kspace-fft-shift"
      />

      {/* Exposure */}
      <div className="space-y-2 ps-3 border-s border-border-subtle">
        <div className="text-xs text-text-tertiary">Exposure</div>
        <ToggleGroup
          options={EXPOSURE_MODE_OPTIONS}
          value={kv.exposureMode}
          onChange={handleExposureMode}
          ariaLabel="Exposure mode"
          data-testid="kspace-exposure-mode"
        />
        <Slider
          label="Low %"
          min={0}
          max={99}
          step={0.5}
          value={kv.lowPercentile}
          onChange={setLowPercentile}
          showValue
          data-testid="kspace-low-percentile"
        />
        <Slider
          label="High %"
          min={1}
          max={100}
          step={0.5}
          value={kv.highPercentile}
          onChange={setHighPercentile}
          showValue
          data-testid="kspace-high-percentile"
        />
        <Slider
          label="Gamma"
          min={0.1}
          max={3.0}
          step={0.1}
          value={kv.gamma}
          onChange={setGamma}
          showValue
          data-testid="kspace-gamma"
        />
      </div>

      {/* Broadening */}
      <div className="space-y-2 ps-3 border-s border-border-subtle">
        <div className="text-xs text-text-tertiary">Broadening (display only)</div>
        <Switch
          label="Enable"
          checked={kv.broadeningEnabled}
          onCheckedChange={setBroadeningEnabled}
          data-testid="kspace-broadening-enabled"
        />
        {kv.broadeningEnabled && (
          <>
            <Slider
              label="Radius"
              min={1}
              max={5}
              step={1}
              value={kv.broadeningRadius}
              onChange={setBroadeningRadius}
              showValue
              data-testid="kspace-broadening-radius"
            />
            <Slider
              label="Sigma"
              min={0.5}
              max={3.0}
              step={0.1}
              value={kv.broadeningSigma}
              onChange={setBroadeningSigma}
              showValue
              data-testid="kspace-broadening-sigma"
            />
          </>
        )}
      </div>

      {/* Radial bin count (only for radial3d mode) */}
      {kv.displayMode === 'radial3d' && (
        <Slider
          label="Radial Bins"
          min={16}
          max={128}
          step={1}
          value={kv.radialBinCount}
          onChange={setRadialBinCount}
          showValue
          data-testid="kspace-radial-bins"
        />
      )}
    </div>
  )
})

KSpaceVizControls.displayName = 'KSpaceVizControls'
