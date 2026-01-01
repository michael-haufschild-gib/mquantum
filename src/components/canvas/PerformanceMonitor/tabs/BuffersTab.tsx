import { Button } from '@/components/ui/Button';
import { useGeometryStore } from '@/stores/geometryStore';
import { usePerformanceMetricsStore, type BufferStats } from '@/stores/performanceMetricsStore';
import { usePerformanceStore } from '@/stores/performanceStore';
import { useUIStore } from '@/stores/uiStore';
import { useWebGLContextStore } from '@/stores/webglContextStore';
import React, { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Icons } from '../icons';
import { BufferRow, DebugToggle, SectionHeader } from '../subcomponents';

// ============================================================================
// BUFFERS TAB - Manual refresh, isolated subscriptions
// ============================================================================
export const BuffersTabContent = React.memo(function BuffersTabContent() {
  const objectType = useGeometryStore((s) => s.objectType);
  const temporalReprojectionEnabled = usePerformanceStore((s) => s.temporalReprojectionEnabled);

  const {
    showDepthBuffer,
    setShowDepthBuffer,
    showNormalBuffer,
    setShowNormalBuffer,
    showTemporalDepthBuffer,
    setShowTemporalDepthBuffer,
  } = useUIStore(
    useShallow((s) => ({
      showDepthBuffer: s.showDepthBuffer,
      setShowDepthBuffer: s.setShowDepthBuffer,
      showNormalBuffer: s.showNormalBuffer,
      setShowNormalBuffer: s.setShowNormalBuffer,
      showTemporalDepthBuffer: s.showTemporalDepthBuffer,
      setShowTemporalDepthBuffer: s.setShowTemporalDepthBuffer,
    }))
  );

  const { triggerContextLoss, contextStatus } = useWebGLContextStore(
    useShallow((s) => ({
      triggerContextLoss: s.debugTriggerContextLoss,
      contextStatus: s.status,
    }))
  );

  const [bufferStats, setBufferStats] = useState<BufferStats | null>(null);
  const isDevelopment = import.meta.env.MODE !== 'production';

  // Temporal preview availability
  const temporalPreviewAvailable = temporalReprojectionEnabled &&
    (objectType === 'mandelbulb' || objectType === 'quaternion-julia' || objectType === 'schroedinger');

  // Graceful handling: turn off temporal preview when object type changes to unsupported
  useEffect(() => {
    if (showTemporalDepthBuffer && !temporalPreviewAvailable) {
      setShowTemporalDepthBuffer(false);
    }
  }, [temporalPreviewAvailable, showTemporalDepthBuffer, setShowTemporalDepthBuffer]);

  // Refresh buffer stats on mount
  const refreshBufferStats = useCallback(() => {
    const currentStats = usePerformanceMetricsStore.getState().buffers;
    setBufferStats({ ...currentStats });
  }, []);

  useEffect(() => {
    refreshBufferStats();
  }, [refreshBufferStats]);

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center justify-between">
        <SectionHeader icon={<Icons.Square />} label="Render Targets" />
        <Button variant="ghost" size="icon" onClick={refreshBufferStats} ariaLabel="Refresh buffer stats">
          <Icons.RefreshCw className="w-3 h-3" />
        </Button>
      </div>
      {!bufferStats ? (
        <div className="text-center text-text-tertiary py-4 text-xs">Loading...</div>
      ) : (
        <div className="space-y-2">
          <BufferRow label="Screen" w={bufferStats.screen.width} h={bufferStats.screen.height} baseW={bufferStats.screen.width} />
          <BufferRow label="Depth" w={bufferStats.depth.width} h={bufferStats.depth.height} baseW={bufferStats.screen.width} />
          <BufferRow label="Normal" w={bufferStats.normal.width} h={bufferStats.normal.height} baseW={bufferStats.screen.width} />
          <BufferRow label="Temporal" w={bufferStats.temporal.width} h={bufferStats.temporal.height} baseW={bufferStats.screen.width} highlight={bufferStats.temporal.width !== bufferStats.screen.width * 0.5} />
        </div>
      )}
      <div className="space-y-3 pt-3 border-t border-border-subtle">
        <SectionHeader icon={<Icons.Monitor />} label="Debug View" />
        <div className="grid grid-cols-3 gap-2">
          <DebugToggle label="Depth" active={showDepthBuffer} onClick={() => setShowDepthBuffer(!showDepthBuffer)} />
          <DebugToggle label="Normal" active={showNormalBuffer} onClick={() => setShowNormalBuffer(!showNormalBuffer)} />
          <DebugToggle
            label="Temporal"
            active={showTemporalDepthBuffer}
            onClick={() => setShowTemporalDepthBuffer(!showTemporalDepthBuffer)}
            disabled={!temporalPreviewAvailable}
          />
        </div>
      </div>
      {isDevelopment && (
        <div className="space-y-3 pt-3 border-t border-border-subtle">
          <SectionHeader icon={<Icons.AlertTriangle />} label="Debug Tools" />
          <div className="space-y-2">
            <Button
              variant="danger"
              size="sm"
              onClick={triggerContextLoss}
              disabled={contextStatus !== 'active'}
              className="w-full text-[10px] font-bold uppercase tracking-wider"
            >
              <Icons.AlertTriangle className="w-3 h-3" />
              Simulate Context Loss
            </Button>
            <div className="text-[9px] text-[var(--text-tertiary)] text-center">
              Status: <span className={
                contextStatus === 'active' ? 'text-success' :
                  contextStatus === 'restoring' ? 'text-warning' :
                    contextStatus === 'failed' ? 'text-[var(--text-danger)]' : 'text-[var(--text-tertiary)]'
              }>{contextStatus}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
