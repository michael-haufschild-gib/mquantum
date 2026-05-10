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
  const points = computeSparklinePoints(state.history.fps, 64, 20, 0, 70)
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
    fpsContainerRef.current.className = `text-lg font-bold font-mono leading-none ${color.text}`
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
    const pts = computeSparklinePoints(initialState.history.fps, 64, 20, 0, 70)
    return pts ? `M ${pts}` : ''
  }, [initialState.history.fps])

  return (
    <div className="flex items-center gap-4 px-4 py-2 h-12">
      <div className="flex items-center gap-3">
        <div className="relative flex h-2.5 w-2.5">
          <span
            ref={indicatorRef}
            className={`relative inline-flex rounded-full h-2.5 w-2.5 ${initialColor.bg}`}
          />
        </div>
        <div className="flex flex-col">
          <span
            ref={fpsContainerRef}
            data-testid="fps-value"
            className={`text-lg font-bold font-mono leading-none ${initialColor.text}`}
          >
            <span ref={fpsRef}>{initialState.fps}</span>
          </span>
          <span className="text-xs uppercase tracking-wider text-text-tertiary font-bold">FPS</span>
        </div>
      </div>

      <div className="w-px h-6 bg-[var(--bg-active)]" />

      <div className="w-16 h-6 flex items-center">
        <svg width={64} height={20} className="overflow-visible">
          <path
            ref={sparklineRef}
            data-testid="sparkline-path"
            d={initialPath}
            fill="none"
            stroke={initialColor.stroke}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="flex flex-col items-end min-w-[32px]">
        <span className="text-xs font-mono text-text-secondary">
          <span ref={frameTimeRef}>{initialState.frameTime.toFixed(1)}</span>
        </span>
        <span className="text-[8px] text-text-tertiary">ms</span>
      </div>
    </div>
  )
})
