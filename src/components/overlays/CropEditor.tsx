import { useExportStore } from '@/stores/exportStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { useShallow } from 'zustand/shallow';
import { CropBox, CropValues } from './CropBox';

/**
 * Full-screen crop editor for video export.
 * Uses shared CropBox component for the crop UI.
 */
export const CropEditor = () => {
  const { isCropEditorOpen, setCropEditorOpen, settings, updateSettings, setModalOpen } = useExportStore(
    useShallow((state) => ({
      isCropEditorOpen: state.isCropEditorOpen,
      setCropEditorOpen: state.setCropEditorOpen,
      settings: state.settings,
      updateSettings: state.updateSettings,
      setModalOpen: state.setModalOpen,
    }))
  );
  const setCinematicMode = useLayoutStore((state) => state.setCinematicMode);

  const containerRef = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<CropValues>({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });

  // Initialize from store on open
  useEffect(() => {
    if (isCropEditorOpen) {
      const { x, y, width, height, enabled } = settings.crop;
      if (enabled && width > 0) {
        setCrop({ x, y, width, height });
      } else {
        setCrop({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
      }
    }
  }, [isCropEditorOpen, settings.crop]);

  if (!isCropEditorOpen) return null;

  const handleConfirm = () => {
    updateSettings({
      crop: {
        enabled: true,
        x: crop.x,
        y: crop.y,
        width: crop.width,
        height: crop.height,
      },
    });
    setCropEditorOpen(false);
    setModalOpen(true);
    setCinematicMode(false);
  };

  const handleCancel = () => {
    setCropEditorOpen(false);
    setModalOpen(true);
    setCinematicMode(false);
  };

  // Aspect Ratio Helper
  const setRatio = (ratio: number) => {
    let w = crop.width;
    let h = w / ratio;
    if (h > 1) {
      h = 1;
      w = h * ratio;
    }
    const x = (1 - w) / 2;
    const y = (1 - h) / 2;
    setCrop({ x, y, width: w, height: h });
  };

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
      <div ref={containerRef} className="flex-1 relative cursor-crosshair overflow-hidden select-none">
        <CropBox containerRef={containerRef} crop={crop} onCropChange={setCrop} minSize={0.1} />
      </div>

      {/* Dimensions Label */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[var(--bg-overlay)] backdrop-blur-md text-text-primary text-[10px] px-3 py-1.5 rounded-full font-mono pointer-events-none whitespace-nowrap border border-border-default flex items-center gap-2 z-10">
        <Icon name="image" className="w-3 h-3 text-accent" />
        <span>{Math.round(crop.width * 100)}% × {Math.round(crop.height * 100)}%</span>
      </div>

      {/* Bottom Tip */}
      <m.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none z-10"
      >
        <div className="bg-[var(--bg-overlay)] backdrop-blur-md px-4 py-2 rounded-full border border-border-default text-text-tertiary text-xs">
          Drag corners to resize • Drag center to move
        </div>
      </m.div>
    </div>
  );
};
