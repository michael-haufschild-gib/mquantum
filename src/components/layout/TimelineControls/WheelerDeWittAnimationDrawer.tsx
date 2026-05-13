/**
 * WheelerDeWittAnimationDrawer Component
 *
 * Animation controls for Wheeler–DeWitt quantum cosmology visualization,
 * displayed in the TimelineControls bottom drawer.
 *
 * Both effects are render-only: they do NOT retrigger the solver.
 *
 * - Phase Rotation: visually rotates the phase-colored fringes at user-set
 *   angular velocity. The Wheeler–DeWitt equation is timeless by construction —
 *   |χ|² is unchanged; only the display phase is offset.
 * - Semiclassical Worldline: animates a Gaussian pulse travelling along each
 *   WKB streamline, visualizing a classical FRW+inflaton trajectory. Replaces
 *   the static streamline ridge while enabled.
 */

import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Slider } from '@/components/ui/Slider'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import {
  type ExtendedObjectState,
  useExtendedObjectStore,
} from '@/stores/scene/extendedObjectStore'

import { AnimationDrawerContainer } from './AnimationDrawerContainer'
import { DrawerSection } from './DrawerSection'

/**
 * Color algorithms whose output depends on the spatial-phase channel (B).
 * Wheeler–DeWitt phase rotation only modulates B; `relativePhase` reads A and
 * is unaffected by rotation, so it is intentionally absent from this set —
 * toggling rotation while on it would be a silent no-op.
 *
 * Includes every algorithm that reads `phase` inside its shader branch in
 * `emission.wgsl.ts`:
 *   - `phase` (3)               — direct hue shift.
 *   - `mixed` (4)               — `baseHSL.x + hueShift` with hueShift = (phase − 0.5·2π).
 *   - `phaseCyclicUniform` (6)  — `hueAngle = phase + π` feeds `cos / sin`.
 *   - `phaseDiverging` (7)      — signed `cos(phase)` carrier.
 *   - `domainColoringPsi` (8)   — full HSL wheel from `phaseNorm`.
 *   - `diverging` (9)           — `cos(phase) or sin(phase)` Re/Im picker.
 *   - `phaseDensity` (22)       — cosine-palette hue from `phaseNorm`.
 * Missing any one of these from the set causes the phase-rotation
 * toggle to silently auto-switch AWAY from a visually-responsive
 * algorithm (previous omissions: `mixed`, `diverging`), which is
 * indistinguishable to the user from a no-op bug.
 */
const PHASE_SENSITIVE_COLOR_ALGORITHMS = new Set([
  'phase',
  'mixed',
  'phaseCyclicUniform',
  'phaseDiverging',
  'domainColoringPsi',
  'diverging',
  'phaseDensity',
])

/** Default algorithm we switch TO when the user enables phase rotation. */
const DEFAULT_PHASE_ALGORITHM = 'phaseDiverging' as const

/** Props for the Wheeler–DeWitt animation configuration drawer. */
export interface WheelerDeWittAnimationDrawerProps {
  /** Callback to close the drawer */
  onClose?: () => void
}

/**
 * WheelerDeWittAnimationDrawer component.
 *
 * Renders the two render-only animation effects for Wheeler–DeWitt mode:
 * phase rotation and semiclassical worldline pulse. Neither effect alters
 * the solver output — toggling or tweaking them only re-packs the density
 * texture from the cached solution.
 *
 * @returns React component
 */
