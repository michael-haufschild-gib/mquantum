/**
 * React lifecycle hook for WebGPU scene pass setup.
 *
 * Owns pass setup serialization, abort handling, warm-swap/full-rebuild state,
 * and graph-change reset behavior.
 *
 * @module rendering/webgpu/useScenePassSetup
 */

import { type RefObject,useEffect, useRef } from 'react'

import { logger } from '@/lib/logger'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'

import type { WebGPUCamera } from './core/WebGPUCamera'
import type { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import { waitForPaint } from './sceneExportRuntime'
import {
  buildPassSetupKey,
  extractPPConfig,
  extractSchrodingerConfig,
  type PassConfig,
  type PPPassConfig,
  type SchrodingerPassConfig,
  shallowEqual,
  shouldForceFullRebuildForQuantumModeTransition,
} from './scenePassConfig'
import {
  cleanupPPPasses,
  cleanupSchrodingerPasses,
  ensureTemporalResources,
  removeStaleTemporalResources,
  setupPPPasses,
  setupSchrodingerPasses,
  setupSharedResources,
  warmSwapSchrodingerPasses,
} from './scenePassSetup'
import { resolveCanvasPixelSize } from './utils/sceneMath'

/** Dependencies for `useScenePassSetup`. */
export interface ScenePassSetupDeps {
  /** Render graph receiving pass/resource mutations. */
  graph: WebGPURenderGraph
  /** Canvas used for testability attributes and size sync after setup. */
  canvas: HTMLCanvasElement
  /** Camera ref whose aspect ratio is refreshed after graph resize. */
  cameraRef: RefObject<WebGPUCamera | null>
  /** Full pass config derived from scene stores. */
  fullConfig: PassConfig
}

/**
 * Set up and update the WebGPU render passes for the current scene config.
 *
 * @param deps - Graph, canvas, camera ref, and full pass config.
 * @returns Nothing; setup runs through React effects.
 */
export function useScenePassSetup({ graph, canvas, cameraRef, fullConfig }: ScenePassSetupDeps) {
  const setupGenerationRef = useRef(0)
  const setupTaskRef = useRef<Promise<void>>(Promise.resolve())
  const lastSchrodingerConfigRef = useRef<SchrodingerPassConfig | null>(null)
  const lastPPConfigRef = useRef<PPPassConfig | null>(null)
  const needsFullRebuildRef = useRef(true)
  const lastGraphRef = useRef<WebGPURenderGraph | null>(null)

  const schrodingerConfig = extractSchrodingerConfig(fullConfig)
  const ppConfig = extractPPConfig(fullConfig)
  const setupConfigKey = buildPassSetupKey(schrodingerConfig, ppConfig)
  const latestSetupConfigRef = useRef({ fullConfig, schrodingerConfig, ppConfig })
  latestSetupConfigRef.current = { fullConfig, schrodingerConfig, ppConfig }

  // Reset rebuild state when the graph instance changes (e.g. WebGPUCanvas re-init).
  // A new graph has an empty resource pool; warm swap would fail without a full rebuild.
  if (lastGraphRef.current !== graph) {
    lastGraphRef.current = graph
    needsFullRebuildRef.current = true
    lastSchrodingerConfigRef.current = null
    lastPPConfigRef.current = null
    setupTaskRef.current = Promise.resolve()
  }

  useEffect(() => {
    let cancelled = false
    const setupGeneration = ++setupGenerationRef.current
    const shouldAbortSetup = () => cancelled || setupGeneration !== setupGenerationRef.current
    const previousSetupTask = setupTaskRef.current
    const { fullConfig, schrodingerConfig, ppConfig } = latestSetupConfigRef.current

    const setupPasses = async () => {
      await previousSetupTask
      if (shouldAbortSetup()) return

      // Compute rebuild decisions AFTER awaiting the previous task.
      // The previous task's abort handler may have set needsFullRebuildRef
      // and nulled the config refs, so read the up-to-date values.
      const schrodingerChanged = !shallowEqual(lastSchrodingerConfigRef.current, schrodingerConfig)
      const ppChanged = !shallowEqual(lastPPConfigRef.current, ppConfig)
      const forceFullRebuildForModeTransition = shouldForceFullRebuildForQuantumModeTransition(
        lastSchrodingerConfigRef.current,
        schrodingerConfig
      )
      const isFullRebuild = needsFullRebuildRef.current || forceFullRebuildForModeTransition

      const perfStore = usePerformanceStore.getState()
      perfStore.setShaderCompiling('pipeline', true)
      await waitForPaint()
      if (shouldAbortSetup()) {
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        return
      }

      // Track whether this setup touched the graph. If it did and gets aborted,
      // force a full rebuild so the next setup does not warm-swap on a partially
      // constructed or cleared graph.
      let graphTouched = false

      // E2E testability: bump a separate "real recompile" counter ONLY when
      // Schroedinger passes are rebuilt, not for no-op effect re-runs.
      let recompiledThisPass = false
      try {
        if (isFullRebuild) {
          graph.clearPasses()
          graphTouched = true
          recompiledThisPass = true
          if (shouldAbortSetup()) return
          setupSharedResources(graph, fullConfig)
          if (shouldAbortSetup()) return
          await setupSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return
          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        } else if (schrodingerChanged && ppChanged) {
          ensureTemporalResources(graph, fullConfig)
          graphTouched = true
          recompiledThisPass = true
          if (shouldAbortSetup()) return
          await warmSwapSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return
          removeStaleTemporalResources(graph, fullConfig)
          cleanupSchrodingerPasses(graph, fullConfig)
          cleanupPPPasses(graph, fullConfig)
          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        } else if (schrodingerChanged) {
          ensureTemporalResources(graph, fullConfig)
          graphTouched = true
          recompiledThisPass = true
          if (shouldAbortSetup()) return
          await warmSwapSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return
          removeStaleTemporalResources(graph, fullConfig)
          cleanupSchrodingerPasses(graph, fullConfig)
        } else if (ppChanged) {
          cleanupPPPasses(graph, fullConfig)
          graphTouched = true
          recompiledThisPass = true
          if (shouldAbortSetup()) return
          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        }
      } catch (err) {
        logger.error('[WebGPUScene] CRITICAL: pass setup failed:', err)
        needsFullRebuildRef.current = true
        lastSchrodingerConfigRef.current = null
        lastPPConfigRef.current = null
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        graph.compile()
        return
      } finally {
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        // If this setup modified the graph and is being aborted, force a full
        // rebuild so the successor does not warm-swap on a broken graph.
        if (graphTouched && shouldAbortSetup()) {
          needsFullRebuildRef.current = true
          lastSchrodingerConfigRef.current = null
          lastPPConfigRef.current = null
        }
      }

      if (shouldAbortSetup()) {
        logger.warn(`[WebGPUScene] ABORT mid-rebuild (gen=${setupGeneration}), clearing graph`)
        graph.clearPasses()
        needsFullRebuildRef.current = true
        lastSchrodingerConfigRef.current = null
        lastPPConfigRef.current = null
        return
      }

      graph.compile()
      needsFullRebuildRef.current = false
      lastSchrodingerConfigRef.current = { ...schrodingerConfig }
      lastPPConfigRef.current = { ...ppConfig }

      // E2E testability: expose pipeline generation on the canvas so tests can
      // wait for the new pipeline to be active instead of polling isShaderCompiling.
      canvas.setAttribute('data-pipeline-gen', String(setupGeneration))
      // E2E testability: bump only on REAL recompiles (warmSwap or fullRebuild),
      // not no-op useEffect re-runs. Tests distinguish pass-config changes from
      // runtime-uniform changes with this counter.
      if (recompiledThisPass) {
        const prevRebuilds = parseInt(canvas.getAttribute('data-pipeline-rebuilds') ?? '0', 10)
        canvas.setAttribute('data-pipeline-rebuilds', String(prevRebuilds + 1))
      }

      logger.log(
        `[WebGPUScene] setup COMPLETE (gen=${setupGeneration}), isFullRebuild=${isFullRebuild}`
      )

      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        const renderScale = usePerformanceStore.getState().renderResolutionScale
        const effectiveDpr = window.devicePixelRatio * renderScale
        const { width: w, height: h } = resolveCanvasPixelSize(
          canvas.clientWidth,
          canvas.clientHeight,
          effectiveDpr
        )
        canvas.width = w
        canvas.height = h
        graph.setSize(w, h)
        if (cameraRef.current) {
          cameraRef.current.setAspect(w / h)
        }
      }
    }

    const setupTask = setupPasses().catch((err) => {
      logger.error('[WebGPUScene] setupPasses task failed:', err)
      needsFullRebuildRef.current = true
      lastSchrodingerConfigRef.current = null
      lastPPConfigRef.current = null
    })
    setupTaskRef.current = setupTask

    return () => {
      cancelled = true
    }
  }, [graph, canvas, setupConfigKey, cameraRef])
}
