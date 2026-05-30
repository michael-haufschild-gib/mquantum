/**
 * HawkingPageCurvePanel
 *
 * Draggable HUD shell for the analog-Hawking Page-curve plot. Responsibilities:
 *   - Visibility gating (HUD toggle × cinematic mode × desktop viewport)
 *   - Drag + sidebar-collision state (matches `QuantumCarpetPanel`)
 *   - Composition of horizon context and {@link PageCurveSvg}
 *
 * Sampling is owned by `PageCurveSamplingGate` so the island overlay can keep
 * updating while the visible HUD is closed. SVG drawing lives in
 * `components/overlays/pageCurve/PageCurveSvg.tsx`. Keeping this file
 * focused on layout + drag leaves every piece testable in isolation.
 *
 * @module components/overlays/HawkingPageCurvePanel
 */

import { m, useMotionValue } from 'motion/react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { PageCurveSvg } from '@/components/overlays/pageCurve/PageCurveSvg'
import {
  buildPageCurveSnapshot,
  PAGE_CURVE_HEIGHT,
  PAGE_CURVE_WIDTH,
} from '@/components/overlays/pageCurve/snapshot'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { usePageCurveHorizonContext } from '@/hooks/usePageCurveSampling'
import { usePanelCollision } from '@/hooks/usePanelCollision'
import { usePageCurveStore } from '@/stores/diagnostics/pageCurveStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useLayoutStore } from '@/stores/ui/layoutStore'

/** Outer panel frame width in CSS px (includes padding for the SVG). */
const PANEL_W = PAGE_CURVE_WIDTH + 16
/** Outer panel frame height in CSS px (header + SVG + footer). */
const PANEL_H = PAGE_CURVE_HEIGHT + 64

/**
 * Heavy inner panel — only mounted when the HUD toggle is on, not in cinematic
 * mode, and on a desktop viewport. Owns drag state + sidebar-collision spring
 * offsets; delegates drawing to {@link PageCurveSvg}.
 */
const PageCurvePanelInner: React.FC = React.memo(() => {
  const enabled = usePageCurveStore((s) => s.pageCurveHudEnabled)
  const islandOverlayEnabled = usePageCurveStore((s) => s.islandOverlayEnabled)
  const dMaxFrac = usePageCurveStore((s) => s.dMaxFrac)
  const version = usePageCurveStore((s) => s.version)
  const bufferCount = usePageCurveStore((s) => s.buffer.count)
  const lastIslandRadius = usePageCurveStore((s) => s.lastIslandRadius)

  const config = useExtendedObjectStore((state) => state.schroedinger)
  const { dimension, objectType } = useGeometryStore(
    useShallow((s) => ({ dimension: s.dimension, objectType: s.objectType }))
  )
  const setPageCurveHudEnabled = usePageCurveStore((s) => s.setPageCurveHudEnabled)

  const bec = config.bec

  // Drag state + initial bottom-right position. Same convention as
  // QuantumCarpetPanel so both floating HUDs have the same behavior and
  // can't fight for the same pixels.
  const [isDragging, setIsDragging] = useState(false)
  const initializedRef = useRef(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const offsetX = window.innerWidth - PANEL_W - 16 - 16
    // Stacked above the Quantum Carpet panel so both fit on standard laptops.
    const offsetY = window.innerHeight - PANEL_H - 80 - 96 - 300
    x.set(Math.max(0, offsetX))
    y.set(Math.max(0, offsetY))
  }, [x, y])
  usePanelCollision(x, y, PANEL_W, PANEL_H, isDragging)

  const handleClose = useCallback(() => setPageCurveHudEnabled(false), [setPageCurveHudEnabled])

  // Sampling is driven by PageCurveSamplingGate; the visible panel only needs
  // synchronous horizon context for the empty-state UI.
  const horizonContext = usePageCurveHorizonContext({
    enabled,
    objectType,
    quantumMode: config.quantumMode,
    dimension,
    bec,
  })

  const snapshot = useMemo(() => {
    const store = usePageCurveStore.getState()
    return buildPageCurveSnapshot(store.buffer, bufferCount, store.lastSBH, version, () =>
      store.getPageTime()
    )
  }, [version, bufferCount])

  const showEmptyState = horizonContext.isBec && !horizonContext.horizonPresent

  return (
    <m.div
      drag
      dragMomentum={false}
      style={{ x, y }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setTimeout(() => setIsDragging(false), 100)}
      className="absolute top-20 start-4 z-[45] pointer-events-auto select-none"
      data-testid="hawking-page-curve-panel"
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-hard)]"
        style={{ width: PANEL_W }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 surface-panel">
          <span className="text-xs font-medium text-primary/80 whitespace-nowrap">
            Hawking Page Curve
          </span>
          <span className="text-xs text-neutral-500 ms-auto">
            S_BH&nbsp;
            {showEmptyState
              ? '—'
              : snapshot.hasData && snapshot.sBH > 0
                ? snapshot.sBH.toExponential(2)
                : '—'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            ariaLabel="Close Hawking Page Curve panel"
            className="!p-1 !min-w-0"
            tooltip="Close the Hawking Page Curve panel"
            data-testid="hawking-page-curve-close"
          >
            <Icon name="cross" size={10} />
          </Button>
        </div>
        <div className="bg-black/90 p-2">
          <PageCurveSvg
            snapshot={snapshot}
            horizonContext={horizonContext}
            islandOverlayEnabled={islandOverlayEnabled}
            lastIslandRadius={lastIslandRadius}
            dMaxFrac={dMaxFrac}
          />
        </div>
        <div className="flex items-center justify-between px-3 py-1 bg-black/80 text-xs text-neutral-500">
          <span>t_Page: {snapshot.tPage !== null ? snapshot.tPage.toFixed(3) : '—'}</span>
          <span>samples: {bufferCount}</span>
        </div>
      </div>
    </m.div>
  )
})

PageCurvePanelInner.displayName = 'PageCurvePanelInner'

/**
 * Page curve + island-formula HUD overlay for the analog Hawking BEC.
 * Thin gate that mounts the heavy inner panel only when enabled, not in
 * cinematic mode, and on a desktop viewport — same contract as
 * {@link QuantumCarpetPanel}.
 *
 * @returns The panel, or null when hidden.
 */
export const HawkingPageCurvePanel: React.FC = React.memo(() => {
  const enabled = usePageCurveStore((s) => s.pageCurveHudEnabled)
  const isCinematic = useLayoutStore((s) => s.isCinematicMode)
  const isDesktop = useIsDesktop()
  if (!enabled || isCinematic || !isDesktop) return null
  return <PageCurvePanelInner />
})

HawkingPageCurvePanel.displayName = 'HawkingPageCurvePanel'
