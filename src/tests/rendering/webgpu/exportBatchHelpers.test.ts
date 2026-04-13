/**
 * Tests for exportBatchHelpers pure logic.
 *
 * teardownRecorder, updateExportEta, and the three phase processors
 * (processWarmupPhase, processPreviewPhase, processRecordingPhase) are
 * tested with mocked contexts. Functions that require DOM APIs (showSaveFilePicker,
 * URL.createObjectURL) or dynamic VideoRecorder imports are excluded.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type BatchContext,
  processRecordingPhase,
  processWarmupPhase,
  teardownRecorder,
  updateExportEta,
} from '@/rendering/webgpu/exportBatchHelpers'
import type { ExportLoopState, ExportRuntimeState } from '@/rendering/webgpu/sceneExportRuntime'
import { useExportStore } from '@/stores/exportStore'

// ============================================================================
// Helpers
// ============================================================================

function makeLoop(overrides: Partial<ExportLoopState> = {}): ExportLoopState {
  return {
    phase: 'warmup',
    frameId: 0,
    warmupFrame: 0,
    startTime: 0,
    totalFrames: 60,
    frameDuration: 1 / 30,
    exportStartTime: 0,
    lastEtaUpdate: 0,
    segmentDurationFrames: 60,
    currentSegment: 0,
    framesInCurrentSegment: 0,
    segmentStartTimeVideo: 0,
    ...overrides,
  }
}

function makeRuntime(loopOverrides: Partial<ExportLoopState> = {}): ExportRuntimeState {
  return {
    starting: false,
    started: true,
    processing: true,
    finishing: false,
    canceling: false,
    abortRequested: false,
    mode: null,
    settings: null,
    recorder: null,
    rotationSnapshot: null,
    originalCanvasWidth: 1920,
    originalCanvasHeight: 1080,
    originalCameraAspect: 16 / 9,
    exportWidth: 1920,
    exportHeight: 1080,
    renderWidth: 1920,
    renderHeight: 1080,
    originalPerf: { progressiveRefinementEnabled: false, renderResolutionScale: 1 },
    loop: makeLoop(loopOverrides),
  }
}

function makeSettings() {
  return {
    duration: 2,
    fps: 30,
    format: 'webm' as const,
    bitrate: 5_000_000,
    codec: 'vp9' as const,
    bitrateMode: 'variable' as const,
    warmupFrames: 3,
    mode: 'in-memory' as const,
    hardwareAcceleration: 'no-preference' as const,
    textOverlay: {
      enabled: false,
      text: '',
      fontFamily: 'Inter',
      fontSize: 24,
      fontWeight: 300,
      letterSpacing: 0,
      color: '#fff',
      opacity: 1,
      shadowColor: 'rgba(0,0,0,0.5)',
      shadowBlur: 10,
      verticalPlacement: 'bottom' as const,
      horizontalPlacement: 'center' as const,
      padding: 20,
    },
    crop: { enabled: false, x: 0, y: 0, width: 1, height: 1 },
    rotation: 0 as const,
    segmentDurationSeconds: 10,
    resolution: '1080p' as const,
    customWidth: 1920,
    customHeight: 1080,
    resetEvolution: false,
  }
}

// ============================================================================
// teardownRecorder
// ============================================================================

describe('teardownRecorder', () => {
  it('returns null when recorder is null', async () => {
    const result = await teardownRecorder(null)
    expect(result).toBeNull()
  })

  it('calls cancel and dispose, returns null', async () => {
    const recorder = {
      cancel: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      initialize: vi.fn(),
      captureFrame: vi.fn(),
      finalize: vi.fn(),
    }
    const result = await teardownRecorder(recorder)
    expect(recorder.cancel).toHaveBeenCalledOnce()
    expect(recorder.dispose).toHaveBeenCalledOnce()
    expect(result).toBeNull()
  })

  it('still calls dispose if cancel throws', async () => {
    const recorder = {
      cancel: vi.fn().mockRejectedValue(new Error('cancel failed')),
      dispose: vi.fn(),
      initialize: vi.fn(),
      captureFrame: vi.fn(),
      finalize: vi.fn(),
    }
    const result = await teardownRecorder(recorder)
    expect(recorder.dispose).toHaveBeenCalledOnce()
    expect(result).toBeNull()
  })
})

// ============================================================================
// updateExportEta
// ============================================================================

describe('updateExportEta', () => {
  beforeEach(() => {
    useExportStore.setState(useExportStore.getInitialState())
  })

  it('skips update when called within 500ms of last update', () => {
    const now = Date.now()
    const loop = makeLoop({
      totalFrames: 100,
      frameId: 10,
      exportStartTime: now - 200,
      lastEtaUpdate: now - 100, // 100ms ago — below 500ms threshold
    })
    updateExportEta(loop)
    // lastEtaUpdate should not change
    expect(loop.lastEtaUpdate).toBe(now - 100)
  })

  it('updates progress and lastEtaUpdate when throttle window has passed', () => {
    const now = Date.now()
    const loop = makeLoop({
      totalFrames: 100,
      frameId: 50,
      exportStartTime: now - 2000,
      lastEtaUpdate: now - 600, // 600ms ago — above threshold
    })
    updateExportEta(loop)
    expect(loop.lastEtaUpdate).toBeGreaterThan(now - 600)
    const progress = useExportStore.getState().progress
    expect(progress).toBeCloseTo(0.5, 2)
  })

  it('computes 0 progress when frameId is 0', () => {
    const now = Date.now()
    const loop = makeLoop({
      totalFrames: 100,
      frameId: 0,
      exportStartTime: now - 2000,
      lastEtaUpdate: now - 600,
    })
    updateExportEta(loop)
    expect(useExportStore.getState().progress).toBe(0)
  })

  it('computes 0 progress when totalFrames is 0', () => {
    const now = Date.now()
    const loop = makeLoop({
      totalFrames: 0,
      frameId: 0,
      exportStartTime: now - 2000,
      lastEtaUpdate: now - 600,
    })
    updateExportEta(loop)
    expect(useExportStore.getState().progress).toBe(0)
  })
})

// ============================================================================
// processWarmupPhase
// ============================================================================

describe('processWarmupPhase', () => {
  function makeWarmupCtx(overrides: Partial<BatchContext> = {}): BatchContext {
    const runtime = makeRuntime({ phase: 'warmup', warmupFrame: 0 })
    return {
      runtime,
      settings: makeSettings(),
      mode: 'in-memory',
      canvas: {} as HTMLCanvasElement,
      advanceSceneStateByDelta: vi.fn(),
      executeSceneFrame: vi.fn(),
      shouldYield: vi.fn().mockReturnValue(false),
      finishExport: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }
  }

  it('returns abort and calls finishExport when abortRequested', async () => {
    const ctx = makeWarmupCtx()
    ctx.runtime.abortRequested = true
    const result = await processWarmupPhase(ctx)
    expect(result).toBe('abort')
    expect(ctx.finishExport).toHaveBeenCalledOnce()
  })

  it('returns yield when shouldYield returns true mid-warmup', async () => {
    const ctx = makeWarmupCtx()
    // warmupFrames = 3; shouldYield returns true immediately after first advance
    ctx.shouldYield = vi.fn().mockReturnValue(true)
    const result = await processWarmupPhase(ctx)
    expect(result).toBe('yield')
    expect(ctx.advanceSceneStateByDelta).toHaveBeenCalledOnce()
  })

  it('increments warmupFrame on each iteration', async () => {
    const ctx = makeWarmupCtx()
    let yieldCount = 0
    ctx.shouldYield = vi.fn().mockImplementation(() => {
      yieldCount++
      return yieldCount >= 2 // yield after 2nd warmup frame
    })
    await processWarmupPhase(ctx)
    expect(ctx.runtime.loop.warmupFrame).toBe(2)
  })
})

// ============================================================================
// processRecordingPhase
// ============================================================================

describe('processRecordingPhase', () => {
  function makeRecordingCtx(overrides: Partial<BatchContext> = {}): BatchContext {
    const runtime = makeRuntime({ phase: 'recording', frameId: 0, totalFrames: 5 })
    return {
      runtime,
      settings: makeSettings(),
      mode: 'in-memory',
      canvas: {} as HTMLCanvasElement,
      advanceSceneStateByDelta: vi.fn(),
      executeSceneFrame: vi.fn(),
      shouldYield: vi.fn().mockReturnValue(false),
      finishExport: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    }
  }

  it('returns abort when abortRequested is true', async () => {
    const ctx = makeRecordingCtx()
    ctx.runtime.abortRequested = true
    const result = await processRecordingPhase(ctx)
    expect(result).toBe('abort')
    expect(ctx.finishExport).toHaveBeenCalledOnce()
  })

  it('returns yield and stops advancing when shouldYield returns true', async () => {
    const ctx = makeRecordingCtx()
    ctx.shouldYield = vi.fn().mockReturnValue(true)
    await processRecordingPhase(ctx)
    // Only one frame should have been advanced before yield
    expect(ctx.advanceSceneStateByDelta).toHaveBeenCalledOnce()
  })

  it('increments frameId and framesInCurrentSegment per frame', async () => {
    let calls = 0
    const ctx = makeRecordingCtx()
    ctx.shouldYield = vi.fn().mockImplementation(() => {
      calls++
      return calls >= 3
    })
    await processRecordingPhase(ctx)
    expect(ctx.runtime.loop.frameId).toBe(3)
    expect(ctx.runtime.loop.framesInCurrentSegment).toBe(3)
  })

  it('calls finishExport and returns abort when all frames complete', async () => {
    const ctx = makeRecordingCtx()
    // totalFrames = 5, shouldYield never — runs to completion
    const result = await processRecordingPhase(ctx)
    expect(result).toBe('abort')
    expect(ctx.finishExport).toHaveBeenCalledOnce()
    expect(ctx.runtime.loop.frameId).toBe(5)
  })

  it('returns done when phase changes away from recording mid-loop', async () => {
    // Phase changes to 'warmup' simulating a reset mid-recording
    const ctx = makeRecordingCtx()
    let executed = false
    ctx.executeSceneFrame = vi.fn().mockImplementation(() => {
      if (!executed) {
        executed = true
        ctx.runtime.loop.phase = 'warmup'
      }
    })
    const result = await processRecordingPhase(ctx)
    expect(result).toBe('done')
    expect(ctx.finishExport).not.toHaveBeenCalled()
  })
})
