import { Button } from '@/components/ui/Button';
import React, { useMemo } from 'react';
import { formatBytes } from './utils';

export const SectionHeader = ({ icon, label }: { icon: React.ReactNode, label: string }) => (
  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
    <span className="opacity-70">{icon}</span>
    <span>{label}</span>
  </div>
);

export const InfoCard = ({ label, value, highlight = false }: { label: string, value: string | number, highlight?: boolean }) => (
  <div className="bg-[var(--bg-hover)] rounded-md p-2 border border-[var(--border-subtle)]">
    <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">{label}</div>
    <div className={`font-mono text-xs ${highlight ? 'text-accent font-bold' : 'text-[var(--text-secondary)]'}`}>{value}</div>
  </div>
);

export const ProgressBar = ({ label, value, total, color }: { label: string, value: number, total: number, color: string }) => (
  <div>
    <div className="flex justify-between text-[9px] text-[var(--text-tertiary)] mb-1">
      <span>{label}</span>
      <span>{formatBytes(value)}</span>
    </div>
    <div className="h-1 bg-[var(--bg-hover)] rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }} />
    </div>
  </div>
);

export const BufferRow = ({ label, w, h, baseW, highlight }: { label: string, w: number, h: number, baseW: number, highlight?: boolean }) => (
  <div className={`flex items-center justify-between p-2 rounded-md border ${highlight ? 'bg-warning border-warning-border' : 'bg-[var(--bg-hover)] border-[var(--border-subtle)]'}`}>
    <span className="text-[10px] text-[var(--text-secondary)] font-medium">{label}</span>
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{w}×{h}</span>
      <span className="text-[9px] font-mono text-[var(--text-tertiary)] w-8 text-right">
        {baseW > 0 ? (w / baseW).toFixed(2) : '-'}x
      </span>
    </div>
  </div>
);

export const DebugToggle = ({ label, active, onClick, disabled = false }: { label: string, active: boolean, onClick: () => void, disabled?: boolean }) => (
  <Button
    variant={active ? 'primary' : 'ghost'}
    size="sm"
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'bg-accent/20 text-accent border-accent/50 glow-accent-sm' : ''}`}
  >
    {label}
  </Button>
);

// ============================================================================
// SPARKLINE COMPONENT
// ============================================================================
export const Sparkline = React.memo(function Sparkline({
  data,
  width = 100,
  height = 30,
  color = '#34d399',
  fill = false,
  minY = 0,
  maxY = 70
}: {
  data: number[],
  width?: number,
  height?: number,
  color?: string,
  fill?: boolean,
  minY?: number,
  maxY?: number
}) {
  const points = useMemo(() => {
    if (data.length < 2) return '';
    const range = maxY - minY;
    const stepX = width / (data.length - 1);
    return data.map((val, i) => {
      const x = i * stepX;
      const normalizedY = Math.max(0, Math.min(1, (val - minY) / range));
      const y = height - (normalizedY * height);
      return `${x},${y}`;
    }).join(' ');
  }, [data, width, height, minY, maxY]);

  const pathD = `M ${points}`;
  const fillD = `${pathD} L ${width},${height} L 0,${height} Z`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {fill && (
        <path d={fillD} fill={color} fillOpacity={0.1} stroke="none" />
      )}
      <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});
