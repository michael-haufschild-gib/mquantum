/**
 * Production vs Development Diagnostics
 *
 * Temporary diagnostic component to identify why prod runs ~18% slower than dev.
 * Add this inside the Canvas to collect diagnostic information.
 *
 * Usage: Import and add <ProdDevDiagnostics /> inside your Canvas component.
 * Then compare console output between dev and prod builds.
 *
 * @see docs/bugfixing/log/prod-slower-fps-than-dev.md
 */

import { usePerformanceStore } from '@/stores/performanceStore';
import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

interface DiagnosticData {
  // Environment
  mode: string;
  userAgent: string;

  // WebGL Context
  contextAttributes: WebGLContextAttributes | null;
  renderer: string;
  vendor: string;
  maxTextureSize: number;
  maxViewportDims: number[];

  // Three.js Renderer Info
  programCount: number;
  geometryCount: number;
  textureCount: number;

  // WebGL Capabilities
  fragmentPrecision: string;
  vertexPrecision: string;
  extensionCount: number;

  // Canvas/Viewport
  canvasWidth: number;
  canvasHeight: number;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  nativeWidth: number;
  nativeHeight: number;
  totalPixels: number;

  // Render Settings
  renderResolutionScale: number;
  scaledWidth: number;
  scaledHeight: number;
  scaledPixels: number;

  // Performance
  renderCallsPerFrame: number[];
  avgRenderCalls: number;
  frameTimings: number[];
  avgFrameTime: number;
}

