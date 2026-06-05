/**
 * TDSE write-grid island-overlay field injection for the analog Hawking BEC.
 *
 * The island-overlay toggle, brightness, and latest radius live in
 * `usePageCurveStore`; the horizon centroid (x₀ in world units) is derived
 * from the current BEC slice via `hawkingReadout`. This module packages the
 * "fold those signals into the TDSE config" step into a pure function so it
 * is testable without mounting the renderer or subscribing to the store.
 *
 * Separation of concerns:
 *   - {@link computeIslandOverlayFields} — pure. Given explicit snapshots it
 *     returns the `(enabled, centerX0, radius, boost)` bundle.
 *   - {@link applyIslandOverlay} — thin wrapper that reads the live store
 *     state and passes it to the pure function. Consumed by
 *     `TdseBecStrategy.executeFrame`.
 *
 * @module rendering/webgpu/renderers/strategies/tdseIslandOverlay
 */

import type { BecConfig } from '@/lib/geometry/extended/bec'
import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import { hawkingReadout } from '@/lib/physics/bec/sonicHorizon'
import { buildWaterfallParams } from '@/lib/physics/bec/waterfallParams'
import { usePageCurveStore } from '@/stores/diagnostics/pageCurveStore'

/** Island-overlay snapshot as read from the page-curve store. */
export interface IslandOverlaySnapshot {
  islandOverlayEnabled: boolean
  lastIslandRadius: number
  islandBoost: number
}

/** Fields the write-grid shader consumes to render the island halo. */
export interface IslandOverlayFields {
  islandOverlayEnabled: true
  islandCenterX0: number
  islandRadiusWs: number
  islandBoost: number
}

/**
 * Resolve island-overlay fields from explicit inputs.
 *
 * Returns `null` when any precondition fails (overlay disabled, wrong BEC
 * initial condition, non-finite / non-positive radius, missing horizon).
 * The caller either spreads the returned bundle into the config or leaves
 * the config unchanged — the shader no-ops on zero radius.
 *
 * @param bec - Current BEC configuration slice.
 * @param snapshot - Island-overlay state from the page-curve store.
 * @returns Island overlay fields or null when overlay is inactive.
 */
export function computeIslandOverlayFields(
  bec: BecConfig,
  snapshot: IslandOverlaySnapshot
): IslandOverlayFields | null {
  if (!snapshot.islandOverlayEnabled) return null
  if (bec.initialCondition !== 'blackHoleAnalog') return null
  const r = snapshot.lastIslandRadius
  if (!Number.isFinite(r) || r <= 0) return null
  const wf = buildWaterfallParams(bec)
  const readout = hawkingReadout(wf)
  if (!Number.isFinite(readout.horizonX0)) return null
  return {
    islandOverlayEnabled: true,
    islandCenterX0: readout.horizonX0,
    islandRadiusWs: r,
    islandBoost: snapshot.islandBoost,
  }
}

/**
 * Inject the analog-Hawking quantum-extremal island overlay fields into a
 * per-frame TDSE config when the overlay is active. Reads the live
 * `usePageCurveStore` state; see {@link computeIslandOverlayFields} for the
 * pure, store-free core.
 *
 * @param config - base TDSE config built for this frame.
 * @param bec - BEC slice from the extended store (source of horizon geometry).
 * @returns Either the original config or a spread copy with island fields set.
 */
export function applyIslandOverlay(config: TdseConfig, bec: BecConfig): TdseConfig {
  const pc = usePageCurveStore.getState()
  const fields = computeIslandOverlayFields(bec, {
    islandOverlayEnabled: pc.islandOverlayEnabled,
    lastIslandRadius: pc.lastIslandRadius,
    islandBoost: pc.islandBoost,
  })
  if (!fields) return config
  return { ...config, ...fields }
}
