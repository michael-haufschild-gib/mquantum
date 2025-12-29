import { m, useMotionValue } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface CropValues {
  x: number;      // 0-1
  y: number;      // 0-1
  width: number;  // 0-1
  height: number; // 0-1
}

interface CropBoxProps {
  /** Container ref for drag constraints */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Current crop values (normalized 0-1) */
  crop: CropValues;
  /** Callback when crop changes */
  onCropChange: (crop: CropValues) => void;
  /** Minimum crop size (0-1), default 0.05 */
  minSize?: number;
}

/**
 * Reusable crop box component with drag handles.
 * Used by both ScreenshotModal (inline) and CropEditor (full-screen).
 */
export const CropBox = ({
  containerRef,
  crop,
  onCropChange,
  minSize = 0.05,
}: CropBoxProps) => {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [isResizing, setIsResizing] = useState(false);

  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);

  const activeHandle = useRef<string | null>(null);
  const startPos = useRef({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 });

  // Update bounds on container resize
  useEffect(() => {
    if (!containerRef.current) return;
    const updateBounds = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setBounds({ width: rect.width, height: rect.height });
      }
    };

    updateBounds();
    const ro = new ResizeObserver(updateBounds);
    ro.observe(containerRef.current);

    return () => ro.disconnect();
  }, [containerRef]);

  // Drag handler
  const onDragEnd = useCallback(() => {
    if (isResizing || bounds.width === 0) return;

    const dxPx = dragX.get();
    const dyPx = dragY.get();

    const dx = dxPx / bounds.width;
    const dy = dyPx / bounds.height;

    const nx = Math.max(0, Math.min(1 - crop.width, crop.x + dx));
    const ny = Math.max(0, Math.min(1 - crop.height, crop.y + dy));

    onCropChange({ ...crop, x: nx, y: ny });

    dragX.set(0);
    dragY.set(0);
  }, [bounds.width, bounds.height, isResizing, dragX, dragY, crop, onCropChange]);

  // Resize start
  const startResize = useCallback(
    (e: React.PointerEvent, handle: string) => {
      e.preventDefault();
      e.stopPropagation();

      setIsResizing(true);
      activeHandle.current = handle;

      startPos.current = {
        x: e.clientX,
        y: e.clientY,
        cropX: crop.x,
        cropY: crop.y,
        cropW: crop.width,
        cropH: crop.height,
      };
    },
    [crop]
  );

  // Handle resize move
  useEffect(() => {
    if (!isResizing) return;

    const onResizeMove = (e: PointerEvent) => {
      if (!activeHandle.current || bounds.width === 0) return;

      const dxPx = e.clientX - startPos.current.x;
      const dyPx = e.clientY - startPos.current.y;

      const dx = dxPx / bounds.width;
      const dy = dyPx / bounds.height;

      const s = startPos.current;
      let { cropX: px, cropY: py, cropW: pw, cropH: ph } = s;

      if (activeHandle.current.includes('w')) {
        const maxDx = pw - minSize;
        const validDx = Math.min(dx, maxDx);
        const finalDx = Math.max(-px, validDx);
        px += finalDx;
        pw -= finalDx;
      }

      if (activeHandle.current.includes('e')) {
        const maxW = 1 - px;
        pw = Math.max(minSize, Math.min(maxW, pw + dx));
      }

      if (activeHandle.current.includes('n')) {
        const maxDy = ph - minSize;
        const validDy = Math.min(dy, maxDy);
        const finalDy = Math.max(-py, validDy);
        py += finalDy;
        ph -= finalDy;
      }

      if (activeHandle.current.includes('s')) {
        const maxH = 1 - py;
        ph = Math.max(minSize, Math.min(maxH, ph + dy));
      }

      onCropChange({ x: px, y: py, width: pw, height: ph });
    };

    const onResizeEnd = () => {
      setIsResizing(false);
      activeHandle.current = null;
    };

    window.addEventListener('pointermove', onResizeMove);
    window.addEventListener('pointerup', onResizeEnd);

    return () => {
      window.removeEventListener('pointermove', onResizeMove);
      window.removeEventListener('pointerup', onResizeEnd);
    };
  }, [isResizing, bounds.width, bounds.height, minSize, onCropChange]);

  // Corner bracket handles (video editor style)
  const handles = [
    { id: 'nw', cursor: 'nw-resize', pos: '-top-1 -left-1', bracket: 'top-0 left-0 border-t-4 border-l-4 rounded-tl-sm' },
    { id: 'ne', cursor: 'ne-resize', pos: '-top-1 -right-1', bracket: 'top-0 right-0 border-t-4 border-r-4 rounded-tr-sm' },
    { id: 'sw', cursor: 'sw-resize', pos: '-bottom-1 -left-1', bracket: 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-sm' },
    { id: 'se', cursor: 'se-resize', pos: '-bottom-1 -right-1', bracket: 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-sm' },
  ];

  return (
    <m.div
      className="absolute border border-accent/50 shadow-[0_0_0_1px_var(--border-subtle),0_0_40px_var(--bg-overlay)] bg-transparent box-content cursor-move"
      style={{
        left: `${crop.x * 100}%`,
        top: `${crop.y * 100}%`,
        width: `${crop.width * 100}%`,
        height: `${crop.height * 100}%`,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
        x: dragX,
        y: dragY,
      }}
      drag={!isResizing}
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={containerRef}
      onDragEnd={onDragEnd}
      data-testid="crop-box"
    >
      {/* Edge Glow */}
      <div className="absolute inset-0 border-[4px] border-accent/10 pointer-events-none" />

      {/* Rule of Thirds Grid */}
      <div className="absolute left-1/3 top-0 bottom-0 w-px bg-border-default pointer-events-none" />
      <div className="absolute right-1/3 top-0 bottom-0 w-px bg-border-default pointer-events-none" />
      <div className="absolute top-1/3 left-0 right-0 h-px bg-border-default pointer-events-none" />
      <div className="absolute bottom-1/3 left-0 right-0 h-px bg-border-default pointer-events-none" />

      {/* Center Crosshair */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-px bg-accent/40 pointer-events-none" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-4 w-px bg-accent/40 pointer-events-none" />

      {/* Corner Bracket Handles */}
      {handles.map((h) => (
        <div
          key={h.id}
          className={`absolute w-10 h-10 sm:w-8 sm:h-8 z-20 group touch-none ${h.pos}`}
          style={{ cursor: h.cursor }}
          onPointerDown={(e) => startResize(e, h.id)}
          data-testid={`crop-handle-${h.id}`}
        >
          <div className={`absolute w-5 h-5 sm:w-4 sm:h-4 border-accent transition-transform group-hover:scale-110 group-active:scale-95 ${h.bracket}`} />
        </div>
      ))}
    </m.div>
  );
};
