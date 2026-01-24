/**
 * HydrogenOrbitalControls Component
 *
 * Controls for 3D hydrogen atom electron orbitals (Coulomb potential).
 * Displays s, p, d, f orbitals with quantum number controls.
 */

import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import {
  HYDROGEN_ORBITAL_PRESETS,
  maxAzimuthalForPrincipal,
  orbitalShapeLetter,
} from '@/lib/geometry/extended/schroedinger/hydrogenPresets'
import type { HydrogenOrbitalPresetName } from '@/lib/geometry/extended/types'
import React, { useMemo } from 'react'
import type { HydrogenOrbitalControlsProps } from './types'

/**
 * HydrogenOrbitalControls component
 *
 * Provides controls for 3D hydrogen orbitals:
 * - Preset selection (s, p, d, f orbitals)
 * - Quantum numbers (n, l, m)
 * - Real vs Complex representation
 * - Bohr radius scale
 */
export const HydrogenOrbitalControls: React.FC<HydrogenOrbitalControlsProps> = React.memo(
  ({ config, actions }) => {
    const {
      setHydrogenPreset,
      setPrincipalQuantumNumber,
      setAzimuthalQuantumNumber,
      setMagneticQuantumNumber,
      setUseRealOrbitals,
      setBohrRadiusScale,
    } = actions

    // Compute derived state for quantum number constraints
    const maxL = maxAzimuthalForPrincipal(config.principalQuantumNumber)
    const maxM = config.azimuthalQuantumNumber

    // Build preset options grouped by orbital type
    const presetOptions = useMemo(() => {
      // Exclude 'custom' from all groups - it's added separately at the end
      const groups = {
        s: Object.entries(HYDROGEN_ORBITAL_PRESETS).filter(
          ([, p]) => p.l === 0 && p.name !== 'Custom'
        ),
        p: Object.entries(HYDROGEN_ORBITAL_PRESETS).filter(
          ([, p]) => p.l === 1 && p.name !== 'Custom'
        ),
        d: Object.entries(HYDROGEN_ORBITAL_PRESETS).filter(
          ([, p]) => p.l === 2 && p.name !== 'Custom'
        ),
        f: Object.entries(HYDROGEN_ORBITAL_PRESETS).filter(
          ([, p]) => p.l === 3 && p.name !== 'Custom'
        ),
      }

      return [
        {
          label: 's Orbitals (Spherical)',
          options: groups.s.map(([k, p]) => ({ value: k, label: p.name })),
        },
        {
          label: 'p Orbitals (Dumbbell)',
          options: groups.p.map(([k, p]) => ({ value: k, label: p.name })),
        },
        {
          label: 'd Orbitals (Cloverleaf)',
          options: groups.d.map(([k, p]) => ({ value: k, label: p.name })),
        },
        {
          label: 'f Orbitals (Complex)',
          options: groups.f.map(([k, p]) => ({ value: k, label: p.name })),
        },
        { label: 'Custom', options: [{ value: 'custom', label: 'Custom (n, l, m)' }] },
      ]
    }, [])

    // Flatten for Select component (it may not support groups)
    const flatOptions = useMemo(
      () => presetOptions.flatMap((group) => group.options),
      [presetOptions]
    )

    return (
      <>
        {/* Hydrogen Orbital Preset Selection */}
        <div className="space-y-2">
          <Select
            label="Orbital Preset"
            options={flatOptions}
            value={config.hydrogenPreset}
            onChange={(v) => setHydrogenPreset(v as HydrogenOrbitalPresetName)}
            data-testid="hydrogen-preset-select"
          />
          <p className="text-xs text-text-tertiary pt-1">
            {
              HYDROGEN_ORBITAL_PRESETS[config.hydrogenPreset as HydrogenOrbitalPresetName]
                ?.description
            }
          </p>
        </div>

        {/* Quantum Numbers */}
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-secondary">Quantum Numbers</label>
            <span className="text-xs text-text-tertiary">
              {config.principalQuantumNumber}
              {orbitalShapeLetter(config.azimuthalQuantumNumber)}
              {config.azimuthalQuantumNumber > 0 ? ` (m=${config.magneticQuantumNumber})` : ''}
            </span>
          </div>

          <Slider
            label="n (Principal)"
            min={1}
            max={7}
            step={1}
            value={config.principalQuantumNumber}
            onChange={setPrincipalQuantumNumber}
            showValue
            data-testid="hydrogen-n-slider"
          />

          <Slider
            label={`l (Shape: ${orbitalShapeLetter(config.azimuthalQuantumNumber)})`}
            min={0}
            max={maxL}
            step={1}
            value={config.azimuthalQuantumNumber}
            onChange={setAzimuthalQuantumNumber}
            showValue
            data-testid="hydrogen-l-slider"
          />

          {config.azimuthalQuantumNumber > 0 && (
            <Slider
              label="m (Orientation)"
              min={-maxM}
              max={maxM}
              step={1}
              value={config.magneticQuantumNumber}
              onChange={setMagneticQuantumNumber}
              showValue
              data-testid="hydrogen-m-slider"
            />
          )}
        </div>

        {/* Real vs Complex toggle */}
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[var(--text-secondary)]">Orbital Representation</label>
            <Button
              variant={config.useRealOrbitals ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setUseRealOrbitals(!config.useRealOrbitals)}
              className={config.useRealOrbitals ? 'bg-accent/20 text-accent' : ''}
              data-testid="hydrogen-real-toggle"
            >
              {config.useRealOrbitals ? 'Real (px, py, pz)' : 'Complex (m)'}
            </Button>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            {config.useRealOrbitals
              ? 'Real spherical harmonics (chemistry convention)'
              : 'Complex spherical harmonics (physics convention)'}
          </p>
        </div>

        {/* Bohr Radius Scale */}
        <div className="space-y-2 pt-2 border-t border-border-subtle">
          <Slider
            label="Bohr Radius Scale"
            min={0.5}
            max={3.0}
            step={0.1}
            value={config.bohrRadiusScale}
            onChange={setBohrRadiusScale}
            showValue
            data-testid="hydrogen-bohr-scale"
          />
        </div>
      </>
    )
  }
)

HydrogenOrbitalControls.displayName = 'HydrogenOrbitalControls'