export const WheelerDeWittAnimationDrawer: React.FC<WheelerDeWittAnimationDrawerProps> = React.memo(
  ({ onClose }) => {
    const {
      wdw,
      setPhaseRotationEnabled,
      setPhaseRotationSpeed,
      setWorldlineEnabled,
      setWorldlineSpeed,
      setWorldlinePulseWidth,
    } = useExtendedObjectStore(
      useShallow((state: ExtendedObjectState) => ({
        wdw: state.schroedinger.wheelerDeWitt,
        setPhaseRotationEnabled: state.setWdwPhaseRotationEnabled,
        setPhaseRotationSpeed: state.setWdwPhaseRotationSpeed,
        setWorldlineEnabled: state.setWdwWorldlineEnabled,
        setWorldlineSpeed: state.setWdwWorldlineSpeed,
        setWorldlinePulseWidth: state.setWdwWorldlinePulseWidth,
      }))
    )

    const { colorAlgorithm, setColorAlgorithm } = useAppearanceStore(
      useShallow((s) => ({
        colorAlgorithm: s.colorAlgorithm,
        setColorAlgorithm: s.setColorAlgorithm,
      }))
    )

    // Phase rotation only modulates the phase channel. When the active color
    // algorithm doesn't consume phase, the effect is invisible — auto-switch
    // to a phase-sensitive palette on toggle-on so the user sees something.
    // Toggling off leaves the palette as-is (user may want to keep it).
    const handlePhaseRotationToggle = useCallback(
      (enabled: boolean) => {
        setPhaseRotationEnabled(enabled)
        if (enabled && !PHASE_SENSITIVE_COLOR_ALGORITHMS.has(colorAlgorithm)) {
          setColorAlgorithm(DEFAULT_PHASE_ALGORITHM)
        }
      },
      [setPhaseRotationEnabled, colorAlgorithm, setColorAlgorithm]
    )

    return (
      <AnimationDrawerContainer onClose={onClose} data-testid="wheelerdewitt-animation-drawer">
        <DrawerSection
          title="Phase Rotation"
          enabled={wdw.phaseRotationEnabled}
          onToggle={handlePhaseRotationToggle}
          toggleTooltip="Visual-only rotation of the phase-colored fringes. No physics change — |χ|² is unaffected; the Wheeler–DeWitt equation is timeless by construction. Automatically switches to a phase-sensitive color algorithm on enable."
          toggleAriaLabel="Toggle phase rotation"
          description="Rotates the phase hue at a user-set angular velocity. Requires a phase-sensitive color algorithm; auto-switches to Phase Diverging on enable if needed."
          testId="animation-panel-wdwPhaseRotation"
        >
          <Slider
            label="Speed"
            min={0}
            max={5}
            step={0.1}
            tooltip="Angular velocity of the phase rotation in rad/unit-time. 0 disables the effect without toggling off."
            value={wdw.phaseRotationSpeed}
            onChange={setPhaseRotationSpeed}
            showValue
          />
        </DrawerSection>

        <DrawerSection
          title="Semiclassical Worldline"
          enabled={wdw.worldlineEnabled}
          onToggle={setWorldlineEnabled}
          toggleTooltip="Animates a Gaussian pulse along each WKB streamline — a 'test universe' sliding along its classical FRW+inflaton trajectory. Replaces the static streamline ridge while enabled."
          toggleAriaLabel="Toggle worldline pulse"
          description="A Gaussian bump travels along each WKB streamline, tracing classical cosmological trajectories in the Lorentzian region."
          testId="animation-panel-wdwWorldline"
        >
          <Slider
            label="Speed"
            min={0.1}
            max={3}
            step={0.1}
            tooltip="Pulse cycles per unit time. 1.0 = one full sweep along the trajectory per unit of animation time."
            value={wdw.worldlineSpeed}
            onChange={setWorldlineSpeed}
            showValue
          />
          <Slider
            label="Pulse Width"
            min={0.02}
            max={0.3}
            step={0.01}
            tooltip="Gaussian width of the pulse in normalized trajectory-progress units. Narrower = a tighter, brighter ball; wider = a longer glowing smear along the path."
            value={wdw.worldlinePulseWidth}
            onChange={setWorldlinePulseWidth}
            showValue
          />
        </DrawerSection>
      </AnimationDrawerContainer>
    )
  }
)

WheelerDeWittAnimationDrawer.displayName = 'WheelerDeWittAnimationDrawer'

export default WheelerDeWittAnimationDrawer
