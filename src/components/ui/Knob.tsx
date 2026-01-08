import { m, PanInfo } from 'motion/react';
import React, { useCallback, useId } from 'react';

export interface KnobProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  size?: number;
  className?: string;
  sensitivity?: number;
}

export const Knob: React.FC<KnobProps> = React.memo(({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  size = 64,
  className = '',
  sensitivity = 1, // Value change per pixel (approx)
}) => {
  const id = useId();

  // Constants for visual representation
  const minRotation = -145; // degrees
  const maxRotation = 145;

  // Normalize value to 0-1 range for visual rotation
  const normalizedValue = (Math.min(Math.max(value, min), max) - min) / (max - min);
  const rotation = minRotation + normalizedValue * (maxRotation - minRotation);

  // Calculate arc path
  const radius = 18;
  const center = 20;

  const valueAngle = (rotation - 90) * (Math.PI / 180);
  const startAngle = (minRotation - 90) * (Math.PI / 180);

  // Helper to get coordinates on circle
  const getCoords = (angle: number, r: number) => ({
    x: center + r * Math.cos(angle),
    y: center + r * Math.sin(angle)
  });

  const startPoint = getCoords(startAngle, radius);
  const endPoint = getCoords(valueAngle, radius);

  const largeArcFlag = valueAngle - startAngle <= Math.PI ? 0 : 1;

  const indicatorPath = `M ${startPoint.x} ${startPoint.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endPoint.x} ${endPoint.y}`;

  // Pan Handler (Motion)
  const handlePan = useCallback((_: PointerEvent, info: PanInfo) => {
    // Negative deltaY means moving up, which should increase value
    const deltaY = -info.delta.y;

    // Scale delta.
    // sensitivity determines how "fast" it moves.
    // Range = max - min.
    // 100 pixels drag = full range?
    const range = max - min;
    const pixelRange = 200; // Pixels to traverse full range
    const change = (deltaY / pixelRange) * range * sensitivity;

    let newValue = value + change;

    // Clamp
    newValue = Math.min(Math.max(newValue, min), max);

    // Step
    if (step) {
      newValue = Math.round(newValue / step) * step;
    }

    if (newValue !== value) {
      onChange(newValue);
    }
  }, [value, min, max, step, onChange, sensitivity]);

  // Double click reset
  const handleDoubleClick = useCallback(() => {
    onChange(min);
  }, [min, onChange]);

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(Math.min(value + step, max));
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(Math.max(value - step, min));
  }, [value, step, min, max, onChange]);

  // Generate tick marks
  const ticks = Array.from({ length: 11 }).map((_, i) => {
    const tickAngle = minRotation + (i / 10) * (maxRotation - minRotation);
    const rad = (tickAngle - 90) * (Math.PI / 180);
    const inner = getCoords(rad, 15);
    const outer = getCoords(rad, 17);
    return (
      <line
        key={i}
        x1={inner.x} y1={inner.y}
        x2={outer.x} y2={outer.y}
        stroke="var(--color-text-tertiary)"
        strokeWidth="1"
        strokeOpacity={0.3}
      />
    );
  });

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <m.div
        className={`relative select-none touch-none outline-hidden group cursor-grab active:cursor-grabbing`}
        style={{ width: size, height: size }}
        onPan={handlePan}
        onDoubleClick={handleDoubleClick}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        whileTap={{ scale: 0.95 }}
      >
        <svg viewBox="0 0 40 40" className="w-full h-full overflow-visible">
          <defs>
            <filter id={`glow-${id}`}>
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Soft Shadow Gradient (Radial) */}
            <radialGradient id={`shadow-grad-${id}`} cx="0.5" cy="0.5" r="0.5">
               <stop offset="85%" stopColor="var(--color-background)" stopOpacity="0.4" />
               <stop offset="100%" stopColor="var(--color-background)" stopOpacity="0" />
            </radialGradient>

            {/* Base Body Gradient (Linear Vertical) */}
            <linearGradient id={`body-grad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-text-secondary)" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="var(--color-background)" stopOpacity="0.8"/>
            </linearGradient>

            {/* Highlight Gradient (Linear Vertical for reflection) */}
             <linearGradient id={`highlight-grad-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.2"/>
              <stop offset="40%" stopColor="white" stopOpacity="0"/>
              <stop offset="100%" stopColor="white" stopOpacity="0.05"/>
            </linearGradient>
          </defs>

          {/* Background Ring */}
          <circle
            cx="20" cy="20" r="18"
            fill="var(--color-glass)"
            stroke="var(--color-border)"
            strokeWidth="2"
            strokeOpacity="0.1"
          />
          
          {/* Tick Marks */}
          <g>{ticks}</g>

          {/* Active Value Arc */}
          <path
            d={indicatorPath}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2"
            strokeLinecap="round"
            filter={`url(#glow-${id})`}
            className="transition-[stroke-dasharray] duration-75"
          />

          {/* Dial Group */}
          <m.g
            className="origin-center"
            whileHover={{ scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
             {/* Soft Shadow */}
             <circle cx="20" cy="20" r="16" fill={`url(#shadow-grad-${id})`} />

             {/* Depression Ellipse (Simulates 3D bevel) */}
             <circle cx="20" cy="21" r="14" fill="var(--bg-overlay)" />

             {/* Main Body */}
             <circle cx="20" cy="20" r="14" fill={`url(#body-grad-${id})`} stroke="var(--color-border)" strokeOpacity="0.2" strokeWidth="1" />

             {/* Inner Highlight Ring */}
             <circle cx="20" cy="20" r="13" fill="none" stroke={`url(#highlight-grad-${id})`} strokeWidth="1" />

             {/* Hover Highlight Overlay */}
             <circle cx="20" cy="20" r="14" fill="var(--text-primary)" className="opacity-0 group-hover:opacity-5 transition-opacity duration-200" />
          </m.g>

          {/* Indicator Dot (Rotates) */}
          <m.g
            animate={{ rotate: rotation }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }} 
            style={{ originX: "20px", originY: "20px" }}
          >
             {/* Pointer line instead of dot for precision */}
             <rect x="19.5" y="8" width="1" height="4" rx="0.5" fill="var(--color-accent)" filter={`url(#glow-${id})`} />
          </m.g>
        </svg>

        {/* Focus Ring */}
        <div className="absolute inset-0 rounded-full ring-2 ring-accent opacity-0 group-focus:opacity-50 pointer-events-none transition-opacity" />
      </m.div>

      {label && (
        <span className="text-[10px] font-medium text-text-secondary select-none tracking-wider uppercase opacity-80">
          {label}
        </span>
      )}
    </div>
  );
});

Knob.displayName = 'Knob';
