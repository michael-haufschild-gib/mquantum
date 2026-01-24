import { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore'
import React, { useEffect, useMemo, useRef } from 'react'
import { FPS_COLORS, getFpsColorLevel, type FpsColorLevel } from './utils'

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

      // Update FPS text only if changed
      if (state.fps !== prev.fps && fpsRef.current) {
        fpsRef.current.textContent = String(state.fps)
        prev.fps = state.fps
      }

      // Update frame time only if changed
      const newFrameTime = Math.round(state.frameTime * 10)
      const oldFrameTime = Math.round(prev.frameTime * 10)
      if (newFrameTime !== oldFrameTime && frameTimeRef.current) {
        frameTimeRef.current.textContent = state.frameTime.toFixed(1)
        prev.frameTime = state.frameTime
      }

      // Update sparkline path only if history changed
      if (sparklineRef.current && state.history.fps !== prevState.history.fps) {
        const data = state.history.fps
        if (data.length >= 2) {
          const width = 64
          const height = 20
          const minY = 0
          const maxY = 70
          const range = maxY - minY
          const stepX = width / (data.length - 1)

          const points = data
            .map((val, i) => {
              const x = i * stepX
              const normalizedY = Math.max(0, Math.min(1, (val - minY) / range))
              const y = height - normalizedY * height
              return `${x},${y}`
            })
            .join(' ')

          sparklineRef.current.setAttribute('d', `M ${points}`)
        }
      }

      // Update colors ONLY if color level changed
      const newColorLevel = getFpsColorLevel(state.fps)
      if (newColorLevel !== prev.colorLevel) {
        const color = FPS_COLORS[newColorLevel]

        if (indicatorRef.current) {
          indicatorRef.current.className = `relative inline-flex rounded-full h-2.5 w-2.5 ${color.bg}`
        }
        if (fpsContainerRef.current) {
          fpsContainerRef.current.className = `text-lg font-bold font-mono leading-none ${color.text}`
        }
        if (sparklineRef.current) {
          sparklineRef.current.setAttribute('stroke', color.stroke)
        }

        prev.colorLevel = newColorLevel
      }
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
    const data = initialState.history.fps
    if (data.length < 2) return ''
    const width = 64
    const height = 20
    const minY = 0
    const maxY = 70
    const range = maxY - minY
    const stepX = width / (data.length - 1)
    const points = data
      .map((val, i) => {
        const x = i * stepX
        const normalizedY = Math.max(0, Math.min(1, (val - minY) / range))
        const y = height - normalizedY * height
        return `${x},${y}`
      })
      .join(' ')
    return `M ${points}`
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
            className={`text-lg font-bold font-mono leading-none ${initialColor.text}`}
          >
            <span ref={fpsRef}>{initialState.fps}</span>
          </span>
          <span className="text-[9px] uppercase tracking-wider text-text-tertiary font-bold">
            FPS
          </span>
        </div>
      </div>

      <div className="w-px h-6 bg-[var(--bg-active)]" />

      <div className="w-16 h-6 flex items-center">
        <svg width={64} height={20} className="overflow-visible">
          <path
            ref={sparklineRef}
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
        <span className="text-[10px] font-mono text-text-secondary">
          <span ref={frameTimeRef}>{initialState.frameTime.toFixed(1)}</span>
        </span>
        <span className="text-[8px] text-text-tertiary">ms</span>
      </div>
    </div>
  )
})
