import { CropArea } from '@/stores/screenshotStore';
import { m, useMotionValue } from 'motion/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface ImageCropperProps {
  imageSrc: string;
  onCropChange: (crop: CropArea) => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, onCropChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Track if image has loaded (CRITICAL: must wait before syncing crop)
  const [imageLoaded, setImageLoaded] = useState(false);

  // Crop state (normalized 0-1 values)
  const [crop, setCrop] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });

  // Track container dimensions to normalize/denormalize
  const [bounds, setBounds] = useState({ width: 0, height: 0 });

  // Track if we're currently resizing - USE STATE not ref so drag prop updates
  const [isResizing, setIsResizing] = useState(false);

  // Motion values for drag (x/y transforms)
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Resize tracking refs (these don't need to trigger re-render)
  const activeHandle = useRef<string | null>(null);
  const startPos = useRef({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 });

  // Handle image load
  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  // Update bounds on resize
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
  }, []);

  // Sync crop to parent (convert normalized to pixel values)
  // CRITICAL: Only sync AFTER image has loaded to avoid 0-dimension crops
  useEffect(() => {
    if (!imgRef.current || !imageLoaded) return;

    const naturalWidth = imgRef.current.naturalWidth;
    const naturalHeight = imgRef.current.naturalHeight;

    // Safety check: don't sync if image dimensions are invalid
    if (naturalWidth === 0 || naturalHeight === 0) return;

    onCropChange({
      x: Math.round(crop.x * naturalWidth),
      y: Math.round(crop.y * naturalHeight),
      width: Math.round(crop.w * naturalWidth),
      height: Math.round(crop.h * naturalHeight),
    });
  }, [crop, onCropChange, imageLoaded]);

  // --- Drag Handler (Move the crop box) ---
  const onDragEnd = useCallback(() => {
    // Skip if resizing (shouldn't happen with drag disabled, but safety check)
    if (isResizing || bounds.width === 0) return;

    // Read the drag delta (pixels)
    const dxPx = x.get();
    const dyPx = y.get();

    // Convert to percentage
    const dx = dxPx / bounds.width;
    const dy = dyPx / bounds.height;

    // Update state (Clamp to bounds)
    setCrop((prev) => {
      const nx = Math.max(0, Math.min(1 - prev.w, prev.x + dx));
      const ny = Math.max(0, Math.min(1 - prev.h, prev.y + dy));
      return { ...prev, x: nx, y: ny };
    });

    // Reset motion values so the style takes over via state
    x.set(0);
    y.set(0);
  }, [bounds.width, bounds.height, isResizing, x, y]);

  // --- Resize Handlers ---
  const startResize = useCallback(
    (e: React.PointerEvent, handle: string) => {
      e.preventDefault();
      e.stopPropagation();

      // Set resizing state BEFORE motion can start drag
      setIsResizing(true);
      activeHandle.current = handle;

      startPos.current = {
        x: e.clientX,
        y: e.clientY,
        cropX: crop.x,
        cropY: crop.y,
        cropW: crop.w,
        cropH: crop.h,
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

      setCrop(() => {
        let { cropX: px, cropY: py, cropW: pw, cropH: ph } = s;
        const minVal = 0.05;

        // Apply delta based on which handle is active
        if (activeHandle.current?.includes('w')) {
          // West (Left edge)
          const maxDx = pw - minVal;
          const validDx = Math.min(dx, maxDx);
          const finalDx = Math.max(-px, validDx);
          px += finalDx;
          pw -= finalDx;
        }

        if (activeHandle.current?.includes('e')) {
          // East (Right edge)
          const maxW = 1 - px;
          const newW = Math.max(minVal, Math.min(maxW, pw + dx));
          pw = newW;
        }

        if (activeHandle.current?.includes('n')) {
          // North (Top edge)
          const maxDy = ph - minVal;
          const validDy = Math.min(dy, maxDy);
          const finalDy = Math.max(-py, validDy);
          py += finalDy;
          ph -= finalDy;
        }

        if (activeHandle.current?.includes('s')) {
          // South (Bottom edge)
          const maxH = 1 - py;
          const newH = Math.max(minVal, Math.min(maxH, ph + dy));
          ph = newH;
        }

        return { x: px, y: py, w: pw, h: ph };
      });
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
  }, [isResizing, bounds.width, bounds.height]);

  return (
    <div
      className="relative w-full h-full bg-[var(--bg-overlay)] overflow-hidden select-none flex items-center justify-center p-2 sm:p-4 md:p-8"
      data-testid="image-cropper"
    >
      <div ref={containerRef} className="relative inline-block shadow-2xl shadow-black group">
        <img
          ref={imgRef}
          src={imageSrc}
          alt="Preview"
          className="max-h-[45vh] sm:max-h-[55vh] md:max-h-[60vh] max-w-full object-contain block pointer-events-none"
          data-testid="crop-preview-image"
          onLoad={handleImageLoad}
        />

        {/* Overlay Darkener */}
        <div className="absolute inset-0 bg-[var(--bg-overlay)] pointer-events-none"></div>

        {/* CROP BOX - Only show after image loaded */}
        {imageLoaded && (
          <m.div
            className="absolute border border-border-strong box-content cursor-move"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`,
              height: `${crop.h * 100}%`,
              boxShadow: '0 0 0 9999px var(--bg-overlay)',
              x,
              y,
            }}
            // CRITICAL: Disable drag while resizing to prevent both behaviors
            drag={!isResizing}
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={containerRef}
            onDragEnd={onDragEnd}
            data-testid="crop-box"
          >
            {/* Rule of Thirds - Only visible on hover/drag */}
            <div className="absolute inset-0 flex flex-col pointer-events-none opacity-0 group-hover:opacity-40 transition-opacity">
              <div className="flex-1 border-b border-border-strong"></div>
              <div className="flex-1 border-b border-border-strong"></div>
              <div className="flex-1"></div>
            </div>
            <div className="absolute inset-0 flex pointer-events-none opacity-0 group-hover:opacity-40 transition-opacity">
              <div className="flex-1 border-r border-border-strong"></div>
              <div className="flex-1 border-r border-border-strong"></div>
              <div className="flex-1"></div>
            </div>

            {/* HANDLES - Larger on mobile for touch targets (44px minimum tap area) */}
            {[
              { id: 'nw', cursor: 'nw-resize', pos: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2' },
              { id: 'n', cursor: 'n-resize', pos: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2' },
              { id: 'ne', cursor: 'ne-resize', pos: 'top-0 right-0 translate-x-1/2 -translate-y-1/2' },
              { id: 'e', cursor: 'e-resize', pos: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2' },
              { id: 'se', cursor: 'se-resize', pos: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2' },
              { id: 's', cursor: 's-resize', pos: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2' },
              { id: 'sw', cursor: 'sw-resize', pos: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2' },
              { id: 'w', cursor: 'w-resize', pos: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2' },
            ].map((h) => (
              <div
                key={h.id}
                className={`absolute w-5 h-5 sm:w-3 sm:h-3 bg-white border border-border-default rounded-full z-20 hover:scale-125 active:scale-110 transition-transform touch-none ${h.pos}`}
                style={{ cursor: h.cursor }}
                onPointerDown={(e) => startResize(e, h.id)}
                data-testid={`crop-handle-${h.id}`}
              />
            ))}
          </m.div>
        )}
      </div>
    </div>
  );
};
