/**
 * Anti-de Sitter (Stage 1) controls panel.
 *
 * Exposes d / n / ℓ / m / mL sliders, quantization-branch and
 * boundary-overlay switches, a 15-item preset dropdown, and live readouts
 * for the conformal dimension Δ and energy E_{n,ℓ}. BF-bound violation and
 * KW-window fallback are flagged with inline chips.
 *
 * Time evolution (stable phase rotation at rate E, tachyon amplitude growth
 * at rate γ) runs in the volume raymarcher via the adsEnergy / adsGrowthRate
 * uniforms — this panel only configures the t=0 spatial envelope.
 *
 * TODO(Stage2): Add BTZ temperature slider, HKLL bulk-reconstruction
 * toggle, dS/CFT mode switch, Chern-Simons level, and tachyon amplitude
 * indicator.
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select, type SelectOption } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { AdsPresetName, AdsQuantizationBranch } from '@/lib/geometry/extended/antiDeSitter'
import {
  adsEnergy,
  isBelowBF,
  isInKWWindow,
  mSquaredL2,
  resolveDelta,
  tachyonGrowthRate,
} from '@/lib/physics/antiDeSitter/math'
import { ADS_PRESETS } from '@/lib/physics/antiDeSitter/presets'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { ADS_LIMITS } from '@/stores/slices/geometry/setters/antiDeSitterSetters'

import { AntiDeSitterBtzControls } from './AntiDeSitterBtzControls'
import { AntiDeSitterHkllControls } from './AntiDeSitterHkllControls'

const BRANCH_OPTIONS: Array<{ value: AdsQuantizationBranch; label: string }> = [
  { value: 'standard', label: 'Δ₊ (standard)' },
  { value: 'alternate', label: 'Δ₋ (alternate)' },
]

const PRESET_OPTIONS: SelectOption<AdsPresetName>[] = [
  ...ADS_PRESETS.map((p) => ({ value: p.id, label: p.label })),
  { value: 'custom', label: 'Custom' },
]

/**
 * Derived status-chip summary for the BF bound and KW quantization state.
 * Extracted into a standalone helper so the top-level component keeps its
 * cognitive complexity below the project's sonarjs threshold.
 *
 * @param d - Spacetime boundary dimension.
 * @param mL - Mass × AdS radius.
 * @param branch - Requested quantization branch.
 * @param growthRate - Tachyonic amplification rate γ.
 * @param isTachyon - Whether the state sits below the BF bound.
 * @param kwFallbackApplied - Whether the alternate branch fell back to Δ₊.
 * @returns A React fragment of status chips.
 */
function AdsStatusChips({
  d,
  mL,
  branch,
  growthRate,
  isTachyon,
  kwFallbackApplied,
}: {
  d: number
  mL: number
  branch: AdsQuantizationBranch
  growthRate: number
  isTachyon: boolean
  kwFallbackApplied: boolean
}): React.ReactElement {
  const bfTone = isTachyon ? 'red' : 'green'
  const bfLabel = isTachyon ? `Tachyon γ=${growthRate.toFixed(2)}` : 'BF OK'
  const bfTooltip = isTachyon
    ? `m²L² = ${mSquaredL2(mL).toFixed(2)} < −(d−1)²/4 = ${(-((d - 1) * (d - 1)) / 4).toFixed(2)}. The state amplifies in time as cosh(γt); the renderer multiplies |ψ|² by cosh²(γt) at render time.`
    : 'Breitenlohner-Freedman bound satisfied — state is normalisable.'

  const inKW = isInKWWindow(d, mL)
  const kwTone: 'green' | 'grey' = branch === 'alternate' && inKW ? 'green' : 'grey'
  const kwLabel = branch === 'alternate' ? (inKW ? 'KW window' : 'KW outside') : 'Δ₊ only'
  const kwTooltip =
    branch === 'alternate'
      ? inKW
        ? 'm²L² inside (−(d−1)²/4, −(d−1)²/4 + 1) — Δ₋ quantization is allowed.'
        : 'Alternate quantization unavailable — outside Klebanov-Witten window. Rendering uses Δ₊.'
      : 'Standard quantization active.'

  return (
    <div className="flex flex-wrap gap-1.5" data-testid="ads-status-chips">
      <Chip tone={bfTone} label={bfLabel} tooltip={bfTooltip} />
      <Chip tone={kwTone} label={kwLabel} tooltip={kwTooltip} />
      {kwFallbackApplied && (
        <Chip
          tone="yellow"
          label="Δ₋ unavailable"
          tooltip="Alternate quantization requested outside the KW window — silently rendering Δ₊."
        />
      )}
    </div>
  )
}

/**
 * Numerical readout of Δ, energy, and (if tachyonic) growth rate. Rendered
 * only while the bound-state path drives the density.
 *
 * @param effectiveDelta - Resolved Δ after KW fallback.
 * @param effectiveBranch - Resolved branch after KW fallback.
 * @param energy - E_{n,ℓ}(Δ).
 * @param isTachyon - Below-BF flag.
 * @param growthRate - Tachyon growth rate γ.
 * @returns A styled numerical readout block.
 */
