/**
 * Quantum Carpet Panel
 *
 * Displays a spacetime heatmap (position x time) of accumulated |psi(x,t)|^2
 * for dynamic quantum modes. The heatmap data comes from GPU readback
 * via CarpetSliceComputePass and is rendered to an HTML canvas with
 * CPU-side colormap application.
 *
 * Features:
 * - Draggable glass panel with opaque dark interior
 * - Header controls: axis, colormap, log scale, clear, close
 * - Color bar gradient strip
 * - Axis labels (CSS)
 * - Panel collision with sidebars (same as PerformanceMonitor)
 * - Hidden in cinematic mode and on mobile
 *
 * @module components/canvas/QuantumCarpetPanel
 */

import { m, useMotionValue } from 'motion/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Select } from '@/components/ui/Select'
import { ToggleButton } from '@/components/ui/ToggleButton'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { usePanelCollision } from '@/hooks/usePanelCollision'
import { getColormapLUT, paintCarpetToCanvas } from '@/lib/physics/colormaps'
import type { CarpetColormap } from '@/stores/diagnostics/carpetStore'
import { useCarpetStore } from '@/stores/diagnostics/carpetStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useLayoutStore } from '@/stores/ui/layoutStore'

// ── Constants ──
const PANEL_W = 480
const PANEL_H = 280
const CARPET_CANVAS_W = 400
const CARPET_CANVAS_H = 220
const COLORBAR_W = 16

const AXIS_OPTIONS = Array.from({ length: 3 }, (_, i) => ({
  value: String(i),
  label: `x${String.fromCharCode(0x2080 + i)}`,
}))

const COLORMAP_OPTIONS: { value: CarpetColormap; label: string }[] = [
  { value: 'viridis', label: 'Viridis' },
  { value: 'inferno', label: 'Inferno' },
  { value: 'magma', label: 'Magma' },
  { value: 'plasma', label: 'Plasma' },
]

/**
 * Inner panel content — only mounted when carpet is enabled.
 * Subscribes to fast-changing store values (writeHead, carpetData).
 */
