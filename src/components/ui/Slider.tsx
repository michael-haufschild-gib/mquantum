import React, { useEffect, useId, useState, useRef } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { soundManager } from '@/lib/audio/SoundManager';

/** Drag sensitivity when Shift key is not pressed */
const DRAG_SENSITIVITY_NORMAL = 0.2;
/** Drag sensitivity when Shift key is pressed (precision mode) */
const DRAG_SENSITIVITY_PRECISE = 0.05;
/** Pixels of mouse movement to traverse full range */
const DRAG_PIXELS_TO_FULL_RANGE = 200;

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  unit?: string;
  showValue?: boolean;
  className?: string;
  disabled?: boolean;
  minLabel?: string;
  maxLabel?: string;
  tooltip?: string;
  formatValue?: (value: number) => string;
  'data-testid'?: string;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = '',
  showValue = true,
  className = '',
  disabled = false,
  minLabel,
  maxLabel,
  formatValue,
  'data-testid': dataTestId,
}) => {
  const id = useId();
  const percentage = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  const decimals = step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step)));

  const [inputValue, setInputValue] = useState(value.toString());
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isLabelDragging, setIsLabelDragging] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Refs for cleanup of label drag event listeners on unmount
  const labelDragListenersRef = useRef<{
    move: ((e: MouseEvent) => void) | null;
    up: (() => void) | null;
  }>({ move: null, up: null });

  // Sync input value with external value, but only when input is not focused
  useEffect(() => {
    if (!isInputFocused) {
      setInputValue(value.toFixed(decimals));
    }
  }, [value, decimals, isInputFocused]);

  // Cleanup event listeners on unmount
  useEffect(() => {
    const listeners = labelDragListenersRef.current;
    return () => {
      if (listeners.move) {
        window.removeEventListener('mousemove', listeners.move);
      }
      if (listeners.up) {
        window.removeEventListener('mouseup', listeners.up);
      }
      // Also restore cursor if unmounted while dragging
      document.body.style.cursor = '';
    };
  }, []);

  // Label Drag Logic
  const handleLabelMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    setIsLabelDragging(true);
    soundManager.playClick();
    e.preventDefault();
    document.body.style.cursor = 'ew-resize';

    const startX = e.clientX;
    const startValue = value;
    const range = max - min;
    const sensitivity = e.shiftKey ? DRAG_SENSITIVITY_PRECISE : DRAG_SENSITIVITY_NORMAL;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      // Map pixels to value
      const change = delta * (range / DRAG_PIXELS_TO_FULL_RANGE) * sensitivity;
      let newValue = startValue + change;

      // Step snapping
      if (step) {
        newValue = Math.round(newValue / step) * step;
      }

      newValue = Math.min(Math.max(newValue, min), max);
      
      // Use startTransition to prioritize UI responsiveness over store updates
      React.startTransition(() => {
        onChange(newValue);
      });
    };

    const handleMouseUp = () => {
      setIsLabelDragging(false);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Clear refs
      labelDragListenersRef.current.move = null;
      labelDragListenersRef.current.up = null;
    };

    // Store refs for cleanup on unmount
    labelDragListenersRef.current.move = handleMouseMove;
    labelDragListenersRef.current.up = handleMouseUp;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputBlur = () => {
    let newValue = parseFloat(inputValue);
    if (isNaN(newValue)) {
      newValue = value;
    } else {
      newValue = Math.min(Math.max(newValue, min), max);
    }
    onChange(newValue);
    setInputValue(newValue.toFixed(decimals));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleInputBlur();
      (e.target as HTMLInputElement).blur();
    }
  };
  
  const displayValue = formatValue ? formatValue(value) : value.toFixed(decimals);

  return (
    <div 
      className={`group/slider relative select-none w-full ${className} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      onMouseEnter={() => { setIsHovered(true); soundManager.playHover(); }}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={dataTestId}
    >
      {/* Header: Label and Value */}
      <div className="flex items-center justify-between mb-2 h-5">
        <label
          htmlFor={id}
          className={`
            text-[11px] font-medium transition-colors tracking-wide flex items-center gap-1 min-w-0 truncate
            ${isLabelDragging ? 'text-accent cursor-ew-resize' : 'text-text-secondary group-hover/slider:text-text-primary cursor-ew-resize'}
          `}
          title="Drag label to adjust value"
          onMouseDown={handleLabelMouseDown}
        >
          {label}
        </label>
        
        {showValue && (
          <div className="flex items-center shrink-0 ml-2">
            <div className="relative w-[8ch] h-5 flex items-center">
                <input
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => {
                    setIsInputFocused(false);
                    handleInputBlur();
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={disabled}
                  className={`
                    w-full h-full pl-1.5 text-right font-mono text-[10px]
                    bg-[var(--bg-hover)] border border-border-subtle rounded
                    text-text-primary
                    hover:border-border-default hover:bg-[var(--bg-active)]
                    focus:outline-none focus:border-accent/50 focus:bg-[var(--bg-active)]
                    transition-colors duration-150
                    ${unit ? 'pr-7' : 'pr-1.5'}
                  `}
                  data-testid={dataTestId ? `${dataTestId}-input` : undefined}
                />
                {unit && <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-text-tertiary font-medium pointer-events-none">{unit}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Track Labels */}
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-[9px] text-text-tertiary mb-1 px-0.5">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}

      {/* Slider Track Area */}
      <div className="relative h-5 flex items-center touch-none">
        
        {/* Track Background */}
        <div className="absolute w-full h-[3px] bg-[var(--bg-hover)] rounded-full overflow-hidden transition-colors duration-300 group-hover/slider:bg-[var(--bg-active)] backdrop-blur-sm shadow-inner">
           {/* Active Fill Track - Gradient */}
           <div
             className="h-full bg-gradient-to-r from-accent/50 to-accent shadow-[0_0_10px_var(--color-accent-glow)] opacity-80 group-hover/slider:opacity-100 transition-all duration-100 ease-out"
             style={{ width: `${percentage}%` }}
           />
        </div>

        {/* Native Input - Invisible but clickable */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const val = Number(e.target.value);
            React.startTransition(() => {
              onChange(val);
            });
          }}
          onMouseDown={() => { setIsDragging(true); soundManager.playClick(); }}
          onMouseUp={() => setIsDragging(false)}
          onTouchStart={() => { setIsDragging(true); soundManager.playClick(); }}
          onTouchEnd={() => setIsDragging(false)}
          disabled={disabled}
          className="absolute w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-20"
          style={{ WebkitAppearance: 'none' }}
          aria-label={label}
        />

        {/* Custom Thumb */}
        <div
          className={`
            absolute h-3.5 w-3.5 rounded-full 
            bg-background border border-accent 
            shadow-[0_0_12px_var(--color-accent-glow)] 
            pointer-events-none z-10 
            transition-transform duration-100 ease-out
            flex items-center justify-center
            ${isDragging || isLabelDragging ? 'scale-125 bg-accent' : 'scale-100 group-hover/slider:scale-110'}
          `}
          style={{ left: `calc(${percentage}% - 7px)` }}
        >
           <div className={`w-1 h-1 rounded-full bg-text-primary transition-opacity duration-200 ${isDragging || isHovered ? 'opacity-100' : 'opacity-50'}`} />
        </div>

        {/* Tooltip while dragging */}
        <AnimatePresence>
          {(isDragging || isLabelDragging) && (
             <m.div
               initial={{ opacity: 0, y: 10, scale: 0.8 }}
               animate={{ opacity: 1, y: -20, scale: 1 }}
               exit={{ opacity: 0, y: 10, scale: 0.8 }}
               className="absolute top-0 -translate-x-1/2 px-2 py-1 glass-panel-dark border border-border-default rounded text-[10px] font-mono text-accent pointer-events-none shadow-xl z-30 whitespace-nowrap"
               style={{ left: `${percentage}%` }}
             >
               {displayValue}{unit}
             </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};