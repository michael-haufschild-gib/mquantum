/**
 * PreheatingControls — UI for the post-inflation preheating drive on the
 * Free Scalar Field.
 *
 * Exposes the parametric-resonance sub-config that modulates the
 * effective Klein-Gordon mass as
 *
 *     m²_eff(η) = m₀² · (1 + A · sin(Ω · (η − η_ref)))
 *
 * turning each lattice mode's evolution into the Mathieu equation and
 * enabling exponential parametric amplification inside the Floquet
 * instability tongues. Composes multiplicatively with cosmology and
 * self-interaction, so there is no mutex with the other FSF branches —
 * the master toggle can be flipped in any configuration.
 *
 * See `src/lib/physics/cosmology/preheating.ts` for the CPU reference
 * integrator and the tests that anchor the first- and second-tongue
 * growth rates.
 */

import React from 'react'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type { PreheatingConfig } from '@/lib/geometry/extended/freeScalar'

import type { FreeScalarFieldActions } from './types'

/** Props for the preheating controls sub-panel. */
export interface PreheatingControlsProps {
  /** Current preheating sub-config (from `FreeScalarConfig.preheating`). */
  preheating: PreheatingConfig
  /** Current Klein-Gordon mass — drives the first-tongue resonance hint. */
  mass: number
  /** Store actions for the preheating sub-config. */
  actions: Pick<
    FreeScalarFieldActions,
    'setPreheatingEnabled' | 'setPreheatingAmplitude' | 'setPreheatingFrequency'
  >
}

/**
 * Sub-panel controlling the post-inflation preheating drive on the Free
 * Scalar Field mode. The master toggle lives in the panel's rightElement
 * so enabling/disabling the drive is a one-click action without expanding
 * the group.
 *
 * @param props - Component props
 * @returns React component
 */
export const PreheatingControls: React.FC<PreheatingControlsProps> = React.memo(
  ({ preheating, mass, actions }) => {
    // First-tongue resonance: Ω_res = 2·√(k² + m²) — for the k=0 mode this
    // collapses to Ω_res = 2·m. Surfacing the derived value next to the
    // frequency slider lets users dial the drive onto resonance without
    // mental arithmetic.
    const resonanceFreq = 2 * mass

    return (
      <ControlGroup
        title="Preheating / Parametric Resonance"
        collapsible
        defaultOpen={false}
        data-testid="control-group-fsf-preheating"
        rightElement={
          <Switch
            checked={preheating.enabled}
            onCheckedChange={actions.setPreheatingEnabled}
            ariaLabel="Toggle preheating"
            tooltip="Enable parametric-resonance preheating drive on the field mass"
            data-testid="preheating-toggle"
          />
        }
      >
        {preheating.enabled && (
          <>
            <Slider
              label="Amplitude (A)"
              tooltip="Drive amplitude in the effective mass modulation m²(η) = m²·(1 + A·sin(Ωη)). Larger A pushes deeper into the first instability tongue; μ ≈ A·m²/(4·ω) for the k=0 mode at first-tongue resonance."
              min={0}
              max={1}
              step={0.01}
              value={preheating.amplitude}
              onChange={actions.setPreheatingAmplitude}
              showValue
              data-testid="preheating-amplitude-slider"
            />
            <Slider
              label="Frequency (Ω)"
              tooltip="Drive angular frequency Ω. First instability tongue at Ω = 2·ω_k, second at Ω = ω_k. For the k=0 mode ω = m, so first tongue at Ω = 2·m."
              min={0.1}
              max={10}
              step={0.01}
              value={preheating.frequency}
              onChange={actions.setPreheatingFrequency}
              showValue
              data-testid="preheating-frequency-slider"
            />
            <div className="text-xs text-text-tertiary" data-testid="preheating-resonance-hint">
              Resonance: Ω = 2·m = {resonanceFreq.toFixed(2)} (k=0, first tongue)
            </div>
            <div className="text-xs text-text-tertiary italic">
              Mathieu equation δφ̈ + (k² + m²(1 + A·sin Ωη))·δφ = 0. The first tongue amplifies the
              zero mode at μ ≈ A·m²/(4·ω). Composes with cosmology and self-interaction.
            </div>
          </>
        )}
      </ControlGroup>
    )
  }
)

PreheatingControls.displayName = 'PreheatingControls'
