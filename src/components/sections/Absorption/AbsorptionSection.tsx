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
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

/** Analytical modes have no time evolution — PML is irrelevant. */
const STATIC_MODES = new Set(['harmonicOscillator', 'hydrogenND'])

/**
 * Selects the absorber state and setters for the active quantum mode.
 *
 * Returns a flat object (no nesting) so useShallow comparison works
 * correctly. Returns `disabled: true` for static analytical modes.
 */
function useAbsorber(objectType: string) {
  return useExtendedObjectStore(
    useShallow((s) => {
      const cfg = s.schroedinger
      const qm = cfg.quantumMode

      if (objectType === 'pauliSpinor') {
        return {
          disabled: false,
          enabled: s.pauliSpinor.absorberEnabled,
          width: s.pauliSpinor.absorberWidth,
          pmlTargetReflection: s.pauliSpinor.pmlTargetReflection,
          setEnabled: s.setPauliAbsorberEnabled,
          setWidth: s.setPauliAbsorberWidth,
          setPmlTargetReflection: s.setPauliPmlTargetReflection,
        }
      }

      if (STATIC_MODES.has(qm)) {
        return {
          disabled: true,
          enabled: false,
          width: 0.2,
          pmlTargetReflection: 1e-6,
          setEnabled: s.setSchroedingerAbsorberEnabled,
          setWidth: s.setSchroedingerAbsorberWidth,
          setPmlTargetReflection: s.setSchroedingerPmlTargetReflection,
        }
      }

      const modeMap = {
        tdseDynamics: {
          cfg: cfg.tdse,
          setEnabled: s.setTdseAbsorberEnabled,
          setWidth: s.setTdseAbsorberWidth,
          setPmlTargetReflection: s.setTdsePmlTargetReflection,
        },
        freeScalarField: {
          cfg: cfg.freeScalar,
          setEnabled: s.setFreeScalarAbsorberEnabled,
          setWidth: s.setFreeScalarAbsorberWidth,
          setPmlTargetReflection: s.setFreeScalarPmlTargetReflection,
        },
        becDynamics: {
          cfg: cfg.bec,
          setEnabled: s.setBecAbsorberEnabled,
          setWidth: s.setBecAbsorberWidth,
          setPmlTargetReflection: s.setBecPmlTargetReflection,
        },
        diracEquation: {
          cfg: cfg.dirac,
          setEnabled: s.setDiracAbsorberEnabled,
          setWidth: s.setDiracAbsorberWidth,
          setPmlTargetReflection: s.setDiracPmlTargetReflection,
        },
      } as const

      const m = modeMap[qm as keyof typeof modeMap]
      const source = m?.cfg ?? cfg

      return {
        disabled: false,
        enabled: source.absorberEnabled,
        width: source.absorberWidth,
        pmlTargetReflection: source.pmlTargetReflection,
        setEnabled: m?.setEnabled ?? s.setSchroedingerAbsorberEnabled,
        setWidth: m?.setWidth ?? s.setSchroedingerAbsorberWidth,
        setPmlTargetReflection: m?.setPmlTargetReflection ?? s.setSchroedingerPmlTargetReflection,
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
      <Switch label="PML Boundary" checked={enabled} onCheckedChange={setEnabled} />
      {enabled && (
        <>
          <Slider
            label="PML Width"
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
