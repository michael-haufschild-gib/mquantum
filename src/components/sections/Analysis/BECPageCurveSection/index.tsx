/**
 * BEC Page Curve analysis section.
 *
 * Lives in the right panel's Analysis tab. Exposes the Page-curve / island
 * knobs (G_eff, Stefan–Boltzmann coefficient, island max-fraction, boost)
 * and HUD/overlay toggles. Shown as an `UnavailableSection` when the
 * current mode is not BEC Dynamics with the Analog Horizon initial
 * condition.
 *
 * @module components/sections/Analysis/BECPageCurveSection
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { DEFAULT_SB_COEFFICIENT } from '@/lib/physics/bec/pageCurve'
import { usePageCurveStore } from '@/stores/diagnostics/pageCurveStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const SECTION_TITLE = 'Page Curve & Island'

/**
 * Analysis section exposing Page-curve + island controls. Renders an
 * `UnavailableSection` placeholder when BEC Dynamics with the Analog
 * Horizon initial condition is not active, mirroring the visible-but-
 * disabled pattern used by other analysis sections.
 */
export function BECPageCurveSection() {
  const { quantumMode, initialCondition } = useExtendedObjectStore(
    useShallow((s) => ({
      quantumMode: s.schroedinger.quantumMode,
      initialCondition: s.schroedinger.bec?.initialCondition,
    }))
  )

  if (quantumMode !== 'becDynamics') {
    return (
      <UnavailableSection
        title={SECTION_TITLE}
        reason="Available in BEC Dynamics mode"
        data-testid="bec-page-curve-section-unavailable"
      />
    )
  }

  if (initialCondition !== 'blackHoleAnalog') {
    return (
      <UnavailableSection
        title={SECTION_TITLE}
        reason="Requires Analog Horizon initial condition"
        data-testid="bec-page-curve-section-unavailable"
      />
    )
  }

  return <BECPageCurveContent />
}

const BECPageCurveContent: React.FC = React.memo(() => {
  const {
    gEff,
    sbCoefficient,
    dMaxFrac,
    pageCurveHudEnabled,
    islandOverlayEnabled,
    islandBoost,
    setGEff,
    setSbCoefficient,
    setDMaxFrac,
    setPageCurveHudEnabled,
    setIslandOverlayEnabled,
    setIslandBoost,
  } = usePageCurveStore(
    useShallow((s) => ({
      gEff: s.gEff,
      sbCoefficient: s.sbCoefficient,
      dMaxFrac: s.dMaxFrac,
      pageCurveHudEnabled: s.pageCurveHudEnabled,
      islandOverlayEnabled: s.islandOverlayEnabled,
      islandBoost: s.islandBoost,
      setGEff: s.setGEff,
      setSbCoefficient: s.setSbCoefficient,
      setDMaxFrac: s.setDMaxFrac,
      setPageCurveHudEnabled: s.setPageCurveHudEnabled,
      setIslandOverlayEnabled: s.setIslandOverlayEnabled,
      setIslandBoost: s.setIslandBoost,
    }))
  )

  return (
    <Section title={SECTION_TITLE} data-testid="bec-page-curve-section">
      <Switch
        label="Show HUD panel"
        tooltip="Overlay the S_therm(t) and S_page(t) = min(S_therm, S_BH) traces. Page curve resolves the information paradox (Penington/Almheiri 2019-2020)."
        checked={pageCurveHudEnabled}
        onCheckedChange={setPageCurveHudEnabled}
        data-testid="bec-page-curve-hud-toggle"
      />
      <Switch
        label="Island overlay (3D + HUD)"
        tooltip="Paint the Page-curve island ball into the rendered density volume (and mark it in the HUD). Voxels inside the island are brightened by the Island boost slider and phase-shifted by π/4."
        checked={islandOverlayEnabled}
        onCheckedChange={setIslandOverlayEnabled}
        data-testid="bec-island-overlay-toggle"
      />
      <Slider
        label="Island boost"
        tooltip="Brightness multiplier applied to voxels inside the island in the 3D render. 1.0 = off, 4.0 = strong glow."
        value={islandBoost}
        onChange={setIslandBoost}
        min={1.0}
        max={4.0}
        step={0.05}
        data-testid="bec-island-boost"
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
    </Section>
  )
})

BECPageCurveContent.displayName = 'BECPageCurveContent'
