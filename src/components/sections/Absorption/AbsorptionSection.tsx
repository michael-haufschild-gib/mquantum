/**
 * AbsorptionSection Component
 *
 * Controls for PML (Perfectly Matched Layer) absorbing boundary conditions.
 * Adapts to the active quantum mode, reading and writing the correct absorber
 * config for each: base schroedinger, TDSE, free scalar field, BEC, Dirac,
 * and Pauli spinor.
 *
 * @module components/sections/Absorption/AbsorptionSection
 */

import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { isAnalyticQuantumType } from '@/lib/geometry/registry'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'


/**
 * Selects the shared absorber state and setters.
 *
 * PML settings are universal — one set of controls applied to all modes
 * via `applySharedPml` in each strategy. The top-level schroedinger
 * absorber fields are the single source of truth.
 */
function useAbsorber(objectType: string) {
  return useExtendedObjectStore(
    useShallow((s) => {
      const cfg = s.schroedinger
      const qm = cfg.quantumMode

      const isStatic = objectType !== 'pauliSpinor' && isAnalyticQuantumType(qm)

      return {
        disabled: isStatic,
        enabled: cfg.absorberEnabled,
        width: cfg.absorberWidth,
        pmlTargetReflection: cfg.pmlTargetReflection,
        setEnabled: s.setSchroedingerAbsorberEnabled,
        setWidth: s.setSchroedingerAbsorberWidth,
        setPmlTargetReflection: s.setSchroedingerPmlTargetReflection,
      }
    })
  )
}

interface AbsorptionSectionProps {
  defaultOpen?: boolean
}

/**
 * PML absorbing boundary controls.
 *
 * @param props - Section props
 * @returns Absorption section or null if object type is unsupported
 *
 * @example
 * ```tsx
 * <AbsorptionSection defaultOpen={true} />
 * ```
 */
export const AbsorptionSection: React.FC<AbsorptionSectionProps> = React.memo(
  ({ defaultOpen = true }) => {
    const objectType = useGeometryStore((s) => s.objectType)

    if (objectType !== 'schroedinger' && objectType !== 'pauliSpinor') {
      return null
    }

    return <AbsorptionSectionInner objectType={objectType} defaultOpen={defaultOpen} />
  }
)
AbsorptionSection.displayName = 'AbsorptionSection'

/** Inner component — only rendered for supported object types. */
const AbsorptionSectionInner: React.FC<{
  objectType: string
  defaultOpen: boolean
}> = React.memo(({ objectType, defaultOpen }) => {
  const {
    disabled,
    enabled,
    width,
    pmlTargetReflection,
    setEnabled,
    setWidth,
    setPmlTargetReflection,
  } = useAbsorber(objectType)

  const logReflection = useMemo(
    () => -Math.log10(Math.max(1e-12, pmlTargetReflection)),
    [pmlTargetReflection]
  )
  const handleLogReflectionChange = useCallback(
    (v: number) => setPmlTargetReflection(Math.pow(10, -v)),
    [setPmlTargetReflection]
  )

  if (disabled) {
    return (
      <UnavailableSection
        title="Absorption"
        reason="Requires a dynamic simulation mode"
        data-testid="absorption-section"
      />
    )
  }

  return (
    <Section title="Absorption" defaultOpen={defaultOpen} data-testid="absorption-section">
      <Switch
        label="PML Boundary"
        tooltip="Enable Perfectly Matched Layer absorbing boundaries. Prevents artificial reflections at domain edges by gradually damping outgoing waves."
        checked={enabled}
        onCheckedChange={setEnabled}
      />
      {enabled && (
        <>
          <Slider
            label="PML Width"
            tooltip="Fraction of the domain used for the absorbing layer. Wider PML absorbs more effectively but reduces the usable simulation volume."
            value={width}
            onChange={setWidth}
            min={0.05}
            max={0.5}
            step={0.01}
            showValue
            data-testid="absorption-pml-width"
          />
          <Slider
            label={`Reflection 10⁻${Math.round(logReflection)}`}
            tooltip="Target reflection coefficient (log scale). Higher values mean stronger absorption — 10⁻⁶ is typical, 10⁻¹⁰ is very aggressive."
            value={logReflection}
            onChange={handleLogReflectionChange}
            min={3}
            max={10}
            step={1}
            showValue
            data-testid="absorption-pml-reflection"
          />
        </>
      )}
    </Section>
  )
})
AbsorptionSectionInner.displayName = 'AbsorptionSectionInner'
