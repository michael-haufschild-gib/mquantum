import { Tabs } from '@/components/ui/Tabs';
import { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore';
import { useUIStore } from '@/stores/uiStore';
import React, { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Icons } from './icons';
import { Sparkline } from './subcomponents';
import { BuffersTabContent, ShaderTabContent, StatsTabContent, SystemTabContent } from './tabs';
import { getHealthColor } from './utils';

// ============================================================================
// FPS HEADER - Isolated subscription for FPS graph area
// ============================================================================
const FPSHeader = React.memo(function FPSHeader() {
  // Use useShallow for grouped subscription - only re-renders when these specific values change
  const { fps, frameTime, minFps, maxFps, fpsHistory } = usePerformanceMetricsStore(
    useShallow((s) => ({
      fps: s.fps,
      frameTime: s.frameTime,
      minFps: s.minFps,
      maxFps: s.maxFps,
      fpsHistory: s.history.fps,
    }))
  );

  const fpsColor = getHealthColor(fps, 55, 30);

  return (
    <div className="px-5 py-5 space-y-4 bg-gradient-to-b from-[var(--bg-hover)] to-transparent">
      <div className="flex justify-between items-end mb-2">
        <div>
          <div className={`text-4xl font-bold font-mono tracking-tighter ${fpsColor.text}`}>
            {fps}
            <span className="text-sm text-text-tertiary ml-2 font-sans tracking-normal font-medium">FPS</span>
          </div>
          <div className="text-[10px] text-text-tertiary uppercase tracking-wider mt-1 font-medium">
            Min {minFps} • Max {maxFps}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-mono text-text-secondary">{frameTime.toFixed(1)}<span className="text-xs text-text-tertiary ml-1">ms</span></div>
          <div className="text-[10px] text-text-tertiary uppercase tracking-wider mt-1 font-medium">Frame Time</div>
        </div>
      </div>

      <div className="h-16 w-full relative">
        <Sparkline
          data={fpsHistory}
          width={320}
          height={64}
          color={fpsColor.stroke}
          fill={true}
          maxY={80}
        />
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
          <div className="w-full border-t border-dashed border-border-subtle"></div>
          <div className="w-full border-t border-dashed border-border-subtle"></div>
          <div className="w-full border-t border-dashed border-border-subtle"></div>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// EXPANDED CONTENT - Minimal subscriptions, delegates to tab components
// ============================================================================
interface ExpandedContentProps {
  onCollapse: () => void;
  didDrag: boolean;
}

export const ExpandedContent = React.memo(function ExpandedContent({ onCollapse, didDrag }: ExpandedContentProps) {
  // Only subscribe to tab state - not metrics
  const perfMonitorTab = useUIStore((s) => s.perfMonitorTab);
  const setPerfMonitorTab = useUIStore((s) => s.setPerfMonitorTab);

  // Memoize tab definitions to prevent recreation
  const tabs = useMemo(() => [
    { id: 'perf', label: 'Stats', content: <StatsTabContent /> },
    { id: 'sys', label: 'System', content: <SystemTabContent /> },
    { id: 'shader', label: 'Shader', content: <ShaderTabContent /> },
    { id: 'buffers', label: 'Buffers', content: <BuffersTabContent /> }
  ], []);

  return (
    <>
      {/* Header */}
      <div
        onClick={() => { if (!didDrag) onCollapse(); }}
        className="flex items-center justify-between px-5 py-4 border-b border-border-subtle bg-[var(--bg-hover)] cursor-pointer hover:bg-[var(--bg-active)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <Icons.Activity className="w-4 h-4 text-text-tertiary" />
          <span className="text-xs font-bold uppercase tracking-widest text-text-secondary">System Monitor</span>
        </div>
        <div className="p-1.5 -mr-1.5 rounded-full text-text-tertiary">
          <Icons.Minimize className="w-4 h-4" />
        </div>
      </div>

      {/* FPS Header - isolated subscription */}
      <FPSHeader />

      {/* Content Tabs */}
      <div className="border-t border-border-subtle h-[340px] flex flex-col">
        <Tabs
          variant="minimal"
          fullWidth
          value={perfMonitorTab}
          onChange={(id) => setPerfMonitorTab(id as 'perf' | 'sys' | 'shader' | 'buffers')}
          tabs={tabs}
          className="h-full border-b border-border-subtle text-[10px]"
          contentClassName="h-full"
        />
      </div>
    </>
  );
});
