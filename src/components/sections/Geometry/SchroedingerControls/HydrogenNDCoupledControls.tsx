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

import type { HydrogenNDCoupledControlsProps } from './types'

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

    const maxL = maxAzimuthalForPrincipal(config.principalQuantumNumber)
    const maxM = config.azimuthalQuantumNumber

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
        Array.from({ length: 2 * maxM + 1 }, (_, i) => {
          const m = i - maxM
          return { value: String(m), label: `m = ${m}` }
        }),
      [maxM]
    )

    // Callback for angular chain slider changes
    const handleChainChange = useCallback(
      (index: number) => (value: number) => {
        setAngularChainValue(index, value)
      },
      [setAngularChainValue]
    )

    // Compute upper bounds for each chain value.
    // Physics constraint: l₁ >= l₂ >= l₃ >= ... >= |m|.
    // Each l_{k+1} is bounded above by l_k (the previous element in the chain).
    // Slider min is always 0 — the store setter enforces the |m| constraint.
    const chainBounds = useMemo(() => {
      const bounds: number[] = [] // max for each slot
      let prevL = config.azimuthalQuantumNumber // l₁
      for (let i = 0; i < chainLength; i++) {
        bounds.push(prevL)
        // Next element's max is this element's current value (cascade)
        prevL = Math.min(prevL, config.angularChain[i] ?? 0)
      }
      return bounds
    }, [config.azimuthalQuantumNumber, config.angularChain, chainLength])

    return (
      <div className="space-y-3">
        <ControlGroup title="Quantum Numbers">
          {/* Principal quantum number n */}
          <Slider
            label="n (principal)"
            value={config.principalQuantumNumber}
            onChange={setPrincipalQuantumNumber}
            min={1}
            max={7}
            step={1}
          />

          {/* Angular momentum l₁ */}
          <Select
            label="l₁ (angular momentum)"
            value={String(config.azimuthalQuantumNumber)}
            onChange={(v) => setAzimuthalQuantumNumber(Number(v))}
            options={orbitalOptions}
          />

          {/* Magnetic quantum number m */}
          <Select
            label="m (magnetic)"
            value={String(config.magneticQuantumNumber)}
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
              const subscript = String.fromCodePoint(0x2080 + i + 2) // ₂, ₃, ₄, ...
              return (
                <Slider
                  key={i}
                  label={`l${subscript} (0\u2013${chainMaxL})`}
                  value={Math.min(config.angularChain[i] ?? 0, Math.max(chainMaxL, 0))}
                  onChange={handleChainChange(i)}
                  min={0}
                  max={Math.max(chainMaxL, 0)}
                  step={1}
                  disabled={chainMaxL <= 0}
                />
              )
            })}
          </ControlGroup>
        )}

        <ControlGroup title="Display">
          <Switch
            label="Real orbitals"
            checked={config.useRealOrbitals}
            onCheckedChange={setUseRealOrbitals}
          />
          <Slider
            label="Bohr radius"
            value={config.bohrRadiusScale}
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