const CarpetPanelInner: React.FC = React.memo(() => {
  const dimension = useGeometryStore((s) => s.dimension)

  const {
    sliceAxis,
    colormap,
    logScale,
    paused,
    totalFrames,
    historyLength,
    readbackWriteHead,
    readbackTotalFrames,
    carpetData,
    gridSize,
    setSliceAxis,
    setColormap,
    setLogScale,
    togglePaused,
    setEnabled,
    clear,
  } = useCarpetStore(
    useShallow((s) => ({
      sliceAxis: s.sliceAxis,
      colormap: s.colormap,
      logScale: s.logScale,
      paused: s.paused,
      totalFrames: s.totalFrames,
      historyLength: s.historyLength,
      readbackWriteHead: s.readbackWriteHead,
      readbackTotalFrames: s.readbackTotalFrames,
      carpetData: s.carpetData,
      gridSize: s.gridSize,
      setSliceAxis: s.setSliceAxis,
      setColormap: s.setColormap,
      setLogScale: s.setLogScale,
      togglePaused: s.togglePaused,
      setEnabled: s.setEnabled,
      clear: s.clear,
    }))
  )

  // Drag state — same anchor as PerformanceMonitor (top-20 left-4)
  // but offset to bottom-right by default
  const [isDragging, setIsDragging] = useState(false)
  const initializedRef = useRef(false)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  // Set initial position to bottom-right on first mount
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    // Anchor is top: 80px, left: 16px — offset to bottom-right
    const offsetX = window.innerWidth - PANEL_W - 16 - 16 // right edge minus panel width minus gaps
    const offsetY = window.innerHeight - PANEL_H - 80 - 96 // above timeline controls
    x.set(Math.max(0, offsetX))
    y.set(Math.max(0, offsetY))
  }, [x, y])

  usePanelCollision(x, y, PANEL_W, PANEL_H, isDragging)

  // Canvas refs
  const carpetCanvasRef = useRef<HTMLCanvasElement>(null)
  const colorBarCanvasRef = useRef<HTMLCanvasElement>(null)

  // Paint carpet to canvas when data changes
  useEffect(() => {
    const canvas = carpetCanvasRef.current
    if (!canvas || !carpetData) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    paintCarpetToCanvas(
      ctx,
      carpetData,
      gridSize,
      historyLength,
      readbackWriteHead,
      readbackTotalFrames,
      colormap,
      logScale
    )
  }, [
    carpetData,
    gridSize,
    historyLength,
    readbackWriteHead,
    readbackTotalFrames,
    colormap,
    logScale,
  ])

  // Paint color bar
  useEffect(() => {
    const canvas = colorBarCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const lut = getColormapLUT(colormap)
    const h = canvas.height
    const w = canvas.width
    const imageData = ctx.createImageData(w, h)
    const pixels = imageData.data

    for (let py = 0; py < h; py++) {
      const lutIdx = Math.round((1 - py / (h - 1)) * 255) * 4
      for (let px = 0; px < w; px++) {
        const base = (py * w + px) * 4
        pixels[base] = lut[lutIdx]!
        pixels[base + 1] = lut[lutIdx + 1]!
        pixels[base + 2] = lut[lutIdx + 2]!
        pixels[base + 3] = 255
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }, [colormap])

  const handleAxisChange = useCallback((v: string) => setSliceAxis(parseInt(v, 10)), [setSliceAxis])

  const handleColormapChange = useCallback(
    (v: string) => setColormap(v as CarpetColormap),
    [setColormap]
  )

  const handleClose = useCallback(() => setEnabled(false), [setEnabled])

  // Limit axis options to available dimensions (density grid is always 3D,
  // but for 3D wavefunctions all 3 axes are meaningful)
  const axisOptions = dimension < 3 ? AXIS_OPTIONS.slice(0, dimension) : AXIS_OPTIONS

  return (
    <m.div
      drag
      dragMomentum={false}
      style={{ x, y }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setTimeout(() => setIsDragging(false), 100)}
      className="absolute top-20 start-4 z-[45] pointer-events-auto select-none"
      data-testid="quantum-carpet-panel"
      data-carpet-frames={totalFrames}
    >
      <div
        className="flex flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-hard)]"
        style={{ width: PANEL_W }}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-2 px-3 py-1.5 glass-panel">
          <span className="text-xs font-medium text-primary/80 whitespace-nowrap">
            Quantum Carpet
          </span>
          <div className="flex items-center gap-1.5 ms-auto">
            <Select
              options={axisOptions}
              value={String(sliceAxis)}
              onChange={handleAxisChange}
              tooltip="Wavefunction axis sampled into the carpet"
              className="!w-16 !text-xs"
              data-testid="carpet-axis-select"
            />
            <Select
              options={COLORMAP_OPTIONS}
              value={colormap}
              onChange={handleColormapChange}
              tooltip="Colormap used for the carpet heatmap"
              className="!w-20 !text-xs"
              data-testid="carpet-colormap-select"
            />
            <ToggleButton
              pressed={logScale}
              onToggle={setLogScale}
              ariaLabel="Toggle log scale"
              tooltip="Use logarithmic intensity for the heatmap"
              className="!text-xs !px-1.5 !py-0.5"
              data-testid="carpet-log-toggle"
            >
              log
            </ToggleButton>
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePaused}
              ariaLabel={paused ? 'Resume' : 'Pause'}
              className="!p-1 !min-w-0"
              tooltip={paused ? 'Resume carpet accumulation' : 'Pause carpet accumulation'}
              data-testid="carpet-play-pause"
            >
              <Icon name={paused ? 'play' : 'pause'} size={10} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={clear}
              ariaLabel="Clear carpet"
              className="!p-1 !min-w-0"
              tooltip="Clear the accumulated carpet history"
              data-testid="carpet-clear"
            >
              <Icon name="reset" size={10} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              ariaLabel="Close carpet panel"
              className="!p-1 !min-w-0"
              tooltip="Close the quantum carpet panel"
              data-testid="carpet-close"
            >
              <Icon name="cross" size={10} />
            </Button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex bg-black/90 p-2 gap-1">
          {/* Carpet heatmap */}
          <div className="flex flex-col flex-1">
            <canvas
              ref={carpetCanvasRef}
              width={CARPET_CANVAS_W}
              height={CARPET_CANVAS_H}
              className="block rounded-sm"
              style={{ width: CARPET_CANVAS_W, height: CARPET_CANVAS_H }}
              data-testid="carpet-canvas"
            />
            {/* X-axis label */}
            <div className="flex justify-between mt-0.5 px-0.5">
              <span className="text-xs text-neutral-500">0</span>
              <span className="text-xs text-neutral-400">
                Position x{String.fromCharCode(0x2080 + sliceAxis)}
              </span>
              <span className="text-xs text-neutral-500">L</span>
            </div>
          </div>

          {/* Color bar */}
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs text-neutral-500">max</span>
            <canvas
              ref={colorBarCanvasRef}
              width={COLORBAR_W}
              height={CARPET_CANVAS_H}
              className="block rounded-sm"
              style={{ width: COLORBAR_W, height: CARPET_CANVAS_H }}
            />
            <span className="text-xs text-neutral-500">0</span>
          </div>

          {/* Y-axis label (time) */}
          <div className="flex flex-col justify-between items-center py-2">
            <span className="text-xs text-neutral-500 [writing-mode:vertical-rl]">old</span>
            <span className="text-xs text-neutral-400 [writing-mode:vertical-rl]">t</span>
            <span className="text-xs text-neutral-500 [writing-mode:vertical-rl]">new</span>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-3 py-1 bg-black/80 text-xs text-neutral-500">
          <span>Frames: {totalFrames}</span>
          <span>
            {totalFrames}/{historyLength}
          </span>
        </div>
      </div>
    </m.div>
  )
})

CarpetPanelInner.displayName = 'CarpetPanelInner'

/**
 * Quantum carpet spacetime diagram panel.
 * Thin gate component — only mounts the heavy inner panel when enabled
 * and visible (not cinematic, desktop only).
 *
 * @returns The carpet panel, or null when hidden
 *
 * @example
 * ```tsx
 * <QuantumCarpetPanel />
 * ```
 */
export const QuantumCarpetPanel: React.FC = React.memo(() => {
  const enabled = useCarpetStore((s) => s.enabled)
  const isCinematic = useLayoutStore((s) => s.isCinematicMode)
  const isDesktop = useIsDesktop()

  if (!enabled || isCinematic || !isDesktop) return null

  return <CarpetPanelInner />
})

QuantumCarpetPanel.displayName = 'QuantumCarpetPanel'
