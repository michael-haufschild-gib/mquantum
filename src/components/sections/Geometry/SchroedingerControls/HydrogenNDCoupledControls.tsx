/**
 * Controls for the coupled N-dimensional hydrogen atom.
 *
 * Shows quantum number controls (n, l₁, m) shared with the decoupled mode,
 * plus the angular momentum chain (l₂, l₃, ...) for hyperspherical harmonics.
 *
 * @module components/sections/Geometry/SchroedingerControls/HydrogenNDCoupledControls
 */

import React, { useCallback, useMemo } from 'react'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import {
  maxAzimuthalForPrincipal,
  orbitalShapeLetter,
} from '@/lib/geometry/extended/schroedinger/hydrogenPresets'
import { normalizeHydrogenCoupledAngularChain } from '@/lib/physics/hydrogenCoupled/presets'

import type { HydrogenNDCoupledControlsProps } from './types'

const EMPTY_ANGULAR_CHAIN: readonly number[] = []

/**
 * Controls for the true D-dimensional Coulomb problem with hyperspherical harmonics.
 */
export const HydrogenNDCoupledControls: React.FC<HydrogenNDCoupledControlsProps> = React.memo(
  ({ config, dimension, actions }) => {
    const {
      setPrincipalQuantumNumber,
      setAzimuthalQuantumNumber,
      setMagneticQuantumNumber,
      setUseRealOrbitals,
      setBohrRadiusScale,
      setAngularChainValue,
    } = actions

    const principalQuantumNumber = Number.isFinite(config.principalQuantumNumber)
      ? Math.max(1, Math.min(7, Math.floor(config.principalQuantumNumber)))
      : 1
    const maxL = maxAzimuthalForPrincipal(principalQuantumNumber)
    const azimuthalQuantumNumber = Number.isFinite(config.azimuthalQuantumNumber)
      ? Math.max(0, Math.min(maxL, Math.floor(config.azimuthalQuantumNumber)))
      : 0
    const magneticQuantumNumber = Number.isFinite(config.magneticQuantumNumber)
      ? Math.max(
          -azimuthalQuantumNumber,
          Math.min(azimuthalQuantumNumber, Math.floor(config.magneticQuantumNumber))
        ) || 0
      : 0
    const angularChain = Array.isArray(config.angularChain)
      ? config.angularChain
      : EMPTY_ANGULAR_CHAIN
    const bohrRadiusScale = Number.isFinite(config.bohrRadiusScale)
      ? Math.max(0.5, Math.min(3.0, config.bohrRadiusScale))
      : 1
    const minChainL = Math.min(azimuthalQuantumNumber, Math.abs(magneticQuantumNumber))

    // Number of angular chain values needed: D-3 (l₂ through l_{D-2})
    // l₁ = azimuthalQuantumNumber, m = magneticQuantumNumber, l_{D-1} = |m|
    const chainLength = Math.max(0, dimension - 3)

    // Build orbital shape options (s, p, d, f, ...)
    const orbitalOptions = useMemo(
      () =>
        Array.from({ length: maxL + 1 }, (_, l) => ({
          value: String(l),
          label: `l₁ = ${l} (${orbitalShapeLetter(l)})`,
        })),
      [maxL]
    )

    // Build m options
    const mOptions = useMemo(
      () =>
        Array.from({ length: 2 * azimuthalQuantumNumber + 1 }, (_, i) => {
          const m = i - azimuthalQuantumNumber
          return { value: String(m), label: `m = ${m}` }
        }),
      [azimuthalQuantumNumber]
    )

    // Callback for angular chain slider changes
    const handleChainChange = useCallback(
      (index: number) => (value: number) => {
        setAngularChainValue(index, value)
      },
      [setAngularChainValue]
    )

    // Derive slider upper bounds from the shared normalizer so the UI cascade
    // stays in sync with the store/shader invariant (l₁ >= l₂ >= ... >= |m|).
    const chainBounds = useMemo(() => {
      const normalized = normalizeHydrogenCoupledAngularChain(angularChain, {
        l1: azimuthalQuantumNumber,
        magneticM: magneticQuantumNumber,
        length: chainLength,
      })
      const bounds: number[] = [azimuthalQuantumNumber]
      for (let i = 1; i < chainLength; i++) bounds.push(normalized[i - 1]!)
      return bounds
    }, [azimuthalQuantumNumber, magneticQuantumNumber, angularChain, chainLength])

    return (
      <div className="space-y-3">
        <ControlGroup title="Quantum Numbers">
          {/* Principal quantum number n */}
          <Slider
            label="n (principal)"
            value={principalQuantumNumber}
            onChange={setPrincipalQuantumNumber}
            min={1}
            max={7}
            step={1}
          />

          {/* Angular momentum l₁ */}
          <Select
            label="l₁ (angular momentum)"
            value={String(azimuthalQuantumNumber)}
            onChange={(v) => setAzimuthalQuantumNumber(Number(v))}
            options={orbitalOptions}
          />

          {/* Magnetic quantum number m */}
          <Select
            label="m (magnetic)"
            value={String(magneticQuantumNumber)}
            onChange={(v) => setMagneticQuantumNumber(Number(v))}
            options={mOptions}
          />
        </ControlGroup>

        {/* Angular chain — only shown for D >= 4 */}
        {chainLength > 0 && (
          <ControlGroup title="Angular Momentum Chain" collapsible defaultOpen>
            <p className="text-xs text-text-tertiary mb-2">
              l₁ {'>='} l₂ {'>='} ... {'>='} |m|. Controls the D-dimensional hyperspherical
              harmonics.
            </p>
            {Array.from({ length: chainLength }, (_, i) => {
              const chainMaxL = chainBounds[i] ?? 0
              const displayMaxL = Math.max(chainMaxL, minChainL)
              const subscript = String.fromCodePoint(0x2080 + i + 2) // ₂, ₃, ₄, ...
              return (
                <Slider
                  key={i}
                  label={`l${subscript} (${minChainL}\u2013${displayMaxL})`}
                  value={Math.max(minChainL, Math.min(angularChain[i] ?? minChainL, displayMaxL))}
                  onChange={handleChainChange(i)}
                  min={minChainL}
                  max={displayMaxL}
                  step={1}
                  disabled={displayMaxL <= minChainL}
                />
              )
            })}
          </ControlGroup>
        )}

        <ControlGroup title="Display">
          <Switch
            label="Real orbitals"
            checked={config.useRealOrbitals === true}
            onCheckedChange={setUseRealOrbitals}
          />
          <Slider
            label="Bohr radius"
            value={bohrRadiusScale}
            onChange={setBohrRadiusScale}
            min={0.5}
            max={3.0}
            step={0.1}
          />
        </ControlGroup>
      </div>
    )
  }
)

HydrogenNDCoupledControls.displayName = 'HydrogenNDCoupledControls'
