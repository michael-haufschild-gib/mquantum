/** Preferred side for tooltip placement. */
export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'
/** Optional tooltip side accepted by positioning callers. */
export type TooltipPosition = TooltipSide | undefined
/** Viewport-space coordinate for a tooltip. */
export type TooltipPoint = { x: number; y: number }
/** Viewport dimensions used for deterministic positioning tests. */
export type TooltipViewport = { width: number; height: number }

export const TOOLTIP_VIEWPORT_MARGIN = 8

const TRIGGER_GAP = 8
const POINTER_OFFSET_X = 14

/** Compute non-overlapping tooltip coordinates, using pointer position when available. */
export function computeTooltipCoords(
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  position: TooltipPosition,
  pointerPoint: TooltipPoint | null = null,
  viewport: TooltipViewport = currentViewport()
): TooltipPoint {
  const preferredSide = position ?? 'top'
  const candidates = sideOrder(preferredSide).map((side) =>
    clampCoords(coordsForSide(side, triggerRect, tooltipRect, pointerPoint), tooltipRect, viewport)
  )
  const nonOccluding = candidates.find(
    (candidate) => !intersectsTrigger(candidate, tooltipRect, triggerRect)
  )
  return nonOccluding ?? candidates[0] ?? { x: TOOLTIP_VIEWPORT_MARGIN, y: TOOLTIP_VIEWPORT_MARGIN }
}

function currentViewport(): TooltipViewport {
  if (typeof window === 'undefined') return { width: 1024, height: 768 }
  return { width: window.innerWidth, height: window.innerHeight }
}

function sideOrder(preferredSide: TooltipSide): TooltipSide[] {
  switch (preferredSide) {
    case 'bottom':
      return ['bottom', 'top', 'right', 'left']
    case 'left':
      return ['left', 'right', 'bottom', 'top']
    case 'right':
      return ['right', 'left', 'bottom', 'top']
    case 'top':
    default:
      return ['top', 'bottom', 'right', 'left']
  }
}

function coordsForSide(
  side: TooltipSide,
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  pointerPoint: TooltipPoint | null
): TooltipPoint {
  if (pointerPoint) return pointerCoordsForSide(side, triggerRect, tooltipRect, pointerPoint)
  return triggerCoordsForSide(side, triggerRect, tooltipRect)
}

function pointerCoordsForSide(
  side: TooltipSide,
  triggerRect: DOMRect,
  tooltipRect: DOMRect,
  pointerPoint: TooltipPoint
): TooltipPoint {
  switch (side) {
    case 'top':
      return {
        x: pointerPoint.x + POINTER_OFFSET_X,
        y: triggerRect.top - tooltipRect.height - TRIGGER_GAP,
      }
    case 'bottom':
      return { x: pointerPoint.x + POINTER_OFFSET_X, y: triggerRect.bottom + TRIGGER_GAP }
    case 'left':
      return {
        x: triggerRect.left - tooltipRect.width - TRIGGER_GAP,
        y: pointerPoint.y - tooltipRect.height / 2,
      }
    case 'right':
      return { x: triggerRect.right + TRIGGER_GAP, y: pointerPoint.y - tooltipRect.height / 2 }
  }
}

function triggerCoordsForSide(
  side: TooltipSide,
  triggerRect: DOMRect,
  tooltipRect: DOMRect
): TooltipPoint {
  switch (side) {
    case 'top':
      return {
        x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        y: triggerRect.top - tooltipRect.height - TRIGGER_GAP,
      }
    case 'bottom':
      return {
        x: triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2,
        y: triggerRect.bottom + TRIGGER_GAP,
      }
    case 'left':
      return {
        x: triggerRect.left - tooltipRect.width - TRIGGER_GAP,
        y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
      }
    case 'right':
      return {
        x: triggerRect.right + TRIGGER_GAP,
        y: triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2,
      }
  }
}

function clampCoords(
  point: TooltipPoint,
  tooltipRect: DOMRect,
  viewport: TooltipViewport
): TooltipPoint {
  return {
    x: clamp(
      point.x,
      TOOLTIP_VIEWPORT_MARGIN,
      viewport.width - tooltipRect.width - TOOLTIP_VIEWPORT_MARGIN
    ),
    y: clamp(
      point.y,
      TOOLTIP_VIEWPORT_MARGIN,
      viewport.height - tooltipRect.height - TOOLTIP_VIEWPORT_MARGIN
    ),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function intersectsTrigger(
  point: TooltipPoint,
  tooltipRect: DOMRect,
  triggerRect: DOMRect
): boolean {
  return (
    point.x < triggerRect.right &&
    point.x + tooltipRect.width > triggerRect.left &&
    point.y < triggerRect.bottom &&
    point.y + tooltipRect.height > triggerRect.top
  )
}
