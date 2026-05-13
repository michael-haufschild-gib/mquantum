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

import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { isAnalyticQuantumType } from '@/lib/geometry/registry'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

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
  const markComputeNeedsReset = useExtendedObjectStore((s) => s.markComputeNeedsReset)
  const stableAction = useExtendedObjectStore((s) => {
    switch (quantumMode) {
      case 'tdseDynamics':
        return s.resetTdseField
      case 'becDynamics':
        return s.resetBecField
      case 'freeScalarField':
        return s.resetFreeScalarField
      case 'quantumWalk':
        return s.resetQuantumWalk
      default:
        return undefined
    }
  })
  return useMemo(() => {
    if (objectType === 'pauliSpinor') return () => markComputeNeedsReset('pauliSpinor')
    if (stableAction) return stableAction
    if (quantumMode === 'diracEquation') return () => markComputeNeedsReset('dirac')
    return noop
  }, [stableAction, quantumMode, markComputeNeedsReset, objectType])
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
  // Wheeler–DeWitt is a compute mode but the density is solved once per config
  // change (no time evolution), so frame-to-frame auto-scale is meaningless —
  // treat it like the analytic modes in this section.
  const isStatic =
    objectType !== 'pauliSpinor' &&
    (isAnalyticQuantumType(quantumMode) || quantumMode === 'wheelerDeWitt')
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
        {quantumMode === 'wheelerDeWitt' && <WdwDynamicRangeSlider />}
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
 * Read-only indicator showing the effective auto-scale gain.
 * The raw gain is 1/maxDensity; the effective gain is capped at autoScaleMaxGain.
 *
 * Reads `maxDensity` from the channel matching the active quantum mode —
 * the previous version always read `s.tdse.maxDensity`, which displayed
 * stale TDSE data for BEC/Dirac/FSF/Pauli sessions and froze at "—" for
 * QW (which doesn't track maxDensity in its channel).
 */
const ExposureIndicator: React.FC = React.memo(() => {
  const objectType = useGeometryStore((s) => s.objectType)
  const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)
  const { maxDensity, hasData } = useDiagnosticsStore(
    useShallow((s) => {
      if (objectType === 'pauliSpinor') {
        return { maxDensity: s.pauli.maxDensity, hasData: s.pauli.hasData }
      }
      switch (quantumMode) {
        case 'becDynamics':
          return { maxDensity: s.bec.maxDensity, hasData: s.bec.hasData }
        case 'diracEquation':
          return { maxDensity: s.dirac.maxDensity, hasData: s.dirac.hasData }
        case 'freeScalarField':
          return { maxDensity: s.fsf.maxPhi, hasData: s.fsf.hasData }
        case 'tdseDynamics':
          return { maxDensity: s.tdse.maxDensity, hasData: s.tdse.hasData }
        case 'quantumWalk':
        default:
          return { maxDensity: 0, hasData: false }
      }
    })
  )

  const autoScaleMaxGain = useExtendedObjectStore((s) => s.schroedinger.autoScaleMaxGain ?? 20)

  const hasValue = hasData && maxDensity > 0
  const rawGain = hasValue ? 1.0 / Math.max(maxDensity, 1e-10) : 0
  const isCapped = hasValue && rawGain > autoScaleMaxGain
  const effectiveGain = Math.min(rawGain, autoScaleMaxGain)

  const formatGain = (g: number) => (g >= 10 ? `${Math.round(g)}x` : `${g.toFixed(1)}x`)

  return (
    <div
      className="flex items-center justify-between px-1 py-0.5 text-xs font-mono"
      data-testid="exposure-gain-indicator"
    >
      <span className="text-[var(--text-tertiary)]">Current gain</span>
      <span className={isCapped ? 'text-[var(--text-warning)]' : 'text-[var(--text-secondary)]'}>
        {hasValue ? (
          <>
            {formatGain(effectiveGain)}
            {isCapped ? ` (capped from ~${formatGain(rawGain)})` : ''}
          </>
        ) : (
          '—'
        )}
      </span>
    </div>
  )
})
ExposureIndicator.displayName = 'ExposureIndicator'

/**
 * Wheeler-DeWitt R-channel headroom slider. Maps linearly in log10-space
 * from 1 to 10 000 so the useful working range around the default (100)
 * is easy to hit with the mouse — a plain linear slider would put 100
 * at 1 % of the track. Emits raw decimal values to the store so the
 * URL serializer and physics layer never deal with log-space units.
 */
const WdwDynamicRangeSlider: React.FC = React.memo(() => {
  const { renderDynamicRange, setWdwRenderDynamicRange } = useExtendedObjectStore(
    useShallow((s) => ({
      renderDynamicRange: s.schroedinger.wheelerDeWitt?.renderDynamicRange ?? 100,
      setWdwRenderDynamicRange: s.setWdwRenderDynamicRange,
    }))
  )

  const logValue = Math.log10(Math.max(1, renderDynamicRange))
  const handleChange = useCallback(
    (logV: number) => {
      setWdwRenderDynamicRange(Math.pow(10, logV))
    },
    [setWdwRenderDynamicRange]
  )

  return (
    <Slider
      label="Dynamic Range"
      tooltip="Headroom multiplier applied to the Lorentzian-max for Wheeler-DeWitt R-channel normalization. Lower (→1) reveals more interior structure but saturates Euclidean corners sooner; higher (→10 000) hides interior detail under a uniform dim background while Bi-Airy corner growth stays visible. 100 is the physics default."
      min={0}
      max={4}
      step={0.05}
      value={logValue}
      onChange={handleChange}
      showValue
      formatValue={(v) => Math.round(Math.pow(10, v)).toString()}
      data-testid="exposure-wdw-dynamic-range"
    />
  )
})
WdwDynamicRangeSlider.displayName = 'WdwDynamicRangeSlider'