function AdsReadout({
  effectiveDelta,
  effectiveBranch,
  energy,
  isTachyon,
  growthRate,
}: {
  effectiveDelta: number
  effectiveBranch: AdsQuantizationBranch
  energy: number
  isTachyon: boolean
  growthRate: number
}): React.ReactElement {
  return (
    <div
      className="rounded-md bg-white/5 border border-white/10 px-3 py-2 text-xs text-text-secondary space-y-1"
      data-testid="ads-readout"
    >
      <div>
        <span className="text-text-tertiary">Δ</span>{' '}
        <span className="font-mono">{effectiveDelta.toFixed(4)}</span>
        <span className="text-text-tertiary">
          {' '}
          ({effectiveBranch === 'standard' ? 'Δ₊' : 'Δ₋'})
        </span>
      </div>
      <div>
        <span className="text-text-tertiary">E_{`{n,ℓ}`}</span>{' '}
        <span className="font-mono">{energy.toFixed(4)}</span>
      </div>
      {isTachyon && (
        <div className="text-rose-300">
          γ = <span className="font-mono">{growthRate.toFixed(4)}</span>
          <span className="text-text-tertiary"> (|ψ|² grows as cosh²(γt))</span>
        </div>
      )}
    </div>
  )
}

/**
 * Inline status chip rendered inside the AdS controls for BF / KW indicators.
 *
 * @param tone Palette key: green (OK), yellow (warning), red (violation), grey (neutral).
 * @param label Short text shown inside the chip.
 * @param tooltip Hover text explaining the status in full.
 * @returns A styled span element carrying the status label.
 */
