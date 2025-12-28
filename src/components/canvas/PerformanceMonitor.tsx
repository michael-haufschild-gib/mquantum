import { Switch } from '@/components/ui/Switch';
import { Tabs } from '@/components/ui/Tabs';
import { usePanelCollision } from '@/hooks/usePanelCollision';
import { getConfigStoreKey, isRaymarchingType } from '@/lib/geometry/registry';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { usePerformanceMetricsStore, type BufferStats } from '@/stores/performanceMetricsStore';
import { usePerformanceStore } from '@/stores/performanceStore';
import { useUIStore } from '@/stores/uiStore';
import { useWebGLContextStore } from '@/stores/webglContextStore';
import { AnimatePresence, LazyMotion, domMax, m, useMotionValue } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// --- Icons ---
const Icons = {
  Activity: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
  ),
  Chip: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3" /><path d="M15 1v3" /><path d="M9 20v3" /><path d="M15 20v3" /><path d="M20 9h3" /><path d="M20 14h3" /><path d="M1 9h3" /><path d="M1 14h3" /></svg>
  ),
  Zap: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
  ),
  Database: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>
  ),
  Clock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
  ),
  Monitor: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
  ),
  Layers: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
  ),
  Maximize: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
  ),
  Minimize: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" /></svg>
  ),
  RefreshCw: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
  ),
  Square: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg>
  ),
  AlertTriangle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
  ),
};

