import React, { Suspense } from 'react'

import { useCarpetStore } from '@/stores/diagnostics/carpetStore'
import { usePageCurveStore } from '@/stores/diagnostics/pageCurveStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

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

/** Lazily gates optional HUD panels behind their store flags. */
export function HudPanelGates() {
  const carpetEnabled = useCarpetStore((s) => s.enabled)
  const pageCurveHudEnabled = usePageCurveStore((s) => s.pageCurveHudEnabled)
  const wormholeHudEnabled = useExtendedObjectStore(
    (s) => !!s.schroedinger?.tdse?.wormholeCoherenceHudEnabled
  )

  return (
    <>
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