function Chip({
  tone,
  label,
  tooltip,
}: {
  tone: 'green' | 'yellow' | 'red' | 'grey'
  label: string
  tooltip: string
}): React.ReactElement {
  const palette = {
    green: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    yellow: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
    red: 'bg-rose-500/25 text-rose-200 border-rose-500/40',
    grey: 'bg-white/5 text-text-tertiary border-white/10',
  }[tone]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${palette}`}
      title={tooltip}
    >
      {label}
    </span>
  )
}

/**
 * Top-level AdS controls. Mounted inside the Quantum State section when
 * `quantumMode === 'antiDeSitter'`.
 */
export const AntiDeSitterControls: React.FC = React.memo(() => {
  const {
    ads,
    setDimension,
    setRadial,
    setAngular,
    setMagnetic,
    setMass,
    setBranch,
    setBoundary,
    setPreset,
    setHkllEnabled,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      ads: s.schroedinger.antiDeSitter,
      setDimension: s.setAdsDimension,
      setRadial: s.setAdsRadialQuantumNumber,
      setAngular: s.setAdsAngularQuantumNumber,
      setMagnetic: s.setAdsMagneticQuantumNumber,
      setMass: s.setAdsMassParameter,
      setBranch: s.setAdsQuantizationBranch,
      setBoundary: s.setAdsBoundaryOverlay,
      setPreset: s.setAdsPreset,
      setHkllEnabled: s.setAdsHkllEnabled,
    }))
  )

  const { d, n, l, m, mL, branch, boundaryOverlay, preset, btzEnabled, hkllEnabled } = ads
  // Split the panel's visibility into per-control flags so the UI surfaces
  // every slider that still affects the render:
  //   - (n, ℓ, m) feed the bulk eigenstate packer and the HKLL eigenstate
  //     source; hidden in BTZ and in non-eigenstate HKLL (dormant there).
  //   - mL feeds Δ in every mode: bound-state (via resolveDelta), BTZ (via
  //     btzScalarDelta), HKLL eigenstate/non-eigenstate (via resolveDelta
  //     → kernel expo = Δ − d). Always visible while AdS is active.
  //   - branch feeds Δ in bound-state and HKLL paths; BTZ's Δ uses |mL|
  //     only (branch is ignored), so hide it under BTZ.
  //   - boundaryOverlay only applies to the Stage-1 bound-state path.
  //   - BF/KW status chips reflect bound-state semantics; suppress them
  //     under BTZ (thermal state) and non-eigenstate HKLL (source-defined).
  const btzActive = btzEnabled && d === 3
  const hkllActive = hkllEnabled
  const hkllEigenstate = hkllActive && ads.hkllBoundarySource === 'eigenstate'

  const showQuantumNumbers = !btzActive && (!hkllActive || hkllEigenstate)
  const showMass = true
  const showBranch = !btzActive
  const showBoundaryOverlay = !btzActive && !hkllActive
  const showStatusChips = !btzActive && (!hkllActive || hkllEigenstate)
  const showReadout = showQuantumNumbers

  const { effectiveDelta, effectiveBranch, kwFallbackApplied, isTachyon, growthRate, energy } =
    useMemo(() => {
      const resolved = resolveDelta(d, mL, branch)
      return {
        effectiveDelta: resolved.delta,
        effectiveBranch: resolved.branch,
        kwFallbackApplied: resolved.kwFallbackApplied,
        isTachyon: isBelowBF(d, mL),
        growthRate: tachyonGrowthRate(d, mL),
        energy: adsEnergy(n, l, resolved.delta),
      }
    }, [d, mL, branch, n, l])

  // Clamp the m slider to a symmetric range that shrinks with ℓ.
  const magneticMax = Math.max(0, l)

  return (
    <div className="space-y-3" data-testid="anti-de-sitter-controls">
      <Select
        label="Preset"
        options={PRESET_OPTIONS}
        value={preset}
        onChange={setPreset}
        data-testid="ads-preset-select"
      />

      {showStatusChips && (
        <AdsStatusChips
          d={d}
          mL={mL}
          branch={branch}
          growthRate={growthRate}
          isTachyon={isTachyon}
          kwFallbackApplied={kwFallbackApplied}
        />
      )}

      <ControlGroup title="Dimensions & Quantum Numbers" collapsible defaultOpen>
        <Slider
          label="Dimension d"
          tooltip="Boundary dimension of AdS_d. d=3 ⇒ BTZ bulk (Stage 2 unlocks horizon); d=4 ⇒ canonical AdS₄/CFT₃; d=5 ⇒ Type-IIB SUGRA."
          min={ADS_LIMITS.dMin}
          max={ADS_LIMITS.dMax}
          step={1}
          value={d}
          onChange={setDimension}
          showValue
          data-testid="ads-d-slider"
        />
        {showQuantumNumbers && (
          <>
            <Slider
              label="Radial n"
              tooltip="Number of radial nodes. Energies rise by 2/L per unit n."
              min={ADS_LIMITS.nMin}
              max={ADS_LIMITS.nMax}
              step={1}
              value={n}
              onChange={setRadial}
              showValue
              data-testid="ads-n-slider"
            />
            <Slider
              label="Angular ℓ"
              tooltip="Angular momentum on the celestial sphere. Energies rise by 1/L per unit ℓ."
              min={ADS_LIMITS.lMin}
              max={ADS_LIMITS.lMax}
              step={1}
              value={l}
              onChange={setAngular}
              showValue
              data-testid="ads-l-slider"
            />
            {l > 0 && (
              <Slider
                label="Magnetic m"
                tooltip="Azimuthal component along the rendered z axis. Clamped to [−ℓ, +ℓ]."
                min={-magneticMax}
                max={magneticMax}
                step={1}
                value={m}
                onChange={setMagnetic}
                showValue
                data-testid="ads-m-slider"
              />
            )}
          </>
        )}
      </ControlGroup>

      {showMass && (
        <ControlGroup title="Mass & Quantization" collapsible defaultOpen>
          <Slider
            label="Mass mL"
            tooltip="Bulk mass in AdS-radius units. Always affects Δ in every mode (bound-state, BTZ, HKLL). Negative values encode imaginary mass; below BF ⇒ tachyonic."
            min={ADS_LIMITS.mLMin}
            max={ADS_LIMITS.mLMax}
            step={0.05}
            value={mL}
            onChange={setMass}
            showValue
            data-testid="ads-mL-slider"
          />
          {showBranch && (
            <ToggleGroup
              options={BRANCH_OPTIONS}
              value={branch}
              onChange={(v) => setBranch(v as AdsQuantizationBranch)}
              ariaLabel="Quantization branch"
              tooltip="Standard Δ₊ vs alternate Klebanov-Witten Δ₋. Alternate silently falls back when outside the KW window."
              fullWidth
              data-testid="ads-branch-toggle"
            />
          )}
          {showBoundaryOverlay && (
            <Switch
              label="Boundary overlay |O|²"
              checked={boundaryOverlay}
              onCheckedChange={setBoundary}
              data-testid="ads-boundary-overlay-switch"
            />
          )}
        </ControlGroup>
      )}

      {!btzActive && (
        <ControlGroup title="HKLL Bulk Reconstruction" collapsible defaultOpen>
          <Switch
            label="HKLL reconstruction"
            checked={hkllEnabled}
            onCheckedChange={setHkllEnabled}
            data-testid="ads-hkll-toggle"
          />
          {hkllEnabled && <AntiDeSitterHkllControls ads={ads} />}
        </ControlGroup>
      )}

      {d === 3 && !hkllActive && <AntiDeSitterBtzControls ads={ads} />}

      {showReadout && (
        <AdsReadout
          effectiveDelta={effectiveDelta}
          effectiveBranch={effectiveBranch}
          energy={energy}
          isTachyon={isTachyon}
          growthRate={growthRate}
        />
      )}
    </div>
  )
})

AntiDeSitterControls.displayName = 'AntiDeSitterControls'
