import { useExportStore } from '@/stores/exportStore'
import { useLayoutStore } from '@/stores/layoutStore'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import { m, useMotionValue } from 'motion/react'
import { useShallow } from 'zustand/shallow'

export const CropEditor = () => {
  const { isCropEditorOpen, setCropEditorOpen, settings, updateSettings, setModalOpen } = useExportStore(
    useShallow((state) => ({
      isCropEditorOpen: state.isCropEditorOpen,
      setCropEditorOpen: state.setCropEditorOpen,
      settings: state.settings,
      updateSettings: state.updateSettings,
      setModalOpen: state.setModalOpen,
    }))
  )
  const setCinematicMode = useLayoutStore(state => state.setCinematicMode)

  // Destructure crop properties for stable useEffect dependencies
  const { x: cropX, y: cropY, width: cropWidth, height: cropHeight, enabled: cropEnabled } = settings.crop

  const [selection, setSelection] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Track if we're currently resizing - USE STATE so drag prop updates
  const [isResizing, setIsResizing] = useState(false)

  // Motion values for drag (x/y transforms)
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)

  // Track container dimensions
  const [bounds, setBounds] = useState({ width: 0, height: 0 })

  // Resize tracking refs
  const activeHandle = useRef<string | null>(null)
  const startPos = useRef({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 })

  // Update bounds on resize
  useEffect(() => {
    if (!containerRef.current) return
    const updateBounds = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setBounds({ width: rect.width, height: rect.height })
      }
    }

    updateBounds()
    const ro = new ResizeObserver(updateBounds)
    ro.observe(containerRef.current)

    return () => ro.disconnect()
  }, [isCropEditorOpen])

  // Initialize from store on open
  useEffect(() => {
    if (isCropEditorOpen) {
      if (cropEnabled && cropWidth > 0) {
        setSelection({ x: cropX, y: cropY, w: cropWidth, h: cropHeight })
      } else {
        setSelection({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
      }
      // Reset motion values
      dragX.set(0)
      dragY.set(0)
    }
  }, [isCropEditorOpen, cropX, cropY, cropWidth, cropHeight, cropEnabled, dragX, dragY])

  // --- Drag Handler (Move the crop box) ---
  const onDragEnd = useCallback(() => {
    if (isResizing || bounds.width === 0) return

    // Read the drag delta (pixels)
    const dxPx = dragX.get()
    const dyPx = dragY.get()

    // Convert to percentage
    const dx = dxPx / bounds.width
    const dy = dyPx / bounds.height

    // Update state (Clamp to bounds)
    setSelection((prev) => {
      const nx = Math.max(0, Math.min(1 - prev.w, prev.x + dx))
      const ny = Math.max(0, Math.min(1 - prev.h, prev.y + dy))
      return { ...prev, x: nx, y: ny }
    })

    // Reset motion values so the style takes over via state
    dragX.set(0)
    dragY.set(0)
  }, [bounds.width, bounds.height, isResizing, dragX, dragY])

  // --- Resize Handlers ---
  const startResize = useCallback(
    (e: ReactPointerEvent, handle: string) => {
      e.preventDefault()
      e.stopPropagation()

      setIsResizing(true)
      activeHandle.current = handle

      startPos.current = {
        x: e.clientX,
        y: e.clientY,
        cropX: selection.x,
        cropY: selection.y,
        cropW: selection.w,
        cropH: selection.h,
      }
    },
    [selection]
  )

  // Handle resize move with window-level listeners
  useEffect(() => {
    if (!isResizing) return

    const onResizeMove = (e: PointerEvent) => {
      if (!activeHandle.current || bounds.width === 0) return

      const dxPx = e.clientX - startPos.current.x
      const dyPx = e.clientY - startPos.current.y

      const dx = dxPx / bounds.width
      const dy = dyPx / bounds.height

      const s = startPos.current
      const minVal = 0.1

      setSelection(() => {
        let { cropX: px, cropY: py, cropW: pw, cropH: ph } = s

        // Apply delta based on which handle is active
        if (activeHandle.current?.includes('w')) {
          // West (Left edge)
          const maxDx = pw - minVal
          const validDx = Math.min(dx, maxDx)
          const finalDx = Math.max(-px, validDx)
          px += finalDx
          pw -= finalDx
        }

        if (activeHandle.current?.includes('e')) {
          // East (Right edge)
          const maxW = 1 - px
          const newW = Math.max(minVal, Math.min(maxW, pw + dx))
          pw = newW
        }

        if (activeHandle.current?.includes('n')) {
          // North (Top edge)
          const maxDy = ph - minVal
          const validDy = Math.min(dy, maxDy)
          const finalDy = Math.max(-py, validDy)
          py += finalDy
          ph -= finalDy
        }

        if (activeHandle.current?.includes('s')) {
          // South (Bottom edge)
          const maxH = 1 - py
          const newH = Math.max(minVal, Math.min(maxH, ph + dy))
          ph = newH
        }

        return { x: px, y: py, w: pw, h: ph }
      })
    }

    const onResizeEnd = () => {
      setIsResizing(false)
      activeHandle.current = null
    }

    window.addEventListener('pointermove', onResizeMove)
    window.addEventListener('pointerup', onResizeEnd)

    return () => {
      window.removeEventListener('pointermove', onResizeMove)
      window.removeEventListener('pointerup', onResizeEnd)
    }
  }, [isResizing, bounds.width, bounds.height])

  if (!isCropEditorOpen) return null

  const handleConfirm = () => {
    updateSettings({
      crop: {
        enabled: true,
        x: selection.x,
        y: selection.y,
        width: selection.w,
        height: selection.h
      }
    })
    setCropEditorOpen(false)
    setModalOpen(true)
    setCinematicMode(false)
  }

  const handleCancel = () => {
    setCropEditorOpen(false)
    setModalOpen(true)
    setCinematicMode(false)
  }

  // Aspect Ratio Helper
  const setRatio = (ratio: number) => {
    let w = selection.w
    let h = w / ratio
    if (h > 1) { h = 1; w = h * ratio }
    // Center it
    const x = (1 - w) / 2
    const y = (1 - h) / 2
    setSelection({ x, y, w, h })
  }

  // Handle definitions for resize
  const handles = [
    { id: 'nw', cursor: 'nw-resize', pos: '-top-1 -left-1', bracket: 'top-0 left-0 border-t-4 border-l-4 rounded-tl-sm' },
    { id: 'ne', cursor: 'ne-resize', pos: '-top-1 -right-1', bracket: 'top-0 right-0 border-t-4 border-r-4 rounded-tr-sm' },
    { id: 'sw', cursor: 'sw-resize', pos: '-bottom-1 -left-1', bracket: 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-sm' },
    { id: 'se', cursor: 'se-resize', pos: '-bottom-1 -right-1', bracket: 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-sm' },
  ]

  return (
    <div className="fixed inset-0 z-[100] flex flex-col pointer-events-auto overflow-hidden">
      {/* Toolbar */}
      <m.div
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="bg-[var(--bg-active)] backdrop-blur-xl p-4 flex justify-between items-center border-b border-border-default z-10"
      >
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/20 rounded-lg">
              <Icon name="crop" className="text-accent w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-text-primary text-sm">Crop Selection</span>
              <span className="text-[10px] text-text-tertiary uppercase tracking-widest">Cinematic Mode</span>
            </div>
          </div>

          <div className="h-8 w-px bg-[var(--bg-active)]" />

          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRatio(16 / 9)}>16:9</Button>
            <Button size="sm" variant="secondary" onClick={() => setRatio(9 / 16)}>9:16</Button>
            <Button size="sm" variant="secondary" onClick={() => setRatio(1)}>1:1</Button>
            <Button size="sm" variant="secondary" onClick={() => setRatio(4 / 5)}>4:5</Button>
            <Button size="sm" variant="secondary" onClick={() => setRatio(2.35)}>2.35:1</Button>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <Button variant="primary" onClick={handleConfirm} glow className="px-6">
            <Icon name="check" className="mr-2" />
            Confirm Area
          </Button>
        </div>
      </m.div>

      {/* Editor Area */}
      <div
        ref={containerRef}
        className="flex-1 relative cursor-crosshair overflow-hidden select-none"
      >
        {/* Dark Overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top */}
          <div className="absolute bg-[var(--bg-overlay)] backdrop-blur-[2px]" style={{ left: 0, top: 0, right: 0, height: `${selection.y * 100}%` }} />
          {/* Bottom */}
          <div className="absolute bg-[var(--bg-overlay)] backdrop-blur-[2px]" style={{ left: 0, bottom: 0, right: 0, height: `${(1 - (selection.y + selection.h)) * 100}%` }} />
          {/* Left */}
          <div className="absolute bg-[var(--bg-overlay)] backdrop-blur-[2px]" style={{ left: 0, top: `${selection.y * 100}%`, width: `${selection.x * 100}%`, height: `${selection.h * 100}%` }} />
          {/* Right */}
          <div className="absolute bg-[var(--bg-overlay)] backdrop-blur-[2px]" style={{ right: 0, top: `${selection.y * 100}%`, width: `${(1 - (selection.x + selection.w)) * 100}%`, height: `${selection.h * 100}%` }} />
        </div>

        {/* Selection Box with Motion Drag */}
        <m.div
          className="absolute border border-accent/50 shadow-[0_0_0_1px_var(--border-subtle),0_0_40px_var(--bg-overlay)] bg-transparent box-content cursor-move"
          style={{
            left: `${selection.x * 100}%`,
            top: `${selection.y * 100}%`,
            width: `${selection.w * 100}%`,
            height: `${selection.h * 100}%`,
            x: dragX,
            y: dragY,
          }}
          // CRITICAL: Disable drag while resizing to prevent both behaviors
          drag={!isResizing}
          dragMomentum={false}
          dragElastic={0}
          dragConstraints={containerRef}
          onDragEnd={onDragEnd}
        >
          {/* Edge Glow */}
          <div className="absolute inset-0 border-[4px] border-accent/10 pointer-events-none" />

          {/* Grid Lines (Rule of Thirds) */}
          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-border-default pointer-events-none" />
          <div className="absolute right-1/3 top-0 bottom-0 w-px bg-border-default pointer-events-none" />
          <div className="absolute top-1/3 left-0 right-0 h-px bg-border-default pointer-events-none" />
          <div className="absolute bottom-1/3 left-0 right-0 h-px bg-border-default pointer-events-none" />

          {/* Center Crosshair */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-px bg-accent/40 pointer-events-none" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-px bg-accent/40 pointer-events-none" />

          {/* Resize Handles - Corner Brackets with larger touch targets */}
          {handles.map((h) => (
            <div
              key={h.id}
              className={`absolute w-10 h-10 sm:w-8 sm:h-8 z-20 group touch-none ${h.pos}`}
              style={{ cursor: h.cursor }}
              onPointerDown={(e) => startResize(e, h.id)}
            >
              <div className={`absolute w-5 h-5 sm:w-4 sm:h-4 border-accent transition-transform group-hover:scale-110 group-active:scale-95 ${h.bracket}`} />
            </div>
          ))}

          {/* Dimensions Label */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-[var(--bg-overlay)] backdrop-blur-md text-text-primary text-[10px] px-3 py-1.5 rounded-full font-mono pointer-events-none whitespace-nowrap border border-border-default flex items-center gap-2">
            <Icon name="image" className="w-3 h-3 text-accent" />
            <span>{Math.round(selection.w * 100)}% × {Math.round(selection.h * 100)}%</span>
          </div>
        </m.div>
      </div>

      {/* Bottom Tip */}
      <m.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none"
      >
        <div className="bg-[var(--bg-overlay)] backdrop-blur-md px-4 py-2 rounded-full border border-border-default text-text-tertiary text-xs">
          Drag corners to resize • Drag center to move
        </div>
      </m.div>
    </div>
  )
}
