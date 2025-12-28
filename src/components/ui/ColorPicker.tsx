import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Popover } from './Popover';
import {
  parseColorToHsv, hsvToHex, hsvToHex8, hsvToRgb, isValidHex, rgbToHex, generatePalette,
  type HSVA
} from '@/lib/colors/colorUtils';

interface ColorPickerProps {
  value: string; // Hex, Hex8, or RGB string
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  alpha?: number; // External alpha control
  onChangeAlpha?: (alpha: number) => void; // Handler for alpha changes
  disableAlpha?: boolean; // If true, hide alpha controls and force alpha=1
}

type ColorMode = 'HEX' | 'RGB' | 'CSS';

const HISTORY_KEY = 'mdimension_color_history';
const MAX_HISTORY = 8;

export const ColorPicker: React.FC<ColorPickerProps> = ({
  value,
  onChange,
  label,
  className = '',
  disabled = false,
  alpha,
  onChangeAlpha,
  disableAlpha = false,
}) => {
  // --- State ---
  const [hsv, setHsv] = useState<HSVA>({ h: 0, s: 0, v: 0, a: 1 });
  const [mode, setMode] = useState<ColorMode>('HEX');
  const [history, setHistory] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [initialColor, setInitialColor] = useState(value); // For comparison

  // Local inputs
  const [hexInput, setHexInput] = useState(value);
  const [rgbInput, setRgbInput] = useState({ r: 0, g: 0, b: 0, a: 1 });

  // Initialize History
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch (error) {
      // Log localStorage errors for debugging, but don't crash the picker
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('ColorPicker: localStorage quota exceeded');
      } else {
        console.error('ColorPicker: failed to load color history', error);
      }
    }
  }, []);

  const addToHistory = (color: string) => {
    setHistory(prev => {
      const filtered = prev.filter(c => c !== color);
      const newHistory = [color, ...filtered].slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      return newHistory;
    });
  };

  // Sync Prop -> State
  useEffect(() => {
    const newHsv = parseColorToHsv(value);
    
    // Override alpha if prop provided or disabled
    if (disableAlpha) {
      newHsv.a = 1;
    } else if (alpha !== undefined) {
      newHsv.a = alpha;
    }

    // Update if color changed OR alpha prop changed substantially
    // Note: Comparing `value` prop to current state is tricky with alpha separation.
    // We trust the props.
    
    setHsv(newHsv);
    setHexInput(newHsv.a === 1 ? hsvToHex(newHsv.h, newHsv.s, newHsv.v) : hsvToHex8(newHsv.h, newHsv.s, newHsv.v, newHsv.a)); 
    setRgbInput(hsvToRgb(newHsv.h, newHsv.s, newHsv.v, newHsv.a));
    
  }, [value, alpha, disableAlpha]);

  // On Open -> Capture Initial
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setInitialColor(value);
    } else {
      addToHistory(value);
    }
  };

  // --- Internal Updates ---
  const updateExternal = useCallback((newHsv: HSVA) => {
    let output: string;
    
    // Enforce disableAlpha
    if (disableAlpha) newHsv.a = 1;

    // Handle Alpha Output
    if (onChangeAlpha) {
      onChangeAlpha(newHsv.a);
      // If we handle alpha separately, the main `onChange` usually expects purely the color part?
      // Or should it receive Hex8 if alpha < 1?
      // Convention: if onChangeAlpha is present, assume parent handles them separately (like FacesSection)
      // So we output Hex6 to onChange to keep Three.js happy.
      output = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
    } else {
      // Standard mode: Combine them
      if (newHsv.a === 1) {
        output = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
      } else {
        output = hsvToHex8(newHsv.h, newHsv.s, newHsv.v, newHsv.a);
      }
    }
    
    onChange(output);
    return output;
  }, [onChange, onChangeAlpha, disableAlpha]);

  const handleHsvChange = useCallback((newHsv: HSVA) => {
    setHsv(newHsv);
    updateExternal(newHsv);
    
    // Update local inputs
    // We display what we emitted, mostly. But if alpha is handled separately,
    // we might want to still show it in the UI input?
    // Yes, the UI should reflect the *state* `newHsv`.
    const displayHex = newHsv.a === 1 ? hsvToHex(newHsv.h, newHsv.s, newHsv.v) : hsvToHex8(newHsv.h, newHsv.s, newHsv.v, newHsv.a);
    setHexInput(displayHex);
    setRgbInput(hsvToRgb(newHsv.h, newHsv.s, newHsv.v, newHsv.a));
  }, [updateExternal]);

  // --- Interactions ---
  const svRef = useRef<HTMLDivElement>(null);
  const [isDraggingSV, setIsDraggingSV] = useState(false);

  const updateSV = useCallback((clientX: number, clientY: number) => {
    if (!svRef.current) return;
    const rect = svRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    handleHsvChange({ ...hsv, s: x, v: 1 - y });
  }, [hsv, handleHsvChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (isDraggingSV) updateSV(e.clientX, e.clientY); };
    const onUp = () => setIsDraggingSV(false);
    if (isDraggingSV) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingSV, updateSV]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // --- EyeDropper ---
  const handleEyedropper = async () => {
    if (!window.EyeDropper) return;
    try {
      const dropper = new window.EyeDropper();
      const result = await dropper.open();
      handleHsvChange(parseColorToHsv(result.sRGBHex));
    } catch (error) {
      // AbortError is expected when user cancels the eyedropper
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('ColorPicker: EyeDropper error', error);
      }
    }
  };

  // --- Copy ---
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      console.error('ColorPicker: Clipboard write failed', error);
    }
  };

  // --- Palette ---
  const palette = generatePalette(hsv.h, hsv.s, hsv.v);

  // --- Visual Assets ---
  // Noise pattern for "premium" feel
  const noiseBg = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`;
  const checkerboard = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==";

  // --- Render ---
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && <span className="text-xs font-medium text-text-secondary select-none">{label}</span>}
      
      <Popover
        open={isOpen}
        onOpenChange={handleOpenChange}
        offset={8}
        trigger={
          <div className={`flex items-center gap-2 group p-1 rounded-md hover:bg-[var(--bg-hover)] transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            {/* Trigger Swatch */}
            <div className="relative w-8 h-5 rounded overflow-hidden shadow-sm ring-1 ring-border-default group-hover:ring-border-strong transition-all">
              <div className="absolute inset-0 z-0" style={{ backgroundImage: `url(${checkerboard})`, opacity: 0.4 }} />
              <div className="absolute inset-0 z-10" style={{ backgroundColor: value }} />
            </div>
            {/* Hex Text */}
            <span className="text-xs font-mono text-text-tertiary group-hover:text-text-primary transition-colors">
              {value}
            </span>
          </div>
        }
        content={
          <div className="w-[260px] p-3 flex flex-col gap-3 select-none text-text-primary">
            {/* 1. Header: Compare + Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 bg-[var(--bg-hover)] rounded-full p-0.5 border border-border-subtle">
                {/* Compare Swatch */}
                <div className="relative w-12 h-6 rounded-full overflow-hidden flex cursor-help" title="Original vs New">
                   <div className="absolute inset-0 -z-10" style={{ backgroundImage: `url(${checkerboard})`, opacity: 0.4 }} />
                   <div className="w-1/2 h-full" style={{ backgroundColor: initialColor }} />
                   <div className="w-1/2 h-full" style={{ backgroundColor: value }} />
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                {/* EyeDropper */}
                {typeof window !== 'undefined' && 'EyeDropper' in window && (
                  <button onClick={handleEyedropper} className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-text-tertiary hover:text-text-primary transition-colors" title="Pick color">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22l5-5 5-5 5 5-5 5-5-5z"/><path d="M17 7l-5 5"/><path d="M14 2l8 8"/></svg>
                  </button>
                )}
                {/* Copy */}
                <button onClick={handleCopy} className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-text-tertiary hover:text-text-primary transition-colors" title="Copy to clipboard">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              </div>
            </div>

            {/* 2. Main Saturation/Value Area */}
            <div 
              ref={svRef}
              className="w-full h-[160px] rounded-lg relative cursor-crosshair overflow-hidden shadow-lg ring-1 ring-border-default group"
              onMouseDown={(e) => { e.preventDefault(); setIsDraggingSV(true); updateSV(e.clientX, e.clientY); }}
              style={{ backgroundColor: `hsl(${hsv.h * 360}, 100%, 50%)` }}
            >
              {/* Layers */}
              <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
              <div className="absolute inset-0 mix-blend-overlay opacity-30 pointer-events-none" style={{ backgroundImage: noiseBg }} />
              
              {/* Cursor */}
              <div
                className="absolute w-4 h-4 rounded-full shadow-lg border-2 border-text-primary pointer-events-none -translate-x-1/2 -translate-y-1/2 transform transition-transform duration-75 ease-out group-active:scale-75"
                style={{
                  left: `${hsv.s * 100}%`,
                  top: `${(1 - hsv.v) * 100}%`
                }}
              />
            </div>

            {/* 3. Sliders (Hue + Alpha) */}
            <div className="space-y-3">
              {/* Hue */}
              <div className="h-3 rounded-full relative overflow-hidden ring-1 ring-border-default cursor-pointer group">
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)' }} />
                <input 
                  type="range" min={0} max={1} step={0.001} value={hsv.h}
                  onChange={(e) => handleHsvChange({ ...hsv, h: parseFloat(e.target.value) })}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                />
                <div className="absolute top-0 bottom-0 w-2 h-full bg-white shadow-md rounded-full pointer-events-none -translate-x-1/2 transition-transform group-active:scale-110" style={{ left: `${hsv.h * 100}%` }} />
              </div>

              {/* Alpha (Hidden if disabled) */}
              {!disableAlpha && (
                <div className="h-3 rounded-full relative overflow-hidden ring-1 ring-border-default cursor-pointer group">
                  <div className="absolute inset-0 z-0" style={{ backgroundImage: `url(${checkerboard})`, opacity: 0.4 }} />
                  <div className="absolute inset-0 z-1" style={{ background: `linear-gradient(to right, transparent, ${hsvToHex(hsv.h, hsv.s, hsv.v)})` }} />
                  <input 
                    type="range" min={0} max={1} step={0.01} value={hsv.a}
                    onChange={(e) => handleHsvChange({ ...hsv, a: parseFloat(e.target.value) })}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
                  />
                  <div className="absolute top-0 bottom-0 w-2 h-full bg-white shadow-md rounded-full pointer-events-none -translate-x-1/2 z-30 transition-transform group-active:scale-110" style={{ left: `${hsv.a * 100}%` }} />
                </div>
              )}
            </div>

            {/* 4. Inputs */}
            <div className="flex flex-col gap-2 bg-[var(--bg-hover)] p-2 rounded-lg border border-border-subtle">
              <div className="flex items-center gap-2 mb-1">
                {/* Mode Tabs */}
                <div className="flex bg-[var(--bg-active)] rounded p-0.5">
                  {(['HEX', 'RGB'] as const).map(m => (
                    <button
                      key={m} onClick={() => setMode(m)}
                      className={`px-2 py-0.5 text-[9px] font-bold rounded-sm transition-all ${mode === m ? 'bg-[var(--bg-active)] text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'HEX' && (
                <div className="flex gap-2">
                  <div className="flex-1 bg-[var(--bg-hover)] border border-border-default rounded px-2 py-1 flex items-center gap-2 group-focus-within:border-accent/50 transition-colors">
                    <span className="text-[10px] text-text-tertiary font-mono select-none">#</span>
                    <input
                      type="text"
                      value={hexInput.replace('#', '')}
                      onChange={(e) => {
                        const val = '#' + e.target.value;
                        setHexInput(val);
                        if (isValidHex(val)) handleHsvChange(parseColorToHsv(val));
                      }}
                      onBlur={() => !isValidHex(hexInput) && setHexInput(value)}
                      onFocus={(e) => e.target.select()}
                      className="w-full bg-transparent text-xs font-mono text-text-primary outline-none uppercase"
                      spellCheck={false}
                    />
                  </div>
                  {!disableAlpha && (
                    <div className="w-14 bg-[var(--bg-hover)] border border-border-default rounded px-1 py-1 flex items-center gap-1 group-focus-within:border-accent/50 transition-colors">
                      <span className="text-[9px] text-text-tertiary font-bold">%</span>
                      <input
                          type="number" min={0} max={100}
                          value={Math.round(hsv.a * 100)}
                          onChange={(e) => handleHsvChange({ ...hsv, a: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) / 100 })}
                          className="w-full bg-transparent text-xs font-mono text-text-primary outline-none text-right [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  )}
                </div>
              )}

              {mode === 'RGB' && (
                <div className="flex gap-1.5">
                  {(['r', 'g', 'b'] as const).map(c => (
                    <div key={c} className="flex-1 bg-[var(--bg-hover)] border border-border-default rounded px-1 py-1 flex items-center gap-1">
                      <span className="text-[9px] text-text-tertiary uppercase font-bold">{c}</span>
                      <input
                        type="number" min={0} max={255}
                        value={rgbInput[c]}
                        onChange={(e) => {
                            const val = Math.min(255, Math.max(0, parseInt(e.target.value) || 0));
                            const newRgb = { ...rgbInput, [c]: val };
                            setRgbInput(newRgb);
                            handleHsvChange(parseColorToHsv(rgbToHex(newRgb.r, newRgb.g, newRgb.b)));
                        }}
                        className="w-full bg-transparent text-xs font-mono text-text-primary outline-none text-right [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 5. Palette & History */}
            <div className="space-y-2 pt-1">
              {/* Palette */}
              <div className="flex gap-1 justify-between">
                {palette.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => handleHsvChange(parseColorToHsv(c))}
                    className="w-6 h-6 rounded-md border border-border-subtle hover:scale-110 hover:border-border-strong transition-all shadow-sm"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              
              {/* History */}
              {history.length > 0 && (
                <div className="flex gap-1.5 flex-wrap pt-2 border-t border-border-subtle">
                  {history.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => handleHsvChange(parseColorToHsv(c))}
                      className="w-5 h-5 rounded-full border border-border-default hover:scale-110 hover:border-border-strong transition-all shadow-sm relative overflow-hidden"
                      title="History"
                    >
                        <div className="absolute inset-0 -z-10" style={{ backgroundImage: `url(${checkerboard})`, opacity: 0.4 }} />
                        <div className="absolute inset-0" style={{ backgroundColor: c }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        }
      />
    </div>
  );
};