// --- Helper Functions ---
function formatMetric(value: number, unit = '', decimals = 1): string {
  if (value === 0) return `0${unit}`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(decimals)}M${unit}`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(decimals)}k${unit}`;
  return `${Math.round(value)}${unit}`;
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${sizes[i]}`;
}

function getHealthColor(fps: number, high: number, low: number) {
  if (fps >= high) return { text: 'health-high', bg: 'bg-health-high', bgPulse: 'bg-health-high', stroke: 'var(--health-high-stroke)' };
  if (fps >= low) return { text: 'health-medium', bg: 'bg-health-medium', bgPulse: 'bg-health-medium', stroke: 'var(--health-medium-stroke)' };
  return { text: 'health-low', bg: 'bg-health-low', bgPulse: 'bg-health-low', stroke: 'var(--health-low-stroke)' };
}

function formatShaderName(key: string, objectType: string): string {
  if (key.toLowerCase() === 'object') {
    return objectType
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/-/g, ' ')
      .trim();
  }
  return key.replace(/^./, (str) => str.toUpperCase());
}

// --- Color helper for collapsed view ---
type FpsColorLevel = 'high' | 'medium' | 'low';
const FPS_COLORS = {
  high: { text: 'health-high', bg: 'bg-health-high', stroke: 'var(--health-high-stroke)' },
  medium: { text: 'health-medium', bg: 'bg-health-medium', stroke: 'var(--health-medium-stroke)' },
  low: { text: 'health-low', bg: 'bg-health-low', stroke: 'var(--health-low-stroke)' },
} as const;

function getFpsColorLevel(fps: number): FpsColorLevel {
  if (fps >= 55) return 'high';
  if (fps >= 30) return 'medium';
  return 'low';
}

// ============================================================================
// COLLAPSED VIEW - Zero re-renders, updates via refs
// ============================================================================
const CollapsedView = React.memo(function CollapsedView() {
  const fpsRef = useRef<HTMLSpanElement>(null);
  const frameTimeRef = useRef<HTMLSpanElement>(null);
  const sparklineRef = useRef<SVGPathElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const fpsContainerRef = useRef<HTMLSpanElement>(null);

  // Track previous values to avoid unnecessary DOM updates
  const prevValuesRef = useRef({
    fps: -1,
    frameTime: -1,
    colorLevel: '' as FpsColorLevel | '',
  });

  // Direct DOM updates via SELECTIVE subscription
  // CRITICAL: Only fires when fps/frameTime/history changes, NOT on sceneGpu (60Hz) updates
  useEffect(() => {
    const unsubscribe = usePerformanceMetricsStore.subscribe(
      (state, prevState) => {
        // Early exit if none of the values we care about changed
        if (
          state.fps === prevState.fps &&
          state.frameTime === prevState.frameTime &&
          state.history.fps === prevState.history.fps
        ) {
          return;
        }

        const prev = prevValuesRef.current;

        // Update FPS text only if changed
        if (state.fps !== prev.fps && fpsRef.current) {
          fpsRef.current.textContent = String(state.fps);
          prev.fps = state.fps;
        }

        // Update frame time only if changed
        const newFrameTime = Math.round(state.frameTime * 10);
        const oldFrameTime = Math.round(prev.frameTime * 10);
        if (newFrameTime !== oldFrameTime && frameTimeRef.current) {
          frameTimeRef.current.textContent = state.frameTime.toFixed(1);
          prev.frameTime = state.frameTime;
        }

        // Update sparkline path only if history changed
        if (sparklineRef.current && state.history.fps !== prevState.history.fps) {
          const data = state.history.fps;
          if (data.length >= 2) {
            const width = 64;
            const height = 20;
            const minY = 0;
            const maxY = 70;
            const range = maxY - minY;
            const stepX = width / (data.length - 1);

            const points = data.map((val, i) => {
              const x = i * stepX;
              const normalizedY = Math.max(0, Math.min(1, (val - minY) / range));
              const y = height - (normalizedY * height);
              return `${x},${y}`;
            }).join(' ');

            sparklineRef.current.setAttribute('d', `M ${points}`);
          }
        }

        // Update colors ONLY if color level changed
        const newColorLevel = getFpsColorLevel(state.fps);
        if (newColorLevel !== prev.colorLevel) {
          const color = FPS_COLORS[newColorLevel];

          if (indicatorRef.current) {
            indicatorRef.current.className = `relative inline-flex rounded-full h-2.5 w-2.5 ${color.bg}`;
          }
          if (fpsContainerRef.current) {
            fpsContainerRef.current.className = `text-lg font-bold font-mono leading-none ${color.text}`;
          }
          if (sparklineRef.current) {
            sparklineRef.current.setAttribute('stroke', color.stroke);
          }

          prev.colorLevel = newColorLevel;
        }
      }
    );

    return unsubscribe;
  }, []);

  // Initial render values
  const initialState = usePerformanceMetricsStore.getState();
  const initialColorLevel = getFpsColorLevel(initialState.fps);
  const initialColor = FPS_COLORS[initialColorLevel];

  // Set initial prev values
  prevValuesRef.current = {
    fps: initialState.fps,
    frameTime: initialState.frameTime,
    colorLevel: initialColorLevel,
  };

  // Compute initial sparkline path
  const initialPath = useMemo(() => {
    const data = initialState.history.fps;
    if (data.length < 2) return '';
    const width = 64;
    const height = 20;
    const minY = 0;
    const maxY = 70;
    const range = maxY - minY;
    const stepX = width / (data.length - 1);
    const points = data.map((val, i) => {
      const x = i * stepX;
      const normalizedY = Math.max(0, Math.min(1, (val - minY) / range));
      const y = height - (normalizedY * height);
      return `${x},${y}`;
    }).join(' ');
    return `M ${points}`;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-4 px-4 py-2 h-12">
      <div className="flex items-center gap-3">
        <div className="relative flex h-2.5 w-2.5">
          <span ref={indicatorRef} className={`relative inline-flex rounded-full h-2.5 w-2.5 ${initialColor.bg}`} />
        </div>
        <div className="flex flex-col">
          <span ref={fpsContainerRef} className={`text-lg font-bold font-mono leading-none ${initialColor.text}`}>
            <span ref={fpsRef}>{initialState.fps}</span>
          </span>
          <span className="text-[9px] uppercase tracking-wider text-text-tertiary font-bold">FPS</span>
        </div>
      </div>

      <div className="w-px h-6 bg-[var(--bg-active)]" />

      <div className="w-16 h-6 flex items-center">
        <svg width={64} height={20} className="overflow-visible">
          <path
            ref={sparklineRef}
            d={initialPath}
            fill="none"
            stroke={initialColor.stroke}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="flex flex-col items-end min-w-[32px]">
        <span className="text-[10px] font-mono text-text-secondary">
          <span ref={frameTimeRef}>{initialState.frameTime.toFixed(1)}</span>
        </span>
        <span className="text-[8px] text-text-tertiary">ms</span>
      </div>
    </div>
  );
});

// ============================================================================
// EXPANDED CONTENT - All store subscriptions isolated here
// ============================================================================
interface ExpandedContentProps {
  onCollapse: () => void;
  didDrag: boolean;
}

const ExpandedContent = React.memo(function ExpandedContent({ onCollapse, didDrag }: ExpandedContentProps) {
  // -- ALL store subscriptions are here, not in parent --
  const objectType = useGeometryStore(state => state.objectType);
  const mandelbulbConfig = useExtendedObjectStore(state => state.mandelbulb);
  const quaternionJuliaConfig = useExtendedObjectStore(state => state.quaternionJulia);

  const fps = usePerformanceMetricsStore((s) => s.fps);
  const frameTime = usePerformanceMetricsStore((s) => s.frameTime);
  const minFps = usePerformanceMetricsStore((s) => s.minFps);
  const maxFps = usePerformanceMetricsStore((s) => s.maxFps);
  const fpsHistory = usePerformanceMetricsStore((s) => s.history.fps);
  const gpu = usePerformanceMetricsStore((s) => s.gpu);
  const sceneGpu = usePerformanceMetricsStore((s) => s.sceneGpu);
  const memory = usePerformanceMetricsStore((s) => s.memory);
  const gpuName = usePerformanceMetricsStore((s) => s.gpuName);
  const viewport = usePerformanceMetricsStore((s) => s.viewport);
  const vram = usePerformanceMetricsStore((s) => s.vram);

  const shaderDebugInfos = usePerformanceStore((state) => state.shaderDebugInfos);
  const shaderOverrides = usePerformanceStore((state) => state.shaderOverrides);
  const toggleShaderModule = usePerformanceStore((state) => state.toggleShaderModule);
  const temporalReprojectionEnabled = usePerformanceStore((state) => state.temporalReprojectionEnabled);

  const showDepthBuffer = useUIStore((state) => state.showDepthBuffer);
  const setShowDepthBuffer = useUIStore((state) => state.setShowDepthBuffer);
  const showNormalBuffer = useUIStore((state) => state.showNormalBuffer);
  const setShowNormalBuffer = useUIStore((state) => state.setShowNormalBuffer);
  const showTemporalDepthBuffer = useUIStore((state) => state.showTemporalDepthBuffer);
  const setShowTemporalDepthBuffer = useUIStore((state) => state.setShowTemporalDepthBuffer);
  const perfMonitorTab = useUIStore((state) => state.perfMonitorTab);
  const setPerfMonitorTab = useUIStore((state) => state.setPerfMonitorTab);

  const triggerContextLoss = useWebGLContextStore((state) => state.debugTriggerContextLoss);
  const contextStatus = useWebGLContextStore((state) => state.status);

  // -- Local state --
  const [bufferStats, setBufferStats] = useState<BufferStats | null>(null);
  const [selectedShaderKey, setSelectedShaderKey] = useState<string | null>(null);

  const isDevelopment = import.meta.env.MODE !== 'production';

  // Buffer Stats Refresh
  const refreshBufferStats = useCallback(() => {
    const currentStats = usePerformanceMetricsStore.getState().buffers;
    setBufferStats({ ...currentStats });
  }, []);

  useEffect(() => {
    if (perfMonitorTab === 'buffers') refreshBufferStats();
  }, [perfMonitorTab, refreshBufferStats]);

  // Shader Selection
  useEffect(() => {
    const keys = Object.keys(shaderDebugInfos);
    if (keys.length > 0) {
      if (!selectedShaderKey || !shaderDebugInfos[selectedShaderKey]) {
        if (keys.includes('object')) setSelectedShaderKey('object');
        else setSelectedShaderKey(keys[0]!);
      }
    } else {
      setSelectedShaderKey(null);
    }
  }, [shaderDebugInfos, selectedShaderKey]);

  // Derived values
  const fpsColor = getHealthColor(fps, 55, 30);
  const sceneVertices = sceneGpu.triangles * 3 + sceneGpu.lines * 2 + sceneGpu.points;
  const totalVertices = gpu.triangles * 3 + gpu.lines * 2 + gpu.points;
  const isRaymarching = isRaymarchingType(objectType);
  const configKey = getConfigStoreKey(objectType);
  const raySteps = configKey === 'mandelbulb' ? mandelbulbConfig.maxIterations :
    configKey === 'quaternionJulia' ? quaternionJuliaConfig.maxIterations : 0;
  const activeShaderInfo = selectedShaderKey ? shaderDebugInfos[selectedShaderKey] : null;

  // Temporal preview is only available when:
  // 1. Temporal reprojection is enabled in settings
  // 2. AND current object type supports it (mandelbulb, julia, schroedinger)
  const temporalPreviewAvailable = temporalReprojectionEnabled &&
    (objectType === 'mandelbulb' || objectType === 'quaternion-julia' || objectType === 'schroedinger');

  // Graceful handling: turn off temporal preview when object type changes to unsupported
  useEffect(() => {
    if (showTemporalDepthBuffer && !temporalPreviewAvailable) {
      setShowTemporalDepthBuffer(false);
    }
  }, [temporalPreviewAvailable, showTemporalDepthBuffer, setShowTemporalDepthBuffer]);

  // --- Content Panels ---
  const PerfContent = (
    <div className="grid grid-cols-1 gap-5 p-5">
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Zap />} label="Scene Geometry" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Calls" value={sceneGpu.calls} />
          <InfoCard label="Triangles" value={formatMetric(sceneGpu.triangles)} />
          <InfoCard label="Vertices" value={formatMetric(sceneVertices)} />
          <InfoCard label="Points" value={formatMetric(sceneGpu.points)} />
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Layers />} label="Total Rendered" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Calls" value={gpu.calls} />
          <InfoCard label="Triangles" value={formatMetric(gpu.triangles)} />
          <InfoCard label="Vertices" value={formatMetric(totalVertices)} />
          <InfoCard label="Points" value={formatMetric(gpu.points)} />
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Database />} label="Memory" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Textures" value={memory.textures} />
          <InfoCard label="Programs" value={memory.programs} />
          <InfoCard label="Geometries" value={memory.geometries} />
          <InfoCard label="Heap" value={`${memory.heap} MB`} />
        </div>
      </div>
      {isRaymarching && (
        <div className="space-y-3">
          <SectionHeader icon={<Icons.Activity />} label="Raymarching" />
          <div className="grid grid-cols-2 gap-2">
            <InfoCard label="Steps" value={raySteps} highlight />
            <InfoCard label="Precision" value="High" />
          </div>
        </div>
      )}
    </div>
  );

  const SysContent = (
    <div className="space-y-5 p-5">
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Chip />} label="GPU Info" />
        <div className="p-3 bg-[var(--bg-hover)] rounded-lg border border-border-subtle text-xs text-text-secondary font-mono leading-relaxed">
          {gpuName}
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Monitor />} label="Viewport" />
        <div className="grid grid-cols-2 gap-2">
          <InfoCard label="Resolution" value={`${viewport.width} × ${viewport.height}`} />
          <InfoCard label="DPR" value={`${viewport.dpr.toFixed(2)}x`} />
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={<Icons.Database />} label="VRAM Estimation" />
        <div className="bg-[var(--bg-hover)] rounded-lg p-3 space-y-3 border border-border-subtle">
          <div className="flex justify-between items-baseline">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">Total</span>
            <span className="text-sm font-bold font-mono text-text-primary">{formatBytes(vram.total)}</span>
          </div>
          <div className="space-y-2">
            <ProgressBar label="Geometry" value={vram.geometries} total={vram.total} color="bg-indigo-500" />
            <ProgressBar label="Textures" value={vram.textures} total={vram.total} color="bg-pink-500" />
          </div>
        </div>
      </div>
    </div>
  );

  const ShaderContent = (
    <div className="space-y-5 p-5">
      {Object.keys(shaderDebugInfos).length === 0 ? (
        <div className="text-center text-text-tertiary py-8 text-xs">No shader data available</div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
            {Object.keys(shaderDebugInfos).map(key => (
              <button
                key={key}
                onClick={() => setSelectedShaderKey(key)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border
                  ${selectedShaderKey === key
                    ? 'bg-accent/20 text-accent border-accent/30'
                    : 'bg-[var(--bg-hover)] text-text-tertiary border-border-subtle hover:bg-[var(--bg-active)] hover:text-text-secondary'
                  }
                `}
              >
                {formatShaderName(key, objectType)}
              </button>
            ))}
          </div>
          {activeShaderInfo && (
            <div className="animate-in fade-in duration-300 space-y-5">
              <div className="space-y-3">
                <SectionHeader icon={<Icons.Layers />} label="Stats" />
                <div className="grid grid-cols-2 gap-2">
                  <InfoCard label="Vertex" value={formatBytes(activeShaderInfo.vertexShaderLength)} />
                  <InfoCard label="Fragment" value={formatBytes(activeShaderInfo.fragmentShaderLength)} />
                </div>
              </div>
              <div className="space-y-3">
                <SectionHeader icon={<Icons.Zap />} label="Features" />
                <div className="flex flex-wrap gap-2">
                  {activeShaderInfo.features.map(f => (
                    <span key={f} className="px-2 py-1 bg-success border border-success-border text-success rounded text-[9px] font-mono uppercase tracking-wide">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <SectionHeader icon={<Icons.Database />} label="Modules" />
                <div className="border border-border-subtle rounded-lg overflow-hidden">
                  {activeShaderInfo.activeModules.map((mod, i) => {
                    const isEnabled = !shaderOverrides.includes(mod);
                    return (
                      <div key={i} className="flex items-center justify-between p-2 hover:bg-[var(--bg-hover)] border-b border-border-subtle last:border-0 transition-colors">
                        <span className={`text-[10px] font-mono ${isEnabled ? 'text-text-secondary' : 'text-text-tertiary line-through'}`}>{mod}</span>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => toggleShaderModule(mod)}
                          className="scale-75 origin-right"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const BuffersContent = (
    <div className="space-y-5 p-5">
      <div className="flex items-center justify-between">
        <SectionHeader icon={<Icons.Square />} label="Render Targets" />
        <button onClick={refreshBufferStats} className="text-text-tertiary hover:text-text-primary transition-colors">
          <Icons.RefreshCw className="w-3 h-3" />
        </button>
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
            <button
              onClick={triggerContextLoss}
              disabled={contextStatus !== 'active'}
              className={`
                w-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md border transition-all
                flex items-center justify-center gap-2
                ${contextStatus !== 'active'
                  ? 'bg-surface text-text-tertiary border-border-subtle cursor-not-allowed'
                  : 'bg-danger text-danger border-danger-border hover:bg-danger/80 hover:border-danger'
                }
              `}
            >
              <Icons.AlertTriangle className="w-3 h-3" />
              Simulate Context Loss
            </button>
            <div className="text-[9px] text-text-tertiary text-center">
              Status: <span className={
                contextStatus === 'active' ? 'text-success' :
                  contextStatus === 'restoring' ? 'text-warning' :
                    contextStatus === 'failed' ? 'text-danger' : 'text-text-tertiary'
              }>{contextStatus}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

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

      {/* Main Graph Area */}
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

      {/* Content Tabs */}
      <div className="border-t border-border-subtle h-[340px] flex flex-col">
        <Tabs
          variant="minimal"
          fullWidth
          value={perfMonitorTab}
          onChange={(id) => setPerfMonitorTab(id as 'perf' | 'sys' | 'shader' | 'buffers')}
          tabs={[
            { id: 'perf', label: 'Stats', content: PerfContent },
            { id: 'sys', label: 'System', content: SysContent },
            { id: 'shader', label: 'Shader', content: ShaderContent },
            { id: 'buffers', label: 'Buffers', content: BuffersContent }
          ]}
          className="h-full border-b border-border-subtle text-[10px]"

          contentClassName="h-full"
        />
      </div>
    </>
  );
});

// ============================================================================
// SPARKLINE COMPONENT
// ============================================================================
const Sparkline = ({
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
}) => {
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
};

// ============================================================================
// MAIN COMPONENT - NO store subscriptions, minimal re-renders
// ============================================================================
/**
 * Performance Monitor UI Component
 *
 * PERFORMANCE OPTIMIZATION:
 * - Parent has ZERO store subscriptions to avoid re-renders when collapsed
 * - CollapsedView updates via refs (no React re-renders)
 * - ExpandedContent has all subscriptions isolated
 * - This prevents 60x/sec sceneGpu updates from causing layout recalcs
 * @returns The performance monitor overlay component
 */
export function PerformanceMonitor() {
  // -- State (NO store subscriptions here) --
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [didDrag, setDidDrag] = useState(false);

  // -- Dimensions & Positioning --
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(180);
  const [height, setHeight] = useState(48);

  // Motion values for drag
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Resize Observer - only when expanded
  useEffect(() => {
    if (!expanded) {
      setWidth(180);
      setHeight(48);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
        setHeight(entry.contentRect.height);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [expanded]);

  // Panel collision - keeps monitor from being covered by sidebars/toolbars
  usePanelCollision(x, y, width, height, isDragging);

  return (
    <LazyMotion features={domMax}>
      <m.div
        ref={containerRef}
        drag
        dragMomentum={false}
        style={{ x, y }}
        onDragStart={() => { setIsDragging(true); setDidDrag(true); }}
        onDragEnd={() => setTimeout(() => { setIsDragging(false); setDidDrag(false); }, 100)}
        onTap={() => {
          if (!expanded && !didDrag) setExpanded(true);
        }}
        className="absolute top-20 left-4 z-[50] pointer-events-auto select-none"
      >
        {/* Collapsed View - static, no animations */}
        {!expanded && (
          <div
            className="
              relative overflow-hidden rounded-full
              glass-panel hover:brightness-110 cursor-pointer
              shadow-[var(--shadow-hard)]
              transition-all duration-300
            "
          >
            <CollapsedView />
          </div>
        )}

        {/* Expanded View */}
        <AnimatePresence mode="wait">
          {expanded && (
            <m.div
              key="expanded"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="
                flex flex-col w-[360px]
                relative overflow-hidden rounded-2xl
                glass-panel
                shadow-[var(--shadow-hard)]
              "
            >
              <ExpandedContent onCollapse={() => setExpanded(false)} didDrag={didDrag} />
            </m.div>
          )}
        </AnimatePresence>
      </m.div>
    </LazyMotion>
  );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

const SectionHeader = ({ icon, label }: { icon: React.ReactNode, label: string }) => (
  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">
    <span className="opacity-70">{icon}</span>
    <span>{label}</span>
  </div>
);

const InfoCard = ({ label, value, highlight = false }: { label: string, value: string | number, highlight?: boolean }) => (
  <div className="bg-[var(--bg-hover)] rounded-md p-2 border border-[var(--border-subtle)]">
    <div className="text-[9px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">{label}</div>
    <div className={`font-mono text-xs ${highlight ? 'text-accent font-bold' : 'text-[var(--text-secondary)]'}`}>{value}</div>
  </div>
);

const ProgressBar = ({ label, value, total, color }: { label: string, value: number, total: number, color: string }) => (
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

const BufferRow = ({ label, w, h, baseW, highlight }: { label: string, w: number, h: number, baseW: number, highlight?: boolean }) => (
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

const DebugToggle = ({ label, active, onClick, disabled = false }: { label: string, active: boolean, onClick: () => void, disabled?: boolean }) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md border transition-all ${disabled
      ? 'bg-surface text-text-tertiary border-border-subtle cursor-not-allowed opacity-50'
      : active
        ? 'bg-accent/20 text-accent border-accent/50 glow-accent-sm'
        : 'bg-[var(--bg-hover)] text-text-tertiary border-border-subtle hover:bg-[var(--bg-active)] hover:text-text-primary'
      }`}
  >
    {label}
  </button>
);
