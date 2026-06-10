/**
 * Riemann Zeta (Arithmetic Horizon) controls panel.
 *
 * Exposes the dual-construction source toggle (ζ zeros ⇄ primes), the
 * spectral band-limit Nz, the primon-gas inverse temperature β (Hagedorn point
 * at β = 1), the Berry–Keating dilation-horizon radius, the angular lobe
 * numbers (ℓ, m), the self-similar dilation flow rate, and the glow gain.
 * Scenario presets live in the shared header ScenarioSelector. Live readouts
 * show the truncated partition function Z(β) = ζ(β) − 1 and the resulting
 * Hagedorn emission gain — recomputed from the same physics module the GPU
 * packer uses, so the panel numbers always match the rendered scene.
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { RIEMANN_ZETA_RANGES } from '@/lib/geometry/extended/riemannZeta'
import { hagedornPartitionGain, truncatedZeta } from '@/lib/physics/riemannZeta'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const R = RIEMANN_ZETA_RANGES

/**
 * Controls for the Riemann Zeta (Arithmetic Horizon) quantum mode.
 *
 * @returns The Arithmetic Horizon control panel
 */
export function RiemannZetaControls(): React.ReactElement {
  const config = useExtendedObjectStore((s) => s.schroedinger.riemannZeta)
  const {
    setSource,
    setNumZeros,
    setBeta,
    setHorizonRadius,
    setAngularL,
    setAngularM,
    setFlowRate,
    setGlow,
    setCutaway,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      setSource: s.setRiemannZetaSource,
      setNumZeros: s.setRiemannZetaNumZeros,
      setBeta: s.setRiemannZetaBeta,
      setHorizonRadius: s.setRiemannZetaHorizonRadius,
      setAngularL: s.setRiemannZetaAngularL,
      setAngularM: s.setRiemannZetaAngularM,
      setFlowRate: s.setRiemannZetaFlowRate,
      setGlow: s.setRiemannZetaGlow,
      setCutaway: s.setRiemannZetaCutaway,
    }))
  )

  const physics = useMemo(
    () => ({
      partition: truncatedZeta(config.beta),
      gain: hagedornPartitionGain(config.beta),
    }),
    [config.beta]
  )

  const mClamp = Math.max(0, Math.round(config.angularL))

  return (
    <div className="flex flex-col gap-3" data-testid="riemann-zeta-controls">
      {/* Scenario presets live in the shared header ScenarioSelector. */}
      <ControlGroup title="Dual Construction" data-testid="rz-source-group">
        <ToggleGroup
          options={[
            { value: 'zeros', label: 'ζ Zeros' },
            { value: 'primes', label: 'Primes' },
          ]}
          value={config.source}
          onChange={(v) => setSource(v as 'zeros' | 'primes')}
          tooltip="Dual construction: build the prime shells from the Riemann ζ zeros (explicit formula) or forward from the primes (primon gas) — the same object from both sides."
          data-testid="rz-source-toggle"
        />
        <Slider
          label="Zeros Nz"
          tooltip="Number of Riemann ζ zeros in the spectral synthesis. More zeros sharpen the prime shells (band-limit of the explicit formula)."
          value={config.numZeros}
          onChange={setNumZeros}
          min={R.numZeros.min}
          max={R.numZeros.max}
          step={1}
          data-testid="rz-numzeros-slider"
        />
      </ControlGroup>

      <ControlGroup title="Primon Gas" data-testid="rz-gas-group">
        <Slider
          label="Hagedorn β (→1 ignites)"
          tooltip="Inverse temperature of the primon gas. Its partition function is ζ(β), which diverges at β = 1 — the Hagedorn temperature of the arithmetic vacuum."
          value={config.beta}
          onChange={setBeta}
          min={R.beta.min}
          max={R.beta.max}
          step={0.01}
          data-testid="rz-beta-slider"
        />
        <Slider
          label="Dilation Flow"
          tooltip="Self-similar Berry–Keating flow x → e^(ct)·x: the prime shells stream outward across the horizon (render-only)."
          value={config.flowRate}
          onChange={setFlowRate}
          min={R.flowRate.min}
          max={R.flowRate.max}
          step={0.01}
          data-testid="rz-flow-slider"
        />
      </ControlGroup>

      <ControlGroup title="Horizon and Lobes" data-testid="rz-horizon-group">
        <Slider
          label="Horizon Radius"
          tooltip="Berry–Keating dilation horizon: a dark xp core with Tangherlini √f redshift; emission dims as shells approach it."
          value={config.horizonRadius}
          onChange={setHorizonRadius}
          min={R.horizonRadius.min}
          max={R.horizonRadius.max}
          step={0.01}
          data-testid="rz-horizon-slider"
        />
        <Slider
          label="Angular ℓ"
          tooltip="Real spherical-harmonic lobe factor on the first three dimensions. ℓ = 0 gives pure shells."
          value={config.angularL}
          onChange={setAngularL}
          min={R.angularL.min}
          max={R.angularL.max}
          step={1}
          data-testid="rz-angular-l-slider"
        />
        <Slider
          label="Angular m"
          tooltip="Magnetic number, clamped to ±ℓ."
          value={config.angularM}
          onChange={setAngularM}
          min={-mClamp}
          max={mClamp}
          step={1}
          disabled={mClamp === 0}
          data-testid="rz-angular-m-slider"
        />
        <Slider
          label="Glow"
          tooltip="Emission gain of the prime shells."
          value={config.glow}
          onChange={setGlow}
          min={R.glow.min}
          max={R.glow.max}
          step={0.05}
          data-testid="rz-glow-slider"
        />
        <Switch
          label="Cutaway Wedge"
          tooltip="Removes a quarter wedge so the interior prime shells read as a clean bullseye cross-section (render-only)."
          checked={config.cutaway}
          onCheckedChange={setCutaway}
          data-testid="rz-cutaway-switch"
        />
      </ControlGroup>

      <div className="text-xs text-secondary flex flex-col gap-0.5" data-testid="rz-readout">
        <span>
          Z(β) = {physics.partition.toFixed(2)} · Hagedorn gain = {physics.gain.toFixed(2)}
        </span>
        <span>
          {config.source === 'zeros'
            ? 'Shells reconstructed from the ζ zeros (explicit formula)'
            : 'Shells built forward from the primes (primon gas)'}
        </span>
      </div>
    </div>
  )
}
