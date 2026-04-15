/**
 * BECPageCurveControls
 *
 * Collapsible sub-section inside the BEC sidebar. Lets the user tune the
 * Page-curve analysis knobs (G_eff, Stefan–Boltzmann coefficient, island
 * max-fraction) and toggle the overlay HUD.
 *
 * @module components/sections/Geometry/SchroedingerControls/BECPageCurveControls
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { DEFAULT_SB_COEFFICIENT } from '@/lib/physics/bec/pageCurve'
import { usePageCurveStore } from '@/stores/pageCurveStore'

/**
 * Page-curve + island knobs. Rendered under the main BEC controls when the
 * `blackHoleAnalog` initial condition is selected (gated by caller).
 */
export const BECPageCurveControls: React.FC = React.memo(() => {
  const {
    gEff,
    sbCoefficient,
    dMaxFrac,
    pageCurveHudEnabled,
    islandOverlayEnabled,
    setGEff,
    setSbCoefficient,
    setDMaxFrac,
    setPageCurveHudEnabled,
    setIslandOverlayEnabled,
  } = usePageCurveStore(
    useShallow((s) => ({
      gEff: s.gEff,
      sbCoefficient: s.sbCoefficient,
      dMaxFrac: s.dMaxFrac,
      pageCurveHudEnabled: s.pageCurveHudEnabled,
      islandOverlayEnabled: s.islandOverlayEnabled,
      setGEff: s.setGEff,
      setSbCoefficient: s.setSbCoefficient,
      setDMaxFrac: s.setDMaxFrac,
      setPageCurveHudEnabled: s.setPageCurveHudEnabled,
      setIslandOverlayEnabled: s.setIslandOverlayEnabled,
    }))
  )

  return (
    <ControlGroup
      title="Page Curve & Island"
      collapsible
      defaultOpen={false}
      data-testid="control-group-bec-page-curve"
    >
      <Switch
        label="Show HUD panel"
        tooltip="Overlay the S_therm(t) and S_page(t) = min(S_therm, S_BH) traces. Page curve resolves the information paradox (Penington/Almheiri 2019-2020)."
        checked={pageCurveHudEnabled}
        onCheckedChange={setPageCurveHudEnabled}
        data-testid="bec-page-curve-hud-toggle"
      />
      <Switch
        label="Island overlay (HUD marker)"
        tooltip="Mark the island radius d*(t) inside the HUD. GPU density integration is deferred — the radius is logged and rendered on the HUD only."
        checked={islandOverlayEnabled}
        onCheckedChange={setIslandOverlayEnabled}
        data-testid="bec-island-overlay-toggle"
      />
      <Slider
        label="G_eff"
        tooltip="Effective Newton constant. S_BH = A_h / (4·G_eff). Smaller G_eff → larger S_BH → later Page time."
        value={gEff}
        onChange={setGEff}
        min={0.01}
        max={10}
        step={0.01}
        data-testid="bec-page-geff"
      />
      <Slider
        label="Stefan–Boltzmann coeff"
        tooltip={`Prefactor in dS_therm/dt = c · T_H³ · A_h / c_s0². Default ${DEFAULT_SB_COEFFICIENT.toFixed(4)} = 4π²/45.`}
        value={sbCoefficient}
        onChange={setSbCoefficient}
        min={0.01}
        max={10}
        step={0.01}
        data-testid="bec-page-sb"
      />
      <Slider
        label="d*_max fraction"
        tooltip="Upper bound on the island ball as a fraction of the supersonic region extent."
        value={dMaxFrac}
        onChange={setDMaxFrac}
        min={0}
        max={1}
        step={0.01}
        data-testid="bec-page-dmax"
      />
    </ControlGroup>
  )
})

BECPageCurveControls.displayName = 'BECPageCurveControls'
