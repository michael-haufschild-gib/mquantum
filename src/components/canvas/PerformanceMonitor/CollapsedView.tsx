import React, { useEffect, useMemo, useRef } from 'react'

import { usePerformanceMetricsStore } from '@/stores/diagnostics/performanceMetricsStore'

import { computeSparklinePoints, FPS_COLORS, type FpsColorLevel, getFpsColorLevel } from './utils'

// ============================================================================
// DOM-update helpers (avoid cognitive complexity in the subscription callback)
// ============================================================================

type PrevValues = { fps: number; frameTime: number; colorLevel: FpsColorLevel | '' }

function updateFpsText(
  fps: number,
  prev: PrevValues,
  ref: React.RefObject<HTMLSpanElement | null>
): void {
  if (fps === prev.fps || !ref.current) return
  ref.current.textContent = String(fps)
  prev.fps = fps
}

function updateFrameTimeText(
  frameTime: number,
  prev: PrevValues,
  ref: React.RefObject<HTMLSpanElement | null>
): void {
  const newRounded = Math.round(frameTime * 10)
  const oldRounded = Math.round(prev.frameTime * 10)
  if (newRounded === oldRounded || !ref.current) return
  ref.current.textContent = frameTime.toFixed(1)
  prev.frameTime = frameTime
}

function updateSparklinePath(
  state: { history: { fps: number[] } },
  prevState: { history: { fps: number[] } },
  ref: React.RefObject<SVGPathElement | null>
): void {
  if (!ref.current || state.history.fps === prevState.history.fps) return
  const points = computeSparklinePoints(state.history.fps, 48, 16, 0, 70)
  if (points) ref.current.setAttribute('d', `M ${points}`)
}

function updateColorLevel(
  fps: number,
  prev: PrevValues,
  indicatorRef: React.RefObject<HTMLSpanElement | null>,
  fpsContainerRef: React.RefObject<HTMLSpanElement | null>,
  sparklineRef: React.RefObject<SVGPathElement | null>
): void {
  const level = getFpsColorLevel(fps)
  if (level === prev.colorLevel) return
  const color = FPS_COLORS[level]
  if (indicatorRef.current) {
    indicatorRef.current.className = `relative inline-flex rounded-full h-2.5 w-2.5 ${color.bg}`
  }
  if (fpsContainerRef.current) {
    fpsContainerRef.current.className = `text-base font-semibold font-mono leading-none tabular-nums ${color.text}`
  }
  if (sparklineRef.current) {
    sparklineRef.current.setAttribute('stroke', color.stroke)
  }
  prev.colorLevel = level
}

// ============================================================================
// COLLAPSED VIEW - Zero re-renders, updates via refs
// ============================================================================
export const CollapsedView = React.memo(function CollapsedView() {
  const fpsRef = useRef<HTMLSpanElement>(null)
  const frameTimeRef = useRef<HTMLSpanElement>(null)
  const sparklineRef = useRef<SVGPathElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const fpsContainerRef = useRef<HTMLSpanElement>(null)

  // Track previous values to avoid unnecessary DOM updates
  const prevValuesRef = useRef({
    fps: -1,
    frameTime: -1,
    colorLevel: '' as FpsColorLevel | '',
  })

  // Direct DOM updates via SELECTIVE subscription
  // Only fires when fps/frameTime/history changes (2Hz after throttle fix)
  useEffect(() => {
    const unsubscribe = usePerformanceMetricsStore.subscribe((state, prevState) => {
      // Early exit if none of the values we care about changed
      if (
        state.fps === prevState.fps &&
        state.frameTime === prevState.frameTime &&
        state.history.fps === prevState.history.fps
      ) {
        return
      }

      const prev = prevValuesRef.current
      updateFpsText(state.fps, prev, fpsRef)
      updateFrameTimeText(state.frameTime, prev, frameTimeRef)
      updateSparklinePath(state, prevState, sparklineRef)
      updateColorLevel(state.fps, prev, indicatorRef, fpsContainerRef, sparklineRef)
    })

    return unsubscribe
  }, [])

  // Initial render values
  const initialState = usePerformanceMetricsStore.getState()
  const initialColorLevel = getFpsColorLevel(initialState.fps)
  const initialColor = FPS_COLORS[initialColorLevel]

  // Set initial prev values
  prevValuesRef.current = {
    fps: initialState.fps,
    frameTime: initialState.frameTime,
    colorLevel: initialColorLevel,
  }

  // Compute initial sparkline path
  const initialPath = useMemo(() => {
    const pts = computeSparklinePoints(initialState.history.fps, 48, 16, 0, 70)
    return pts ? `M ${pts}` : ''
  }, [initialState.history.fps])

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 h-9">
      <div className="flex items-baseline gap-1.5">
        <span className="relative flex h-1.5 w-1.5 self-center">
          <span
            ref={indicatorRef}
            className={`relative inline-flex rounded-full h-1.5 w-1.5 ${initialColor.bg}`}
          />
        </span>
        <span
          ref={fpsContainerRef}
          data-testid="fps-value"
          className={`text-base font-semibold font-mono leading-none tabular-nums ${initialColor.text}`}
        >
          <span ref={fpsRef}>{initialState.fps}</span>
        </span>
        <span className="text-3xs uppercase tracking-wider text-text-tertiary font-medium">
          fps
        </span>
      </div>

      <div className="w-px h-4 bg-[var(--border-subtle)]" />

      <div className="w-12 h-4 flex items-center">
        <svg width={48} height={16} className="overflow-visible">
          <path
            ref={sparklineRef}
            data-testid="sparkline-path"
            d={initialPath}
            fill="none"
            stroke={initialColor.stroke}
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="flex items-baseline gap-1 min-w-[32px] justify-end">
        <span className="text-2xs font-mono text-text-secondary tabular-nums">
          <span ref={frameTimeRef}>{initialState.frameTime.toFixed(1)}</span>
        </span>
        <span className="text-4xs text-text-tertiary">ms</span>
      </div>
    </div>
  )
})