export function ProdDevDiagnostics() {
  const { gl, size, viewport } = useThree();
  const renderCountRef = useRef(0);
  const frameRenderCountsRef = useRef<number[]>([]);
  const frameTimingsRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef(performance.now());
  const originalRenderRef = useRef<typeof gl.render | null>(null);
  const frameCountRef = useRef(0);

  // Wrap gl.render to count calls
  useEffect(() => {
    originalRenderRef.current = gl.render.bind(gl);

    gl.render = function(...args: Parameters<typeof gl.render>) {
      renderCountRef.current++;
      return originalRenderRef.current!(...args);
    };

    return () => {
      if (originalRenderRef.current) {
        gl.render = originalRenderRef.current;
      }
    };
  }, [gl]);

  // Collect frame data
  useFrame(() => {
    const now = performance.now();
    const frameTime = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    // Record render calls for this frame
    frameRenderCountsRef.current.push(renderCountRef.current);
    frameTimingsRef.current.push(frameTime);
    renderCountRef.current = 0;

    // Keep last 120 frames
    if (frameRenderCountsRef.current.length > 120) {
      frameRenderCountsRef.current.shift();
    }
    if (frameTimingsRef.current.length > 120) {
      frameTimingsRef.current.shift();
    }

    frameCountRef.current++;
  });

  // Log diagnostics every 5 seconds
  useEffect(() => {
    const logDiagnostics = () => {
      const context = gl.getContext() as WebGL2RenderingContext;

      const canvas = gl.domElement;
      const dpr = viewport.dpr;
      const nativeWidth = Math.floor(size.width * dpr);
      const nativeHeight = Math.floor(size.height * dpr);

      const renderCounts = frameRenderCountsRef.current;
      const avgRenderCalls = renderCounts.length > 0
        ? renderCounts.reduce((a, b) => a + b, 0) / renderCounts.length
        : 0;

      const timings = frameTimingsRef.current;
      const avgFrameTime = timings.length > 0
        ? timings.reduce((a, b) => a + b, 0) / timings.length
        : 0;

      // Get render resolution scale from performance store
      const renderResolutionScale = usePerformanceStore.getState().renderResolutionScale;
      const scaledWidth = Math.floor(nativeWidth * renderResolutionScale);
      const scaledHeight = Math.floor(nativeHeight * renderResolutionScale);

      // Get Three.js renderer info (programs, geometries, textures)
      const info = gl.info;
      const programCount = info.programs?.length ?? 0;
      const geometryCount = info.memory?.geometries ?? 0;
      const textureCount = info.memory?.textures ?? 0;

      // Get WebGL capabilities (precision, extensions)
      const fragPrecision = context.getShaderPrecisionFormat(context.FRAGMENT_SHADER, context.HIGH_FLOAT);
      const vertPrecision = context.getShaderPrecisionFormat(context.VERTEX_SHADER, context.HIGH_FLOAT);
      const fragmentPrecision = fragPrecision ? `${fragPrecision.precision}bit (${fragPrecision.rangeMin}-${fragPrecision.rangeMax})` : 'unknown';
      const vertexPrecision = vertPrecision ? `${vertPrecision.precision}bit (${vertPrecision.rangeMin}-${vertPrecision.rangeMax})` : 'unknown';
      const extensions = context.getSupportedExtensions();
      const extensionCount = extensions?.length ?? 0;

      // Use standard WebGL2 RENDERER/VENDOR parameters (Firefox deprecated WEBGL_debug_renderer_info)
      const renderer = context.getParameter(context.RENDERER) || 'unknown';
      const vendor = context.getParameter(context.VENDOR) || 'unknown';

      const data: DiagnosticData = {
        mode: import.meta.env.MODE,
        userAgent: navigator.userAgent.slice(0, 100),

        contextAttributes: context.getContextAttributes(),
        renderer,
        vendor,
        maxTextureSize: context.getParameter(context.MAX_TEXTURE_SIZE),
        maxViewportDims: context.getParameter(context.MAX_VIEWPORT_DIMS),

        programCount,
        geometryCount,
        textureCount,

        fragmentPrecision,
        vertexPrecision,
        extensionCount,

        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        cssWidth: size.width,
        cssHeight: size.height,
        dpr,
        nativeWidth,
        nativeHeight,
        totalPixels: nativeWidth * nativeHeight,

        renderResolutionScale,
        scaledWidth,
        scaledHeight,
        scaledPixels: scaledWidth * scaledHeight,

        renderCallsPerFrame: renderCounts.slice(-10),
        avgRenderCalls,
        frameTimings: timings.slice(-10).map(t => Math.round(t * 100) / 100),
        avgFrameTime: Math.round(avgFrameTime * 100) / 100,
      };

      console.log('%c=== PROD/DEV DIAGNOSTICS ===', 'background: #222; color: #bada55; font-size: 16px;');
      console.log('%cMode:', 'font-weight: bold', data.mode);
      console.log('%cRenderer:', 'font-weight: bold', data.renderer);
      console.log('%cPrograms/Geometries/Textures:', 'font-weight: bold', `${data.programCount} / ${data.geometryCount} / ${data.textureCount}`);
      console.log('%cShader Precision (frag/vert):', 'font-weight: bold', `${data.fragmentPrecision} / ${data.vertexPrecision}`);
      console.log('%cExtensions:', 'font-weight: bold', data.extensionCount);
      console.log('%cViewport:', 'font-weight: bold', `${data.cssWidth}x${data.cssHeight} CSS, ${data.nativeWidth}x${data.nativeHeight} native (DPR: ${data.dpr})`);
      console.log('%cRender Scale:', 'font-weight: bold', `${data.renderResolutionScale} (${data.scaledWidth}x${data.scaledHeight} = ${data.scaledPixels.toLocaleString()} scaled pixels)`);
      console.log('%cTotal Pixels:', 'font-weight: bold', data.totalPixels.toLocaleString());
      console.log('%cAvg Render Calls/Frame:', 'font-weight: bold', data.avgRenderCalls.toFixed(2));
      console.log('%cAvg Frame Time:', 'font-weight: bold', `${data.avgFrameTime.toFixed(2)}ms (${(1000 / data.avgFrameTime).toFixed(1)} FPS)`);
      console.log('%cContext Attributes:', 'font-weight: bold', data.contextAttributes);
      console.log('%cRecent Frame Timings:', 'font-weight: bold', data.frameTimings);
      console.log('%cFull Data:', 'font-weight: bold', data);

      // Expose for comparison
      (window as unknown as { __DIAG__: DiagnosticData }).__DIAG__ = data;
    };

    // Initial log after 3 seconds (let things stabilize)
    const initialTimeout = setTimeout(logDiagnostics, 3000);

    // Periodic log every 5 seconds
    const interval = setInterval(logDiagnostics, 5000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [gl, size, viewport]);

  return null;
}
