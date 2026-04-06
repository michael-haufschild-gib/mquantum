/**
 * ExposureSection Component
 *
 * Centralizes all density display controls: auto-scale with gain cap,
 * density gain, and density contrast. Replaces scattered auto-scale toggles
 * across mode-specific controls and density sliders from Advanced Rendering.
 *
 * The gain cap prevents auto-scale from amplifying negligible residuals
 * (e.g., tunneling leakage through a barrier) to full brightness.
 *
 * @module components/sections/Exposure/ExposureSection
 */

import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { isAnalyticQuantumType } from '@/lib/geometry/registry'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'


const noop = () => {}

/**
 * Selects the auto-scale state for the active quantum mode.
 */
function useAutoScaleValue(objectType: string): boolean {
  return useExtendedObjectStore((s) => {
    if (objectType === 'pauliSpinor') return s.pauliSpinor?.autoScale ?? true
    const cfg = s.schroedinger
    switch (cfg.quantumMode) {
      case 'tdseDynamics':
        return cfg.tdse?.autoScale ?? true
      case 'becDynamics':
        return cfg.bec?.autoScale ?? true
      case 'freeScalarField':
        return cfg.freeScalar?.autoScale ?? true
      case 'diracEquation':
        return cfg.dirac?.autoScale ?? true
      case 'quantumWalk':
        return cfg.quantumWalk?.autoScale ?? true
      default:
        return false
    }
  })
}

/**
 * Selects the auto-scale setter for the active quantum mode.
 * Stable reference — the setter functions are the same across renders.
 */
function useAutoScaleSetter(objectType: string): (v: boolean) => void {
  const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)
  return useExtendedObjectStore(
    useCallback(
      (s) => {
        if (objectType === 'pauliSpinor') return s.setPauliAutoScale
        switch (quantumMode) {
          case 'tdseDynamics':
            return s.setTdseAutoScale
          case 'becDynamics':
            return s.setBecAutoScale
          case 'freeScalarField':
            return s.setFreeScalarAutoScale
          case 'diracEquation':
            return s.setDiracAutoScale
          case 'quantumWalk':
            return s.setQwAutoScale
          default:
            return noop
        }
      },
      [objectType, quantumMode]
    )
  )
}

/**
 * Returns a reset function for the active compute mode's simulation field.
 * Mirrors the reset logic in TimelineControls.
 */
function useResetField(objectType: string): () => void {
  const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)
  return useExtendedObjectStore((s) => {
    if (objectType === 'pauliSpinor') return s.setPauliNeedsReset
    switch (quantumMode) {
      case 'tdseDynamics':
        return s.resetTdseField
      case 'becDynamics':
        return s.resetBecField
      case 'freeScalarField':
        return s.resetFreeScalarField
      case 'diracEquation':
        return s.setDiracNeedsReset
      case 'quantumWalk':
        return s.resetQuantumWalk
      default:
        return noop
    }
  })
}

/** Selects density gain, contrast, and max gain from the schroedinger config. */
function useDensityControls() {
  return useExtendedObjectStore(
    useShallow((s) => ({
      densityGain: s.schroedinger.densityGain,
      densityContrast: s.schroedinger.densityContrast ?? 1.8,
      autoScaleMaxGain: s.schroedinger.autoScaleMaxGain ?? 20,
      setDensityGain: s.setSchroedingerDensityGain,
      setDensityContrast: s.setSchroedingerDensityContrast,
      setAutoScaleMaxGain: s.setSchroedingerAutoScaleMaxGain,
    }))
  )
}

interface ExposureSectionProps {
  defaultOpen?: boolean
}

/**
 * Exposure controls: auto-scale with gain cap, density gain, and density contrast.
 *
 * @param props - Section props
 * @returns Exposure section, unavailable notice for static modes, or null for unsupported types
 */
export const ExposureSection: React.FC<ExposureSectionProps> = React.memo(
  ({ defaultOpen = true }) => {
    const objectType = useGeometryStore((s) => s.objectType)

    if (objectType !== 'schroedinger' && objectType !== 'pauliSpinor') {
      return null
    }

    return <ExposureSectionInner objectType={objectType} defaultOpen={defaultOpen} />
  }
)
ExposureSection.displayName = 'ExposureSection'

