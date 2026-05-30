/**
 * Hook that drives the analog-Hawking Page-curve store from BEC diagnostics.
 *
 * Extracted from `HawkingPageCurvePanel` so the sampling loop is testable
 * in isolation (no SVG render, no drag state) and so the panel itself stays
 * focused on presentation.
 *
 * Responsibilities:
 *   1. Subscribe to the BEC diagnostics `readbackGeneration` counter.
 *   2. Convert waterfall params → horizon geometry (κ, T_H, c_s0, area).
 *   3. Dedupe per-generation pushes (HUD re-mounts must not replay samples).
 *   4. Reset the time anchor when the BEC mode / initial condition changes.
 *   5. Expose a synchronous horizon-context snapshot for empty-state UI.
 *
 * @module hooks/usePageCurveSampling
 */

import { useEffect, useMemo, useRef } from 'react'

import type { BecConfig } from '@/lib/geometry/extended/bec'
import type { ObjectType } from '@/lib/geometry/types'
import { horizonPlaneArea } from '@/lib/physics/bec/pageCurve'
import { asymptoticSoundSpeed, hasHorizon, hawkingReadout } from '@/lib/physics/bec/sonicHorizon'
import { buildWaterfallParams } from '@/lib/physics/bec/waterfallParams'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { usePageCurveStore } from '@/stores/diagnostics/pageCurveStore'

/** Inputs driving the sampling loop — all read via zustand selectors in the caller. */
export interface PageCurveSamplingInputs {
  enabled: boolean
  objectType: ObjectType
  quantumMode: string
  dimension: number
  bec: BecConfig
}

/** Synchronous view of horizon presence — drives the empty-state UI. */
export interface HorizonContext {
  /** True iff BEC mode is currently driving the Page-curve store. */
  isBec: boolean
  /** True iff the waterfall profile has a Mach-1 crossing. */
  horizonPresent: boolean
  /** Asymptotic sound speed c_s0 (for the empty-state tooltip). */
  cs0: number
}

function useWaterfallParams(bec: BecConfig) {
  return useMemo(
    () =>
      buildWaterfallParams({
        hawkingVmax: bec.hawkingVmax,
        hawkingLh: bec.hawkingLh,
        hawkingDeltaN: bec.hawkingDeltaN,
        interactionStrength: bec.interactionStrength,
        mass: bec.mass,
        gridSize: bec.gridSize,
        spacing: bec.spacing,
      }),
    [
      bec.hawkingVmax,
      bec.hawkingLh,
      bec.hawkingDeltaN,
      bec.interactionStrength,
      bec.mass,
      bec.gridSize,
      bec.spacing,
    ]
  )
}

function resolveHorizonContext(
  enabled: boolean,
  objectType: ObjectType,
  quantumMode: string,
  initialCondition: BecConfig['initialCondition'],
  becParams: ReturnType<typeof buildWaterfallParams>
): HorizonContext {
  const isBec =
    enabled &&
    objectType === 'schroedinger' &&
    quantumMode === 'becDynamics' &&
    initialCondition === 'blackHoleAnalog'
  if (!isBec) return { isBec, horizonPresent: false, cs0: 0 }
  const horizonPresent = hasHorizon(becParams)
  const cs0 = asymptoticSoundSpeed(becParams)
  return { isBec, horizonPresent, cs0 }
}

/**
 * Compute the synchronous horizon context without mutating the Page-curve
 * sample buffer. Visible HUD panels use this; `PageCurveSamplingGate` owns
 * the producer side so overlay sampling does not depend on panel visibility.
 */
export function usePageCurveHorizonContext(inputs: PageCurveSamplingInputs): HorizonContext {
  const { enabled, objectType, quantumMode, bec } = inputs
  const initialCondition = bec.initialCondition
  const becParams = useWaterfallParams(bec)
  return useMemo(
    () => resolveHorizonContext(enabled, objectType, quantumMode, initialCondition, becParams),
    [enabled, objectType, quantumMode, initialCondition, becParams]
  )
}

