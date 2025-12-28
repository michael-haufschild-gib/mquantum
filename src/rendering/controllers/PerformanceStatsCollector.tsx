import { FRAME_PRIORITY } from '@/rendering/core/framePriorities';
import { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore';
import { useUIStore } from '@/stores/uiStore';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const VRAM_UPDATE_INTERVAL = 2000; // ms

// Measurement tiers - determines what overhead we incur
const TIER_HIDDEN = 0;      // Nothing measured
const TIER_FPS_ONLY = 1;    // Frame counting for FPS/frameTime only
const TIER_FULL_STATS = 2;  // gl.render wrapper, GPU stats, memory

/**
 * Collects and updates performance metrics from the Three.js renderer.
 *
 * Uses tiered measurement to minimize overhead:
 * - Hidden: Zero measurement
 * - Collapsed: FPS/frameTime only (no gl.render wrapper)
 * - Expanded + Stats tab: Full measurement
 * - Expanded + System tab: FPS + VRAM traversal
 * - Expanded + other tabs: FPS only
 *
 * @returns null - this component doesn't render anything visible
 */
export function PerformanceStatsCollector() {
  const { gl, scene, size, viewport } = useThree((state) => ({
    gl: state.gl,
    scene: state.scene,
    size: state.size,
    viewport: state.viewport
  }));

  const updateMetrics = usePerformanceMetricsStore((state) => state.updateMetrics);
  const setGpuName = usePerformanceMetricsStore((state) => state.setGpuName);

  // Subscribe to visibility state for tiered measurement
  const showPerfMonitor = useUIStore((s) => s.showPerfMonitor);
  const perfMonitorExpanded = useUIStore((s) => s.perfMonitorExpanded);
  const perfMonitorTab = useUIStore((s) => s.perfMonitorTab);

  // Compute measurement tier based on visibility state
  const measurementTier = useMemo(() => {
    if (!showPerfMonitor) return TIER_HIDDEN;
    if (!perfMonitorExpanded) return TIER_FPS_ONLY;          // Collapsed
    if (perfMonitorTab === 'perf') return TIER_FULL_STATS;   // Stats tab needs full measurement
    return TIER_FPS_ONLY;  // Other tabs (System, Shader, Buffers) only need FPS
  }, [showPerfMonitor, perfMonitorExpanded, perfMonitorTab]);

  // VRAM is a separate flag - only needed when System tab is active
  const needsVRAM = showPerfMonitor && perfMonitorExpanded && perfMonitorTab === 'sys';

  // Accumulators
  const framesRef = useRef(0);
  const prevTimeRef = useRef(performance.now());
  const cpuAccumulatorRef = useRef(0);
  const minFpsRef = useRef(Infinity);
  const maxFpsRef = useRef(0);

  // Store render stats from the most recent completed frame
  const lastFrameStatsRef = useRef({ calls: 0, triangles: 0, points: 0, lines: 0 });
  // Accumulate stats for the current frame (resets every frame)
  const activeFrameStatsRef = useRef({ calls: 0, triangles: 0, points: 0, lines: 0 });

  const lastVramUpdateRef = useRef(0);
  const currentVramRef = useRef({ geometries: 0, textures: 0, total: 0 });

  // Initialization: Hardware Detection (always runs once)
  useEffect(() => {
    // Attempt to get GPU renderer name
    const debugInfo = gl.getContext().getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getContext().getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      // Clean up strings like "ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)"
      const cleanName = renderer.replace(/angle\s*\((.+)\)/i, '$1').split(',')[1]?.trim() || renderer;
      setGpuName(cleanName);
    }

    // Expose store for e2e testing
    if (import.meta.env.DEV) {
      // @ts-expect-error - Attaching store to window for e2e testing
      window.__PERF_STORE__ = usePerformanceMetricsStore;
    }

    // Cleanup window property on unmount
    return () => {
      if (import.meta.env.DEV) {
        // @ts-expect-error - Cleaning up e2e testing property
        delete window.__PERF_STORE__;
      }
    };
  }, [gl, setGpuName]);

  // Hook: Render Instrumentation - ONLY when Stats tab needs CPU time + GPU stats
  useEffect(() => {
    // Only wrap gl.render when we need CPU time and GPU stats (Stats tab)
    if (measurementTier !== TIER_FULL_STATS) return;

    const originalRender = gl.render;
    gl.render = function (...args) {
      const start = performance.now();
      originalRender.apply(this, args);
      const end = performance.now();
      cpuAccumulatorRef.current += (end - start);

      // Accumulate stats from this render pass
      // gl.info.render resets automatically at start of render(), so we can safely add its values
      activeFrameStatsRef.current.calls += gl.info.render.calls;
      activeFrameStatsRef.current.triangles += gl.info.render.triangles;
      activeFrameStatsRef.current.points += gl.info.render.points;
      activeFrameStatsRef.current.lines += gl.info.render.lines;
    };
    return () => { gl.render = originalRender; };
  }, [gl, measurementTier]);

  // VRAM Estimation Logic
  const updateVRAM = () => {
    let geomMem = 0;
    let texMem = 0;

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        if (object.geometry) {
           // Estimate attributes
           const geom = object.geometry;
           if (geom.attributes) {
             Object.values(geom.attributes).forEach((attr) => {
                const bufferAttr = attr as THREE.BufferAttribute;
                if (bufferAttr.array) {
                  // Approximate memory: bytes per element * count
                  geomMem += bufferAttr.array.byteLength;
                }
             });
           }
           if (geom.index && geom.index.array) {
             geomMem += geom.index.array.byteLength;
           }
        }
        if (object.material) {
           const mats = Array.isArray(object.material) ? object.material : [object.material];
           mats.forEach((mat) => {
             Object.values(mat).forEach((prop) => {
               if (prop && prop instanceof THREE.Texture && prop.image) {
                 const w = prop.image.width || 0;
                 const h = prop.image.height || 0;
                 // RGBA = 4 bytes, estimate mips * 1.33
                 texMem += (w * h * 4) * 1.33;
               }
             });
           });
        }
      }
    });

    return { geometries: geomMem, textures: texMem, total: geomMem + texMem };
  };

  // Helper to get heap memory
  const getHeapMemory = () => {
    return (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      ? Math.round((performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1048576)
      : 0;
  };

  // Frame Loop - tiered based on visibility state
  useFrame(() => {
    // Tier 0: Skip everything when hidden
    if (measurementTier === TIER_HIDDEN) return;

    // Tier 1+: Snapshot accumulated stats from previous frame (only meaningful if wrapper active)
    if (measurementTier === TIER_FULL_STATS) {
      const last = lastFrameStatsRef.current;
      const active = activeFrameStatsRef.current;

      last.calls = active.calls;
      last.triangles = active.triangles;
      last.points = active.points;
      last.lines = active.lines;

      // Reset accumulator for the current frame
      active.calls = 0;
      active.triangles = 0;
      active.points = 0;
      active.lines = 0;
    }

    // Count frames for FPS calculation
    framesRef.current++;
    const time = performance.now();
    const delta = time - prevTimeRef.current;

    // Update at 2Hz (every 500ms)
    if (delta >= 500) {
      const fps = Math.round((framesRef.current * 1000) / delta);
      const frameTime = delta / framesRef.current;

      minFpsRef.current = Math.min(minFpsRef.current, fps);
      if (time > 3000) maxFpsRef.current = Math.max(maxFpsRef.current, fps);

      // Read current history via getState() to avoid subscription-based re-renders
      const currentHistory = usePerformanceMetricsStore.getState().history;

      // Build update object based on tier
      // Tier 1: Basic FPS metrics only (collapsed view, non-Stats tabs)
      const update: Parameters<typeof updateMetrics>[0] = {
        fps,
        frameTime: parseFloat(frameTime.toFixed(1)),
        minFps: minFpsRef.current === Infinity ? fps : minFpsRef.current,
        maxFps: maxFpsRef.current,
        viewport: { width: size.width, height: size.height, dpr: viewport.dpr },
        history: {
          fps: [...currentHistory.fps.slice(1), fps],
          cpu: currentHistory.cpu,  // Preserve existing
          mem: currentHistory.mem,  // Preserve existing
        }
      };

      // Tier 2 (Stats tab): Add CPU time, GPU stats, memory
      if (measurementTier === TIER_FULL_STATS) {
        const avgCpuTime = cpuAccumulatorRef.current / framesRef.current;
        const heap = getHeapMemory();

        update.cpuTime = parseFloat(avgCpuTime.toFixed(2));
        update.gpu = { ...lastFrameStatsRef.current };
        update.memory = {
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length ?? 0,
          heap,
        };
        update.history = {
          fps: [...currentHistory.fps.slice(1), fps],
          cpu: [...currentHistory.cpu.slice(1), avgCpuTime],
          mem: [...currentHistory.mem.slice(1), heap],
        };
        cpuAccumulatorRef.current = 0;
      }

      // VRAM: Only when System tab is active (expensive scene traversal)
      if (needsVRAM) {
        const intervalElapsed = time - lastVramUpdateRef.current > VRAM_UPDATE_INTERVAL;
        if (intervalElapsed) {
          currentVramRef.current = updateVRAM();
          lastVramUpdateRef.current = time;
        }
        update.vram = currentVramRef.current;
      }

      updateMetrics(update);
      framesRef.current = 0;
      prevTimeRef.current = time;
    }
  }, FRAME_PRIORITY.STATS);

  return null;
}
