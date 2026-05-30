import React, { Suspense } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { usePageCurveSampling } from '@/hooks/usePageCurveSampling'
import { useCarpetStore } from '@/stores/diagnostics/carpetStore'
import { usePageCurveStore } from '@/stores/diagnostics/pageCurveStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

const QuantumCarpetPanel = React.lazy(() =>
  import('@/components/canvas/QuantumCarpetPanel').then((m) => ({ default: m.QuantumCarpetPanel }))
)
const HawkingPageCurvePanel = React.lazy(() =>
  import('@/components/overlays/HawkingPageCurvePanel').then((m) => ({
    default: m.HawkingPageCurvePanel,
  }))
)
const WormholeCoherencePanel = React.lazy(() =>
  import('@/components/overlays/WormholeCoherencePanel').then((m) => ({
    default: m.WormholeCoherencePanel,
  }))
)

/**
 * Non-visual producer for Page-curve samples. The island overlay consumes
 * `lastIslandRadius` in the TDSE shader path, so sampling must continue even
 * when the visible HUD panel is closed, hidden by cinematic mode, or absent
 * on mobile.
 */
export function PageCurveSamplingGate() {
  const { pageCurveHudEnabled, islandOverlayEnabled } = usePageCurveStore(
    useShallow((s) => ({
      pageCurveHudEnabled: s.pageCurveHudEnabled,
      islandOverlayEnabled: s.islandOverlayEnabled,
    }))
  )
  const { dimension, objectType } = useGeometryStore(
    useShallow((s) => ({ dimension: s.dimension, objectType: s.objectType }))
  )
  const config = useExtendedObjectStore((s) => s.schroedinger)

  usePageCurveSampling({
    enabled: pageCurveHudEnabled || islandOverlayEnabled,
    objectType,
    quantumMode: config.quantumMode,
    dimension,
    bec: config.bec,
  })

  return null
}

/** Lazily gates optional HUD panels behind their store flags. */
export function HudPanelGates() {
  const carpetEnabled = useCarpetStore((s) => s.enabled)
  const pageCurveHudEnabled = usePageCurveStore((s) => s.pageCurveHudEnabled)
  const wormholeHudEnabled = useExtendedObjectStore(
    (s) => !!s.schroedinger?.tdse?.wormholeCoherenceHudEnabled
  )

  return (
    <>
      <PageCurveSamplingGate />

      {carpetEnabled && (
        <Suspense fallback={null}>
          <QuantumCarpetPanel />
        </Suspense>
      )}

      {pageCurveHudEnabled && (
        <Suspense fallback={null}>
          <HawkingPageCurvePanel />
        </Suspense>
      )}

      {wormholeHudEnabled && (
        <Suspense fallback={null}>
          <WormholeCoherencePanel />
        </Suspense>
      )}
    </>
  )
}
