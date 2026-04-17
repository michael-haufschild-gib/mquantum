/**
 * HKLL (Stage 2B) sub-panel for the Anti-de Sitter controls.
 *
 * Rendered only when `ads.hkllEnabled` is on. Exposes:
 *   - Master enable toggle (handled by the parent `AntiDeSitterControls`).
 *   - Source-mode toggle: eigenstate / localized / planeWave.
 *   - Source-specific sliders:
 *       · localized → Gaussian width σ (radians).
 *       · planeWave → azimuthal m_b.
 *       · eigenstate → none (uses current n/ℓ/m/mL/branch).
 *   - Readout of the boundary sample count N_τ × N_Ω used by the HKLL
 *     convolution — exposes the CPU cost budget to the user for
 *     transparency.
 *
 * HKLL and BTZ are mutually exclusive (Stage 2B scope); the parent panel
 * also hides the BTZ controls and bound-state sliders while HKLL is on.
 *
 * @module components/sections/Geometry/SchroedingerControls/AntiDeSitterHkllControls
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { AdsHkllSource, AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import { defaultHkllParams, hkllSampleCount } from '@/lib/physics/antiDeSitter/hkll'
import { resolveDelta } from '@/lib/physics/antiDeSitter/math'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { ADS_LIMITS } from '@/stores/slices/geometry/setters/antiDeSitterSetters'

const SOURCE_OPTIONS: Array<{ value: AdsHkllSource; label: string }> = [
  { value: 'eigenstate', label: 'Eigenstate' },
  { value: 'localized', label: 'Localized' },
  { value: 'planeWave', label: 'Plane wave' },
]

/**
 * HKLL controls block, rendered beneath the master toggle when HKLL is on.
 *
 * @param props - Container props bundling the current AdS config so we
 *   don't subscribe to the extended store twice for shared fields.
 * @returns A React element with the source-mode toggle, dynamic sliders,
 *   and the sample-count readout.
 */
export const AntiDeSitterHkllControls: React.FC<{ ads: AntiDeSitterConfig }> = React.memo(
  ({ ads }) => {
    const { setSource, setSigma, setPlaneWaveM } = useExtendedObjectStore(
      useShallow((s) => ({
        setSource: s.setAdsHkllBoundarySource,
        setSigma: s.setAdsHkllSourceSigma,
        setPlaneWaveM: s.setAdsHkllPlaneWaveM,
      }))
    )

    const { d, mL, branch, hkllBoundarySource, hkllSourceSigma, hkllPlaneWaveM } = ads

    const sampleCountReadout = useMemo(() => {
      const { delta } = resolveDelta(d, mL, branch)
      const params = defaultHkllParams(d, delta)
      const nOmega = d <= 3 ? params.nPhi : params.nTheta * params.nPhi
      return {
        total: hkllSampleCount(params),
        nTau: params.nTau,
        nOmega,
      }
    }, [d, mL, branch])

    return (
      <div className="space-y-2" data-testid="ads-hkll-group">
        <ToggleGroup
          options={SOURCE_OPTIONS}
          value={hkllBoundarySource}
          onChange={(v) => setSource(v as AdsHkllSource)}
          ariaLabel="HKLL boundary source mode"
          tooltip="Eigenstate: derive O from the bulk state (validates reconstruction). Localized: Gaussian spot on the boundary → bulk beam. Plane wave: azimuthal standing wave → bulk pattern."
          fullWidth
          data-testid="ads-hkll-source-toggle"
        />
        {hkllBoundarySource === 'localized' && (
          <Slider
            label="Spot width σ"
            tooltip="Angular width of the Gaussian boundary excitation (radians). Small σ ⇒ tight bulk beam; large σ ⇒ diffuse bulk response."
            min={ADS_LIMITS.hkllSigmaMin}
            max={ADS_LIMITS.hkllSigmaMax}
            step={0.01}
            value={hkllSourceSigma}
            onChange={setSigma}
            showValue
            data-testid="ads-hkll-sigma-slider"
          />
        )}
        {hkllBoundarySource === 'planeWave' && (
          <Slider
            label="Plane-wave m_b"
            tooltip="Azimuthal quantum number of the boundary standing wave. Higher m_b ⇒ finer angular structure in the reconstructed bulk."
            min={ADS_LIMITS.hkllPlaneWaveMMin}
            max={ADS_LIMITS.hkllPlaneWaveMMax}
            step={1}
            value={hkllPlaneWaveM}
            onChange={setPlaneWaveM}
            showValue
            data-testid="ads-hkll-mb-slider"
          />
        )}
        <div
          className="rounded-md bg-white/5 border border-white/10 px-3 py-2 text-xs text-text-secondary space-y-1"
          data-testid="ads-hkll-readout"
        >
          <div>
            <span className="text-text-tertiary">HKLL points</span>{' '}
            <span className="font-mono">
              {sampleCountReadout.nTau} × {sampleCountReadout.nOmega} = {sampleCountReadout.total}
            </span>
          </div>
          {hkllBoundarySource === 'eigenstate' && (
            <div className="text-text-tertiary">
              Boundary source derived from the current (n, ℓ, m, mL, branch) bulk eigenstate.
              Reconstruction must reproduce the bulk to within numerical quadrature error.
            </div>
          )}
        </div>
      </div>
    )
  }
)

AntiDeSitterHkllControls.displayName = 'AntiDeSitterHkllControls'
