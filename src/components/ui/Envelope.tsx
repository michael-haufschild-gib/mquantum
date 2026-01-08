import React, { useId, useMemo } from 'react';

export type EnvelopeMode = 'AD' | 'AR' | 'ADSR' | 'AHDSR';

export interface EnvelopeProps {
  mode?: EnvelopeMode;
  delay?: number;   // Time
  attack: number;   // Time
  hold?: number;    // Time
  decay?: number;   // Time
  sustain?: number; // Level (0-1)
  release?: number; // Time
  className?: string;
  width?: number | string;
  height?: number | string;
  strokeWidth?: number;
}

export const Envelope: React.FC<EnvelopeProps> = React.memo(({
  mode = 'ADSR',
  delay = 0,
  attack,
  hold = 0,
  decay = 0,
  sustain = 0.5,
  release = 0,
  className = '',
  width = '100%',
  height = 120,
  strokeWidth = 2,
}) => {
  const id = useId();

  // Normalize/Sanitize inputs based on mode
  const pDelay = Math.max(0, delay);
  const pAttack = Math.max(0.01, attack); // Avoid 0 duration
  const pHold = mode === 'AHDSR' ? Math.max(0, hold) : 0;
  const pDecay = (mode === 'ADSR' || mode === 'AHDSR') ? Math.max(0, decay) : 0;
  const pSustain = (mode === 'ADSR' || mode === 'AHDSR') ? Math.max(0, Math.min(1, sustain)) : 0;
  const pRelease = (mode === 'AR' || mode === 'ADSR' || mode === 'AHDSR') ? Math.max(0.01, release) : (mode === 'AD' ? Math.max(0.01, decay) : 0); // For AD, decay is effectively release from peak

  // Calculate X positions (Time)
  // We need to fit everything into the viewbox.
  // Let's assume a fixed total unit width and scale, or just sum them up?
  // To make it responsive, we scale the X axis so the total duration fits the width.

  const totalTime = pDelay + pAttack + pHold + pDecay + pRelease;
  const viewWidth = 300;
  const viewHeight = 100;

  // Scale factor (pixels per time unit)
  // If totalTime is 0 (impossible due to min 0.01), handle it.
  const scaleX = viewWidth / (totalTime * 1.2); // Add 20% padding at end

  // Y coordinates (SVG 0 is top, 100 is bottom)
  const yBottom = viewHeight;
  const yTop = 0;
  const ySustain = viewHeight - (pSustain * viewHeight);

  // Points
  const x0 = 0;
  const xDelay = x0 + pDelay * scaleX;
  const xAttack = xDelay + pAttack * scaleX;
  const xHold = xAttack + pHold * scaleX;
  const xDecay = xHold + pDecay * scaleX;
  const xRelease = xDecay + pRelease * scaleX;

  // Path Construction
  let path = `M ${x0},${yBottom}`; // Start

  // Delay (Flat at bottom)
  if (pDelay > 0) {
    path += ` L ${xDelay},${yBottom}`;
  }

  // Attack (Up to Peak)
  // Linear for now, could use curves if tension prop existed
  path += ` L ${xAttack},${yTop}`;

  // Hold (Flat at Peak)
  if (pHold > 0) {
    path += ` L ${xHold},${yTop}`;
  }

  // Decay (Down to Sustain)
  if (mode === 'ADSR' || mode === 'AHDSR') {
    path += ` L ${xDecay},${ySustain}`;
  } else if (mode === 'AD') {
    // For AD, we decay to 0 immediately after attack (and hold is 0)
    // Actually AD usually means Attack -> Decay (to 0)
    path += ` L ${xRelease},${yBottom}`;
  }

  // Sustain (Flat at Sustain Level) - Rendered as a line?
  // ADSR usually sustains indefinitely until note off.
  // In a static visualizer, we usually show a "hold" duration for sustain or just a point.
  // Let's visualize "Release" starting from the sustain point.
  // We need to assume a "Sustain Duration" for visualization if we want to show it,
  // but typically ADSR graphs just show A->D->S->R sequence where S is a level, not a time.
  // Standard visualization: Attack -> Decay -> Sustain Level -> Release.
  // The Release starts from the Sustain Level.

  if (mode === 'AR') {
      // Attack -> Release (from Peak to 0)
      // Already handled logic above?
      // AR: Attack (to Peak), then immediately Release (to 0).
      // Logic: xAttack is peak. xDecay is same as xAttack. xRelease is end.
      // My variable naming for "Release" phase is consistent.
       path += ` L ${xRelease},${yBottom}`;
  } else if (mode === 'ADSR' || mode === 'AHDSR') {
      // From Sustain point (xDecay, ySustain) to End (xRelease, yBottom)
      path += ` L ${xRelease},${yBottom}`;
  }

  // Points for circles
  const points = useMemo(() => [
    { x: xDelay, y: yBottom, label: 'delay', hidden: pDelay <= 0 },
    { x: xAttack, y: yTop, label: 'attack', hidden: false },
    { x: xHold, y: yTop, label: 'hold', hidden: pHold <= 0 },
    { x: xDecay, y: (mode === 'AD' || mode === 'AR') ? yBottom : ySustain, label: 'decay', hidden: (mode === 'AD' || mode === 'AR') },
    { x: xRelease, y: yBottom, label: 'release', hidden: false },
  ], [xDelay, yBottom, pDelay, xAttack, yTop, xHold, pHold, xDecay, mode, ySustain, xRelease]);

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id={`glow-${id}`}>
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id={`fill-grad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Fill Area */}
        <path
          d={`${path} L ${xRelease},${yBottom} Z`}
          fill={`url(#fill-grad-${id})`}
          className="transition-[d] duration-300 ease-out"
        />

        {/* Stroke Line */}
        <path
          d={path}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#glow-${id})`}
          className="transition-[d] duration-300 ease-out"
        />

        {/* Control Points */}
        {points.map((p, i) => !p.hidden && (
          <g key={i} className="transition-transform duration-300 ease-out" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
            <circle
              r="4"
              fill="var(--color-background)"
              stroke="var(--color-accent)"
              strokeWidth="2"
            />
          </g>
        ))}
      </svg>
    </div>
  );
});

Envelope.displayName = 'Envelope';
