/**
 * BTZ (Stage 2A) sub-panel for the Anti-de Sitter controls.
 *
 * Rendered only when `ads.d === 3` so the toggle label truthfully maps
 * onto the current dimension. Exposes:
 *   - Master enable toggle.
 *   - Outer horizon radius r₊ slider.
 *   - Scalar-mode angular frequency ω slider.
 *   - Azimuthal BTZ m_A integer slider.
 *   - Derived readouts for T_H, S_BH, M (no sliders — these are
 *     mathematical functions of r₊ and G_N).
 *
 * When BTZ is on the parent panel hides the bound-state (n, ℓ, m, mL,
 * branch) sliders — they describe a mutually-exclusive state, and the
 * UI must not lead the user to think they affect the thermal render.
 *
 * @module components/sections/Geometry/SchroedingerControls/AntiDeSitterBtzControls
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type { AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import {
  btzEntropy,
  btzMass,
  btzTemperature,
  DEFAULT_BTZ_G_NEWTON,
} from '@/lib/physics/antiDeSitter/btz'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { ADS_LIMITS } from '@/stores/slices/geometry/setters/antiDeSitterSetters'

/**
 * BTZ controls block. The `ads` prop is passed in from the parent so the
 * common d/n/l/m slider block and this block share a single subscription.
 *
 * @param props - Container props bundling the current AdS config and the
 *   setter bundle.
 * @returns A React element rendering the BTZ toggle, sliders, and readouts.
 */
export const AntiDeSitterBtzControls: React.FC<{ ads: AntiDeSitterConfig }> = React.memo(
  ({ ads }) => {
    const { setEnabled, setHorizon, setOmega, setAngularM } = useExtendedObjectStore(
      useShallow((s) => ({
        setEnabled: s.setAdsBtzEnabled,
        setHorizon: s.setAdsBtzHorizonRadius,
        setOmega: s.setAdsBtzOmega,
        setAngularM: s.setAdsBtzAngularM,
      }))
    )

    const { btzEnabled, btzHorizonRadius, btzOmega, btzAngularM } = ads
    const L = 1
    const T = btzTemperature(btzHorizonRadius, L)
    const S = btzEntropy(btzHorizonRadius, DEFAULT_BTZ_G_NEWTON)
    const M = btzMass(btzHorizonRadius, DEFAULT_BTZ_G_NEWTON, L)

    return (
      <ControlGroup
        title="BTZ Thermal State (AdS₃ BH)"
        collapsible
        defaultOpen
        data-testid="ads-btz-group"
      >
        <Switch
          label="BTZ thermal state (AdS₃ BH)"
          checked={btzEnabled}
          onCheckedChange={setEnabled}
          data-testid="ads-btz-toggle"
        />
        {btzEnabled && (
          <>
            <Slider
              label="Horizon r₊"
              tooltip="Outer horizon radius r₊ in AdS-length units. Larger r₊ grows T_H, S_BH, M and the visible horizon scale. The thermal profile in dimensionless ρ_w is a geometric invariant of BTZ in L=1 units, so only the horizon scale and thermodynamic readouts track r₊. Spec range [0.05, 2.0]."
              min={ADS_LIMITS.btzHorizonMin}
              max={ADS_LIMITS.btzHorizonMax}
              step={0.01}
              value={btzHorizonRadius}
              onChange={setHorizon}
              showValue
              data-testid="ads-btz-r-slider"
            />
            <Slider
              label="Frequency ω"
              tooltip="Scalar-mode angular frequency ω in 1/L units. Sets the reference energy for the Tolman-redshifted Bose population."
              min={ADS_LIMITS.btzOmegaMin}
              max={ADS_LIMITS.btzOmegaMax}
              step={0.01}
              value={btzOmega}
              onChange={setOmega}
              showValue
              data-testid="ads-btz-omega-slider"
            />
            <Slider
              label="Azimuthal m_A"
              tooltip="Integer azimuthal quantum number on BTZ's S¹. Controls the angular-harmonic structure of |ψ|²."
              min={ADS_LIMITS.btzAngularMMin}
              max={ADS_LIMITS.btzAngularMMax}
              step={1}
              value={btzAngularM}
              onChange={setAngularM}
              showValue
              data-testid="ads-btz-mA-slider"
            />
            <div
              className="rounded-md bg-white/5 border border-white/10 px-3 py-2 text-xs text-text-secondary space-y-1"
              data-testid="ads-btz-readout"
            >
              <div>
                <span className="text-text-tertiary">T_H</span>{' '}
                <span className="font-mono">{T.toFixed(4)}</span>
                <span className="text-text-tertiary"> (= r₊ / 2πL²)</span>
              </div>
              <div>
                <span className="text-text-tertiary">S_BH</span>{' '}
                <span className="font-mono">{S.toFixed(4)}</span>
                <span className="text-text-tertiary"> (= π r₊ / 2G_N)</span>
              </div>
              <div>
                <span className="text-text-tertiary">M</span>{' '}
                <span className="font-mono">{M.toFixed(4)}</span>
                <span className="text-text-tertiary"> (= r₊² / 8G_N L²)</span>
              </div>
            </div>
          </>
        )}
      </ControlGroup>
    )
  }
)

AntiDeSitterBtzControls.displayName = 'AntiDeSitterBtzControls'