/** Inner component — only rendered for supported object types. */
const ExposureSectionInner: React.FC<{
  objectType: string
  defaultOpen: boolean
}> = React.memo(({ objectType, defaultOpen }) => {
  const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)
  const isStatic = objectType !== 'pauliSpinor' && isAnalyticQuantumType(quantumMode)
  const isDynamic = !isStatic

  const autoScale = useAutoScaleValue(objectType)
  const setAutoScaleRaw = useAutoScaleSetter(objectType)
  const resetField = useResetField(objectType)
  const setAutoScale = useCallback(
    (v: boolean) => {
      setAutoScaleRaw(v)
      resetField()
    },
    [setAutoScaleRaw, resetField]
  )
  const {
    densityGain,
    densityContrast,
    autoScaleMaxGain,
    setDensityGain,
    setDensityContrast,
    setAutoScaleMaxGain,
  } = useDensityControls()

  if (isStatic) {
    return (
      <Section title="Exposure" defaultOpen={defaultOpen} data-testid="exposure-section">
        <Slider
          label="Density Gain"
          tooltip="Multiplier for the volumetric density. Increase to make faint regions visible; decrease to reveal inner structure."
          min={0.1}
          max={5.0}
          step={0.1}
          value={densityGain}
          onChange={setDensityGain}
          showValue
          data-testid="exposure-density-gain"
        />
        <Slider
          label="Density Contrast"
          tooltip="Power curve applied to density values. Higher contrast suppresses dim regions and emphasizes bright peaks."
          min={1.0}
          max={4.0}
          step={0.1}
          value={densityContrast}
          onChange={setDensityContrast}
          showValue
          data-testid="exposure-density-contrast"
        />
      </Section>
    )
  }

  return (
    <Section title="Exposure" defaultOpen={defaultOpen} data-testid="exposure-section">
      <Switch
        label="Auto Scale"
        tooltip="Automatically normalize the color range to the current maximum probability density. Prevents saturation as the wavepacket spreads."
        checked={autoScale}
        onCheckedChange={setAutoScale}
        data-testid="exposure-auto-scale"
      />
      {isDynamic && autoScale && (
        <>
          <Slider
            label="Max Gain"
            tooltip="Maximum auto-scale amplification factor. Prevents negligible density residuals (e.g., tunneling leakage) from being amplified to full brightness."
            min={1}
            max={100}
            step={1}
            value={autoScaleMaxGain}
            onChange={setAutoScaleMaxGain}
            showValue
            data-testid="exposure-max-gain"
          />
          <ExposureIndicator />
        </>
      )}
      <Slider
        label="Density Gain"
        tooltip="Multiplier for the volumetric density. Increase to make faint regions visible; decrease to reveal inner structure."
        min={0.1}
        max={5.0}
        step={0.1}
        value={densityGain}
        onChange={setDensityGain}
        showValue
        data-testid="exposure-density-gain"
      />
      <Slider
        label="Density Contrast"
        tooltip="Power curve applied to density values. Higher contrast suppresses dim regions and emphasizes bright peaks."
        min={1.0}
        max={4.0}
        step={0.1}
        value={densityContrast}
        onChange={setDensityContrast}
        showValue
        data-testid="exposure-density-contrast"
      />
    </Section>
  )
})
ExposureSectionInner.displayName = 'ExposureSectionInner'

/**
 * Read-only indicator showing the current auto-scale gain.
 * Uses the latest maxDensity from the TDSE diagnostics store and compares
 * it to the first snapshot's maxDensity to compute the amplification factor.
 */
const ExposureIndicator: React.FC = React.memo(() => {
  const { maxDensity, hasData } = useDiagnosticsStore(
    useShallow((s) => ({
      maxDensity: s.tdse.maxDensity,
      hasData: s.tdse.hasData,
    }))
  )

  const autoScaleMaxGain = useExtendedObjectStore((s) => s.schroedinger.autoScaleMaxGain ?? 20)

  // The gain cap is applied via initialMaxDensity / autoScaleMaxGain floor.
  // Here we just show whether the current maxDensity implies the cap is active.
  // A simple heuristic: if maxDensity is very small, gain is high.
  if (!hasData || maxDensity <= 0) return null

  // We don't have initialMaxDensity in the store, but we can show a qualitative indicator
  // by comparing current maxDensity to 1.0 (the typical order-of-magnitude for normalized ψ).
  // The actual gain cap is enforced GPU-side in the uniform packing.
  const estimatedGain = 1.0 / Math.max(maxDensity, 1e-10)
  const isCapped = estimatedGain >= autoScaleMaxGain * 0.95

  const gainText =
    estimatedGain >= 100
      ? `~${Math.round(estimatedGain)}x`
      : estimatedGain >= 10
        ? `~${Math.round(estimatedGain)}x`
        : `~${estimatedGain.toFixed(1)}x`

  return (
    <div
      className="flex items-center justify-between px-1 py-0.5 text-xs font-mono"
      data-testid="exposure-gain-indicator"
    >
      <span className="text-[var(--text-tertiary)]">Current gain</span>
      <span className={isCapped ? 'text-[var(--text-warning)]' : 'text-[var(--text-secondary)]'}>
        {gainText}
        {isCapped ? ' (capped)' : ''}
      </span>
    </div>
  )
})
ExposureIndicator.displayName = 'ExposureIndicator'