/**
 * Wire the Page-curve store to the BEC readback generation. Returns a
 * synchronous `HorizonContext` the caller can use for empty-state UX.
 *
 * The hook has two effects:
 *   - push effect: drives `usePageCurveStore.pushSample` whenever the BEC
 *     diagnostic generation advances (deduped by `lastPushedGenRef`).
 *   - reset effect: clears the store when the user switches BEC mode or
 *     initial condition (but not on simple HUD remount).
 *
 * @param inputs - Store snapshots (pre-selected by the caller).
 * @returns Synchronously evaluated horizon context for the empty-state UI.
 */
export function usePageCurveSampling(inputs: PageCurveSamplingInputs): HorizonContext {
  const { enabled, objectType, quantumMode, dimension, bec } = inputs
  const initialCondition = bec.initialCondition
  const becGen = useDiagnosticsStore((s) => s.bec.readbackGeneration)

  // Time-anchor refs: sentinel `null` ⇒ "set on next push".
  const genRefRef = useRef<number | null>(null)
  // Dedupe guard — without it, any dependency change re-runs the effect and
  // replays a sample for the same becGen, producing duplicate timestamps.
  const lastPushedGenRef = useRef<number | null>(null)
  // Guards the reset effect so a simple remount (HUD toggle, cinematic mode,
  // breakpoint flip) does not wipe an in-flight page curve.
  const didInitResetRef = useRef(false)

  const becParams = useWaterfallParams(bec)
  const horizonContext = useMemo(
    () => resolveHorizonContext(enabled, objectType, quantumMode, initialCondition, becParams),
    [enabled, objectType, quantumMode, initialCondition, becParams]
  )

  // Push effect — fires whenever BEC diagnostics advance.
  useEffect(() => {
    if (!enabled) return
    if (objectType !== 'schroedinger') return
    if (quantumMode !== 'becDynamics') return
    if (bec.initialCondition !== 'blackHoleAnalog') return
    if (lastPushedGenRef.current === becGen) return

    const horizonPresent = hasHorizon(becParams)
    const readout = hawkingReadout(becParams)
    const cs0 = asymptoticSoundSpeed(becParams)
    const areaH = horizonPlaneArea({
      gridSize: bec.gridSize,
      spacing: bec.spacing,
      horizonExists: horizonPresent,
    })
    // The supersonic region along axis 0 has extent 2·(L_box/2 - x_horizon) —
    // region |x| ≥ x_horizon within the box.
    const lBoxHalf = 0.5 * becParams.lBox
    const supersonicExtent = horizonPresent
      ? Math.max(0, 2 * (lBoxHalf - Math.abs(readout.horizonX0)))
      : 0
    const frameTime =
      (bec.dt ?? 0.002) * (bec.stepsPerFrame ?? 4) * Math.max(1, bec.diagnosticsInterval ?? 5)
    if (genRefRef.current === null) genRefRef.current = becGen
    const t = (becGen - genRefRef.current) * frameTime
    usePageCurveStore.getState().pushSample({
      t,
      tH: readout.hawkingTemperature,
      areaH,
      cs0,
      supersonicExtent,
    })
    lastPushedGenRef.current = becGen
  }, [
    enabled,
    objectType,
    quantumMode,
    bec.initialCondition,
    becParams,
    bec.gridSize,
    bec.spacing,
    bec.dt,
    bec.stepsPerFrame,
    bec.diagnosticsInterval,
    becGen,
    dimension,
  ])

  // Reset effect — clear on mode / initial-condition change, not on remount.
  useEffect(() => {
    if (!didInitResetRef.current) {
      didInitResetRef.current = true
      return
    }
    usePageCurveStore.getState().clear()
    genRefRef.current = null
    lastPushedGenRef.current = null
  }, [
    bec.initialCondition,
    quantumMode,
    objectType,
    becParams,
    bec.gridSize,
    bec.spacing,
    bec.dt,
    bec.stepsPerFrame,
    bec.diagnosticsInterval,
  ])

  return horizonContext
}
