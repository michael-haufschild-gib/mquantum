import { getPlaneMultiplier } from '@/lib/animation/biasCalculation'
import { VideoRecorder } from '@/lib/export/video'
import { BASE_ROTATION_RATE, useAnimationStore } from '@/stores/animationStore'
import { useExportStore } from '@/stores/exportStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useUIStore } from '@/stores/uiStore'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Headless component that orchestrates the video export process.
 * It manages the render loop, frame capture, and encoding steps.
 * @returns null
 */
export function VideoExportController() {
  const { gl, advance, camera } = useThree()
  const {
    isExporting,
    settings,
    status,
    setStatus,
    setProgress,
    setPreviewUrl,
    setEta,
    setError,
    exportMode
  } = useExportStore()

  // Refs for state persistence
  const recorderRef = useRef<VideoRecorder | null>(null)
  const abortRef = useRef<boolean>(false)
  const exportStartedRef = useRef<boolean>(false) // Prevents double-invocation of startExport
  const originalSizeRef = useRef<THREE.Vector2>(new THREE.Vector2())
  const originalPixelRatioRef = useRef<number>(1)
  const originalCameraAspectRef = useRef<number>(1)
  const originalPerfSettingsRef = useRef<{ quality: number; lowQualityAnim: boolean; progressiveRefinementEnabled: boolean; renderResolutionScale: number }>({ quality: 1, lowQualityAnim: true, progressiveRefinementEnabled: true, renderResolutionScale: 1.0 })

  // Rotation state snapshot for stream mode (save after warmup, restore before main recording)
  const rotationSnapshotRef = useRef<Record<string, number> | null>(null)

  // Refs for loop management
  const loopStateRef = useRef({
    phase: 'warmup' as 'warmup' | 'preview' | 'recording',
    frameId: 0,
    warmupFrame: 0,
    startTime: 0,
    totalFrames: 0,
    frameDuration: 0,
    exportStartTime: 0,
    lastEtaUpdate: 0,
    // Stream Mode
    mainStreamHandle: undefined as FileSystemFileHandle | undefined,
    // Segmented Export State
    segmentDurationFrames: 0,
    currentSegment: 0,
    framesInCurrentSegment: 0,
    segmentStartTimeVideo: 0
  })

  const restoreState = useCallback(() => {
    // Restore Renderer
    if (originalSizeRef.current.x > 0 && originalSizeRef.current.y > 0) {
        gl.setSize(originalSizeRef.current.x, originalSizeRef.current.y, false)
        gl.setPixelRatio(originalPixelRatioRef.current)
    }

    // Restore Camera Aspect Ratio
    if (camera instanceof THREE.PerspectiveCamera && originalCameraAspectRef.current > 0) {
        camera.aspect = originalCameraAspectRef.current
        camera.updateProjectionMatrix()
    }

    // Restore Performance Settings
    const perfStore = usePerformanceStore.getState()
    perfStore.setProgressiveRefinementEnabled(originalPerfSettingsRef.current.progressiveRefinementEnabled)
    perfStore.setRefinementStage('final')
    perfStore.setFractalAnimationLowQuality(originalPerfSettingsRef.current.lowQualityAnim)
    perfStore.setRenderResolutionScale(originalPerfSettingsRef.current.renderResolutionScale)

    // Clear rotation snapshot
    rotationSnapshotRef.current = null
  }, [gl, camera])

  const handleError = useCallback((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Export failed')
      setStatus('error')
      restoreState()
      exportStartedRef.current = false
      if (recorderRef.current) {
          recorderRef.current.dispose()
          recorderRef.current = null
      }
  }, [setError, setStatus, restoreState])

  const triggerDownload = (blob: Blob, filename: string) => {
      // Ensure filename has correct extension if not already
      const { format } = useExportStore.getState().settings
      const ext = format === 'webm' ? '.webm' : '.mp4'
      const finalFilename = filename.endsWith(ext) ? filename : filename.replace(/\.(mp4|webm)$/, '') + ext

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = finalFilename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const finishExport = useCallback(async () => {
    try {
      const { exportMode, setCompletionDetails, isExporting: stillExporting } = useExportStore.getState()

      // If aborted, clean up resources only - don't modify state
      // State is already handled by the cancellation effect to avoid race conditions
      if (abortRef.current) {
        // Recorder cleanup is now handled in the cancellation effect
        // Just restore renderer state and exit
        restoreState()
        exportStartedRef.current = false

        // Only set status to idle if user hasn't already started a new export
        // This prevents the race condition where finishExport overwrites 'rendering' status
        if (!stillExporting) {
          setStatus('idle')
        }
        return
      }

      setStatus('encoding')
      const blob = await recorderRef.current?.finalize()

      // Handle Final Output
      if (exportMode === 'in-memory') {
          if (blob) {
            const url = URL.createObjectURL(blob)
            setPreviewUrl(url)
            setProgress(1)
            setStatus('completed')
            setCompletionDetails({ type: 'in-memory' })
          } else {
            throw new Error('No output generated')
          }
      } else if (exportMode === 'stream') {
          // Stream completed (file already on disk)
          setProgress(1)
          setStatus('completed')
          setCompletionDetails({ type: 'stream' })
      } else if (exportMode === 'segmented') {
          // Download final segment
          const ext = settings.format === 'webm' ? 'webm' : 'mp4'
          if (blob) {
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `mdimension-${Date.now()}-part${loopStateRef.current.currentSegment}.${ext}`
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
              setTimeout(() => URL.revokeObjectURL(url), 10000)
          }
          setProgress(1)
          setStatus('completed')
          setCompletionDetails({
              type: 'segmented',
              segmentCount: loopStateRef.current.currentSegment
          })
      }

    } catch (e) {
      handleError(e)
    } finally {
      restoreState()
      exportStartedRef.current = false
      if (recorderRef.current) {
          recorderRef.current.dispose()
          recorderRef.current = null
      }
    }
  }, [setStatus, restoreState, setPreviewUrl, setProgress, handleError, settings.format])

  const updateSceneState = useCallback((deltaTimeSec: number) => {
      const animatingPlanes = useAnimationStore.getState().animatingPlanes
      const animationBias = useUIStore.getState().animationBias
      const speed = useAnimationStore.getState().speed
      const direction = useAnimationStore.getState().direction

      if (animatingPlanes.size > 0) {
          const updates = new Map<string, number>()
          const rotationDelta = BASE_ROTATION_RATE * speed * direction * deltaTimeSec

          let planeIndex = 0
          animatingPlanes.forEach((plane) => {
              const currentAngle = useRotationStore.getState().rotations.get(plane) ?? 0
              const multiplier = getPlaneMultiplier(planeIndex, animatingPlanes.size, animationBias)
              const biasedDelta = rotationDelta * multiplier
              let newAngle = currentAngle + biasedDelta

              // Only guard against NaN/Infinity - do NOT normalize here.
              // Normalization happens lazily in rotationStore to avoid double-modulo
              // precision loss that causes visible jump-cuts in animated textures.
              if (!isFinite(newAngle)) {
                  newAngle = currentAngle // Keep previous valid angle
              }

              updates.set(plane, newAngle)
              planeIndex++
          })

          useRotationStore.getState().updateRotations(updates)
      }
  }, [])

  const processBatch = useCallback(async () => {
      const MAX_BLOCKING_TIME = 30 // ms
      const batchStartTime = performance.now()

      if (abortRef.current) {
          finishExport()
          return
      }

      try {
          const state = loopStateRef.current
          const { settings, exportMode } = useExportStore.getState()

          // --- PHASE 1: WARMUP ---
          while (state.phase === 'warmup') {
              if (state.warmupFrame >= settings.warmupFrames) {
                  // Transition to next phase
                  if (exportMode === 'stream') {
                      // Save rotation state after warmup for restoration before main recording
                      const currentRotations = useRotationStore.getState().rotations
                      rotationSnapshotRef.current = Object.fromEntries(currentRotations)

                      state.phase = 'preview'
                      // Re-init recorder for Preview (Buffer mode)
                      const { fps, bitrate, resolution, customWidth, customHeight } = settings
                      let width = 1920, height = 1080
                      if (resolution === '4k') { width = 3840; height = 2160 }
                      else if (resolution === 'custom') { width = customWidth; height = customHeight }
                      width = Math.floor(width / 2) * 2; height = Math.floor(height / 2) * 2

                      // Init Preview Recorder (3s or full duration)
                      const previewDuration = Math.min(3, settings.duration)
                      state.totalFrames = Math.ceil(previewDuration * fps)
                      state.frameId = 0

                      const recorder = new VideoRecorder(gl.domElement, {
                          width, height, fps, bitrate, format: settings.format,
                          codec: settings.codec,
                          duration: previewDuration,
                          hardwareAcceleration: settings.hardwareAcceleration,
                          bitrateMode: settings.bitrateMode,
                          textOverlay: settings.textOverlay,
                          crop: settings.crop,
                          rotation: settings.rotation
                      })
                      await recorder.initialize()
                      recorderRef.current = recorder
                      setStatus('previewing')
                  } else {
                      state.phase = 'recording'
                      state.frameId = 0 // Reset
                      // Recorder already init for main in startExport for other modes
                  }
                  continue // Loop again to start next phase
              }

              if (abortRef.current) { finishExport(); return }

              updateSceneState(state.frameDuration)
              const warmupTime = state.startTime + (state.warmupFrame * (state.frameDuration * 1000))
              advance(warmupTime)
              state.warmupFrame++

              if (performance.now() - batchStartTime > MAX_BLOCKING_TIME) {
                  setTimeout(processBatch, 0)
                  return
              }
          }

          // --- PHASE 2: PREVIEW (Stream Only) ---
          while (state.phase === 'preview') {
              if (state.frameId >= state.totalFrames) {
                  // Finalize Preview
                  if (recorderRef.current) {
                      const blob = await recorderRef.current.finalize()
                      if (blob) {
                          setPreviewUrl(URL.createObjectURL(blob))
                      }
                      recorderRef.current.dispose()
                      recorderRef.current = null
                  }

                  // Transition to Recording
                  state.phase = 'recording'
                  setStatus('rendering')

                  // Restore rotation state to post-warmup snapshot for consistent main recording
                  if (rotationSnapshotRef.current) {
                      const restoredRotations = new Map(Object.entries(rotationSnapshotRef.current))
                      useRotationStore.getState().updateRotations(restoredRotations)
                  }

                  // Setup Main Recording
                  const { fps, bitrate, duration, resolution, customWidth, customHeight } = settings
                  let width = 1920, height = 1080
                  if (resolution === '4k') { width = 3840; height = 2160 }
                  else if (resolution === 'custom') { width = customWidth; height = customHeight }
                  width = Math.floor(width / 2) * 2; height = Math.floor(height / 2) * 2

                  // Init Main Recorder (Stream)
                  const recorder = new VideoRecorder(gl.domElement, {
                      width, height, fps, bitrate, format: settings.format,
                      codec: settings.codec,
                      duration,
                      totalDuration: duration, // Full video duration for fade calculations
                      streamHandle: state.mainStreamHandle,
                      onProgress: (p) => setProgress(p),
                      hardwareAcceleration: settings.hardwareAcceleration,
                      bitrateMode: settings.bitrateMode,
                      textOverlay: settings.textOverlay,
                      crop: settings.crop,
                      rotation: settings.rotation
                  })
                  await recorder.initialize()
                  recorderRef.current = recorder

                  // Reset Counters for Main
                  state.frameId = 0
                  state.totalFrames = Math.ceil(duration * fps)
                  state.exportStartTime = Date.now()
                  state.startTime = performance.now() // Reset timeline base
                  continue
              }

              if (abortRef.current) { finishExport(); return }

              updateSceneState(state.frameDuration)
              const timestamp = state.startTime + (state.frameId * state.frameDuration * 1000)
              advance(timestamp)

              if (recorderRef.current) {
                  await recorderRef.current.captureFrame(state.frameId * state.frameDuration, state.frameDuration)
              }
              state.frameId++

              if (performance.now() - batchStartTime > MAX_BLOCKING_TIME) {
                  setTimeout(processBatch, 0)
                  return
              }
          }

          // --- PHASE 3: RECORDING ---
          while (state.phase === 'recording' && state.frameId < state.totalFrames) {
              if (abortRef.current) { finishExport(); return }

              // Segment Rotation Logic (for 'segmented' mode)
              if (exportMode === 'segmented' && state.framesInCurrentSegment >= state.segmentDurationFrames) {
                  // Finalize current segment
                  if (recorderRef.current) {
                      const blob = await recorderRef.current.finalize()
                      if (blob) {
                          const ext = settings.format === 'webm' ? 'webm' : 'mp4'
                          triggerDownload(blob, `mdimension-${Date.now()}-part${state.currentSegment}.${ext}`)
                      }
                      recorderRef.current.dispose()
                      recorderRef.current = null
                  }

                  // Start new segment
                  state.currentSegment++
                  state.framesInCurrentSegment = 0
                  state.segmentStartTimeVideo = state.frameId * state.frameDuration

                  // Calc remaining duration for next segment (might be shorter)
                  const remainingFrames = state.totalFrames - state.frameId
                  const nextSegFrames = Math.min(state.segmentDurationFrames, remainingFrames)

                  // Init new recorder
                  const { fps, bitrate, resolution, customWidth, customHeight } = settings
                  let width = 1920, height = 1080
                  if (resolution === '4k') { width = 3840; height = 2160 }
                  else if (resolution === 'custom') { width = customWidth; height = customHeight }
                  // Ensure even
                  width = Math.floor(width / 2) * 2; height = Math.floor(height / 2) * 2

                  const recorder = new VideoRecorder(gl.domElement, {
                      width, height, fps, bitrate, format: settings.format,
                      codec: settings.codec,
                      duration: nextSegFrames / fps, // Duration of THIS segment
                      totalDuration: settings.duration, // Full video duration for fade calculations
                      hardwareAcceleration: settings.hardwareAcceleration,
                      bitrateMode: settings.bitrateMode,
                      textOverlay: settings.textOverlay,
                      crop: settings.crop,
                      rotation: settings.rotation
                  })
                  await recorder.initialize()
                  recorderRef.current = recorder
              }

              // 1. Update
              updateSceneState(state.frameDuration)

              // 2. Render
              const timestamp = state.startTime + (state.frameId * state.frameDuration * 1000)
              advance(timestamp)

              // 3. Capture
              // Video time relative to CURRENT SEGMENT for encoding
              const globalVideoTime = state.frameId * state.frameDuration
              const relativeVideoTime = globalVideoTime - state.segmentStartTimeVideo

              if (recorderRef.current) {
                  // Pass globalVideoTime for fade calculations (critical for segmented mode)
                  await recorderRef.current.captureFrame(relativeVideoTime, state.frameDuration, globalVideoTime)
              }

              state.frameId++
              state.framesInCurrentSegment++

              // Check time budget
              if (performance.now() - batchStartTime > MAX_BLOCKING_TIME) {
                  break
              }
          }

          // Update Progress & ETA
          const now = Date.now()
          if (now - state.lastEtaUpdate > 500 && state.phase === 'recording') {
              const elapsed = now - state.exportStartTime
              const framesDone = state.frameId
              const framesTotal = state.totalFrames

              // Progress Logic
              const totalProgress = framesDone / framesTotal
              setProgress(totalProgress) // Global progress

              if (framesDone > 0) {
                  const msPerFrame = elapsed / framesDone
                  const remainingMs = (framesTotal - framesDone) * msPerFrame
                  const remainingSec = Math.ceil(remainingMs / 1000)
                  setEta(`${remainingSec}s`)
              }
              state.lastEtaUpdate = now
          }

          if (state.phase === 'recording' && state.frameId >= state.totalFrames) {
              finishExport()
          } else {
              setTimeout(processBatch, 0)
          }

      } catch (e) {
          console.error('Export Loop Error:', e)
          handleError(e)
      }
  }, [finishExport, advance, gl.domElement, setEta, setProgress, updateSceneState, handleError, setPreviewUrl, setStatus])

  const startExport = useCallback(async () => {
    // Prevent double-invocation due to React re-renders during async operations
    if (exportStartedRef.current) {
        return
    }

    // Additional guard: check current status from store (more reliable than captured value)
    // This prevents race conditions when effect re-runs with stale callback references
    const currentStatus = useExportStore.getState().status
    if (currentStatus !== 'idle') {
        return
    }

    exportStartedRef.current = true

    // CRITICAL: Reset abort flag immediately to ensure clean start
    // This must happen before any async operations to prevent race conditions
    // with a previous export's finishExport still running
    abortRef.current = false

    // Reset progress and ETA for clean start
    setProgress(0)
    setEta(null)

    // For stream mode, show file picker FIRST before any state changes
    // This prevents race conditions and ensures user has confirmed file location
    let streamHandle: FileSystemFileHandle | undefined = undefined

    if (exportMode === 'stream') {
        // Check for API support
        if (!('showSaveFilePicker' in window)) {
            setError('File System Access API not supported in this browser. Please use Chrome/Edge or switch to In-Memory mode.')
            setStatus('error')
            exportStartedRef.current = false
            return
        }

        // Set status before file picker to prevent re-entry from effect re-runs
        // This is critical: while file picker is open, effect may re-run due to
        // callback reference changes, but this status check prevents double execution
        setStatus('rendering')

        try {
            // Ask user for file location BEFORE starting export
            const extension = settings.format === 'webm' ? '.webm' : '.mp4'
            const description = settings.format === 'webm' ? 'WebM Video' : 'MP4 Video'
            const mimeType = settings.format === 'webm' ? 'video/webm' : 'video/mp4'

            streamHandle = await window.showSaveFilePicker({
                suggestedName: `mdimension-${Date.now()}${extension}`,
                types: [{
                    description,
                    accept: { [mimeType]: [extension] },
                }],
            })
        } catch (pickerError: unknown) {
            // User cancelled - don't start export, restore idle state
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((pickerError as any).name === 'AbortError') {
                useExportStore.getState().setIsExporting(false)
                setStatus('idle')
                exportStartedRef.current = false
                return
            }
            setError(pickerError instanceof Error ? pickerError.message : 'Failed to select file')
            setStatus('error')
            exportStartedRef.current = false
            return
        }
    }

    // 1. Save Renderer State
    gl.getSize(originalSizeRef.current)
    originalPixelRatioRef.current = gl.getPixelRatio()

    // Save Camera Aspect Ratio
    if (camera instanceof THREE.PerspectiveCamera) {
        originalCameraAspectRef.current = camera.aspect
    }

    // Save Performance Settings
    const perfStore = usePerformanceStore.getState()
    originalPerfSettingsRef.current = {
        quality: perfStore.qualityMultiplier,
        lowQualityAnim: perfStore.fractalAnimationLowQuality,
        progressiveRefinementEnabled: perfStore.progressiveRefinementEnabled,
        renderResolutionScale: perfStore.renderResolutionScale
    }

    try {
      // For non-stream modes, set status now. For stream mode, already set before file picker.
      if (exportMode !== 'stream') {
          setStatus('rendering')
      }
      // Note: abortRef.current is already set to false at the start of startExport()

      // Force High Quality - disable progressive refinement to prevent it from overriding
      perfStore.setProgressiveRefinementEnabled(false)
      perfStore.setFractalAnimationLowQuality(false)
      perfStore.setRefinementStage('final')
      perfStore.setRenderResolutionScale(1.0) // Force full resolution for export quality

      // Yield to allow UI to paint "Rendering..." state
      await new Promise(r => setTimeout(r, 100))

      if (abortRef.current) return

      const { fps, duration, bitrate, customWidth, customHeight, resolution } = settings

      // --- VALIDATION ---
      if (!Number.isFinite(fps) || fps <= 0) throw new Error(`Invalid FPS: ${fps}`)
      if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid duration: ${duration}`)
      if (!Number.isFinite(bitrate) || bitrate <= 0) throw new Error(`Invalid bitrate: ${bitrate}`)

      // 2. Calculate Dimensions
      let exportWidth = 1920
      let exportHeight = 1080

      if (resolution === 'custom') {
          exportWidth = customWidth
          exportHeight = customHeight
      } else if (resolution === '4k') {
          exportWidth = 3840
          exportHeight = 2160
      } else if (resolution === '1080p') {
          exportWidth = 1920
          exportHeight = 1080
      } else if (resolution === '720p') {
          exportWidth = 1280
          exportHeight = 720
      }

      // Ensure even dimensions
      exportWidth = Math.floor(exportWidth / 2) * 2
      exportHeight = Math.floor(exportHeight / 2) * 2

      // Calculate Render Dimensions
      // When crop is enabled, we need to render at the ORIGINAL canvas aspect ratio
      // (matching what user sees in preview) so crop coordinates align correctly.
      // Then video.ts will extract the crop region and scale to export dimensions.
      let renderWidth = exportWidth
      let renderHeight = exportHeight

      if (settings.crop.enabled && settings.crop.width > 0 && settings.crop.height > 0) {
          // Get the original canvas aspect ratio (what user sees in viewport/preview)
          const originalAspect = originalCameraAspectRef.current

          // Calculate the scale needed so the crop region has at least export resolution
          // We use the maximum scale factor to ensure quality in both dimensions
          const scaleX = exportWidth / settings.crop.width
          const scaleY = exportHeight / settings.crop.height
          const scaleFactor = Math.max(scaleX, scaleY)

          // Calculate render dimensions maintaining ORIGINAL aspect ratio
          // This ensures the scene renders the same as preview
          if (originalAspect >= 1) {
              // Wider or square canvas - base on height
              renderHeight = Math.round(scaleFactor)
              renderWidth = Math.round(renderHeight * originalAspect)
          } else {
              // Taller canvas - base on width
              renderWidth = Math.round(scaleFactor)
              renderHeight = Math.round(renderWidth / originalAspect)
          }

          // Clamp to hardware limits
          const maxTextureSize = gl.capabilities.maxTextureSize || 4096
          const safeLimit = Math.min(maxTextureSize, 8192)

          if (renderWidth > safeLimit || renderHeight > safeLimit) {
              const ratio = Math.min(safeLimit / renderWidth, safeLimit / renderHeight)
              renderWidth = Math.floor(renderWidth * ratio)
              renderHeight = Math.floor(renderHeight * ratio)
          }
      }

      // Ensure even
      renderWidth = Math.floor(renderWidth / 2) * 2
      renderHeight = Math.floor(renderHeight / 2) * 2


      // 3. Resize Renderer
      try {
        gl.setPixelRatio(1)
        gl.setSize(renderWidth, renderHeight, false)
      } catch (resizeError) {
        console.error('Renderer resize failed:', resizeError)
        throw new Error('Failed to resize renderer for export')
      }

      // 3b. Update Camera Aspect Ratio
      // CRITICAL: When crop is enabled, we MUST preserve the original camera aspect ratio
      // so the scene renders identically to what the user sees in the preview.
      // This ensures crop coordinates extract the correct visual region.
      if (camera instanceof THREE.PerspectiveCamera) {
          if (settings.crop.enabled) {
              // Keep original aspect ratio to match preview
              camera.aspect = originalCameraAspectRef.current
          } else {
              // No crop - match render dimensions
              camera.aspect = renderWidth / renderHeight
          }
          camera.updateProjectionMatrix()
      }

      // 3c. Yield to allow React to reconcile and update RenderGraph dimensions
      // The RenderGraph in PostProcessingV2 uses useLayoutEffect to resize internal buffers.
      // We need to give React a chance to process the resize before capturing frames.
      await new Promise(r => setTimeout(r, 50))

      if (abortRef.current) {
          restoreState()
          return
      }

      // 4. Mode Specific Setup
      // Note: For stream mode, streamHandle was already obtained at the start of startExport()
      let segmentDurationFrames = Math.ceil(duration * fps) // Default to full duration

      if (exportMode === 'segmented') {
          // Calculate segment size
          const targetSizeBytes = 50 * 1024 * 1024 // 50 MB
          const bitrateBps = bitrate * 1024 * 1024
          const calculatedDuration = (targetSizeBytes * 8) / bitrateBps

          // Clamp: Min 5s, Max full duration
          const segDuration = Math.max(5, Math.min(duration, calculatedDuration))
          segmentDurationFrames = Math.ceil(segDuration * fps)
      }

      // 6. Initialize Loop State
      loopStateRef.current = {
        phase: 'warmup',
        frameId: 0,
        warmupFrame: 0,
        startTime: performance.now(),
        totalFrames: Math.ceil(duration * fps),
        frameDuration: 1 / fps,
        exportStartTime: Date.now(),
        lastEtaUpdate: 0,
        mainStreamHandle: streamHandle,
        segmentDurationFrames,
        currentSegment: 1,
        framesInCurrentSegment: 0,
        segmentStartTimeVideo: 0
      }

      // 5. Initialize Recorder (First Instance)
      // Only for non-stream modes do we init immediately.
      // For Stream mode, we init Preview recorder in processBatch.

      if (exportMode !== 'stream') {
          const canvas = gl.domElement
          const recorder = new VideoRecorder(canvas, {
            width: exportWidth,
            height: exportHeight,
            fps,
            duration: exportMode === 'segmented' ? (segmentDurationFrames / fps) : duration,
            totalDuration: duration, // Full video duration for fade calculations
            bitrate,
            format: settings.format,
            codec: settings.codec,
            onProgress: (p) => {
                if (exportMode !== 'segmented') setProgress(p)
            },
            hardwareAcceleration: settings.hardwareAcceleration,
            bitrateMode: settings.bitrateMode,
            textOverlay: settings.textOverlay,
            crop: settings.crop,
            rotation: settings.rotation
          })

          recorderRef.current = recorder
          await recorder.initialize()
      }

      if (abortRef.current) {
          restoreState()
          return
      }

      // 7. Start Optimized Loop
      processBatch()

    } catch (e) {
      console.error('Export Start Error:', e)
      handleError(e)
    }
  }, [gl, camera, settings, exportMode, restoreState, handleError, setStatus, setProgress, setEta, processBatch, setError])

  // Effect to trigger export start and handle user cancellation
  useEffect(() => {
    // Start export trigger
    if (isExporting && status === 'idle') {
      startExport()
    }

    // Cleanup trigger - reset export state when export is cancelled by user
    if (!isExporting) {
      exportStartedRef.current = false
      if (recorderRef.current) {
        abortRef.current = true
        // Cancel recorder immediately to prevent race conditions
        // The finishExport will detect abortRef and just clean up resources
        recorderRef.current.cancel().then(() => {
          recorderRef.current?.dispose()
          recorderRef.current = null
        }).catch(() => {
          // Ignore errors during cancel
          recorderRef.current?.dispose()
          recorderRef.current = null
        })
      }
      // Reset progress and ETA immediately on cancel (don't wait for finishExport)
      setProgress(0)
      setEta(null)
      // Reset loop state to prevent stale data on next export
      loopStateRef.current = {
        phase: 'warmup',
        frameId: 0,
        warmupFrame: 0,
        startTime: 0,
        totalFrames: 0,
        frameDuration: 0,
        exportStartTime: 0,
        lastEtaUpdate: 0,
        mainStreamHandle: undefined,
        segmentDurationFrames: 0,
        currentSegment: 0,
        framesInCurrentSegment: 0,
        segmentStartTimeVideo: 0
      }
    }
    // NOTE: No cleanup function here! The cleanup was incorrectly aborting exports
    // on every status change (e.g., 'rendering' → 'previewing' in stream mode).
    // React runs cleanup before EVERY effect re-run, not just on unmount.
    // Unmount cleanup is handled by a separate effect below.
  }, [isExporting, status, startExport, setProgress, setEta])

  // Separate effect for ACTUAL component unmount cleanup only
  // This effect has an empty dependency array, so cleanup only runs on unmount
  useEffect(() => {
    return () => {
      // Component unmount cleanup - abort any in-progress export
      if (recorderRef.current) {
        abortRef.current = true
        restoreState()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps = cleanup runs ONLY on unmount

  return null
}
