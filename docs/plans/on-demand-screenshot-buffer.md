# Implementation Plan: On-Demand Screenshot Buffer

## Problem Statement

Currently, the WebGL canvas is configured with `preserveDrawingBuffer: true` (App.tsx:291):
```typescript
gl={{ alpha: false, antialias: false, preserveDrawingBuffer: true }}
```

This setting persists the drawing buffer after compositing, which is required for `canvas.toDataURL()` and `canvas.toBlob()` to work. However, it has a **performance cost** because:
1. The GPU cannot optimize the back buffer swap
2. Additional memory is consumed to preserve the buffer
3. Some GPU-specific optimizations are disabled

## Goal

Change to `preserveDrawingBuffer: false` by default and only capture screenshots/frames on-demand using a reliable method that doesn't require the preserved buffer.

## Current Capture Points

| Location | Method | Purpose |
|----------|--------|---------|
| `src/lib/export/image.ts:98` | `canvas.toDataURL('image/png')` | Screenshot export |
| `src/components/layout/EditorTopBar/index.tsx:171` | `canvas.toDataURL('image/jpeg', 0.8)` | Video export preview |
| `src/components/overlays/CropEditor.tsx:49` | `canvas.toDataURL('image/jpeg', 0.8)` | Crop editor preview recapture |
| `src/lib/export/video.ts:206` | `ctx.drawImage(this.canvas, ...)` | Video frame composition |
| `src/hooks/useDynamicFavicon.ts` | Own 2D canvas (not affected) | Favicon generation |

## Technical Approach: WebGLRenderTarget Capture

### Why WebGLRenderTarget?

1. **Bypasses preserveDrawingBuffer requirement** - Render targets always retain their contents until explicitly cleared
2. **Matches existing architecture** - The post-processing pipeline already uses render targets internally
3. **Full fidelity** - Captures the exact final rendered frame including all post-processing effects
4. **No context recreation** - Reuses the existing WebGL context

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     ScreenshotCaptureStore                       │
│  - requestCapture()  → triggers capture request                  │
│  - capturedImage     → stores result data URL                    │
│  - captureStatus     → 'idle' | 'capturing' | 'ready' | 'error' │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ScreenshotCaptureController                    │
│  (R3F component that runs inside Canvas)                        │
│  - Listens for capture requests                                 │
│  - On request: renders scene to WebGLRenderTarget               │
│  - Reads pixels → creates ImageData → creates data URL          │
│  - Stores result in ScreenshotCaptureStore                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     useScreenshotCapture Hook                    │
│  - Exposes requestCapture() and awaitCapture() for consumers    │
│  - Used by: image.ts, EditorTopBar, CropEditor                  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Create Screenshot Capture Infrastructure

#### 1.1 Create Store: `src/stores/screenshotCaptureStore.ts`

```typescript
import { create } from 'zustand'

export type CaptureStatus = 'idle' | 'capturing' | 'ready' | 'error'

export interface ScreenshotCaptureState {
  status: CaptureStatus
  capturedImage: string | null
  error: string | null

  // Actions
  requestCapture: () => void
  setCapturedImage: (dataUrl: string) => void
  setError: (error: string) => void
  reset: () => void
}

export const useScreenshotCaptureStore = create<ScreenshotCaptureState>((set) => ({
  status: 'idle',
  capturedImage: null,
  error: null,

  requestCapture: () => set({ status: 'capturing', capturedImage: null, error: null }),
  setCapturedImage: (dataUrl) => set({ status: 'ready', capturedImage: dataUrl }),
  setError: (error) => set({ status: 'error', error }),
  reset: () => set({ status: 'idle', capturedImage: null, error: null }),
}))
```

#### 1.2 Create Controller: `src/rendering/controllers/ScreenshotCaptureController.tsx`

```typescript
import { useScreenshotCaptureStore } from '@/stores/screenshotCaptureStore'
import { useThree, useFrame } from '@react-three/fiber'
import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'

/**
 * Headless R3F component that captures screenshots on demand.
 * Uses WebGLRenderTarget to bypass preserveDrawingBuffer requirement.
 */
export function ScreenshotCaptureController() {
  const { gl, scene, camera, size } = useThree()
  const { status, setCapturedImage, setError, reset } = useScreenshotCaptureStore()

  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null)
  const pendingCaptureRef = useRef(false)

  // Create/resize render target as needed
  useEffect(() => {
    const width = size.width * gl.getPixelRatio()
    const height = size.height * gl.getPixelRatio()

    if (renderTargetRef.current) {
      renderTargetRef.current.dispose()
    }

    renderTargetRef.current = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    })

    return () => {
      renderTargetRef.current?.dispose()
      renderTargetRef.current = null
    }
  }, [size.width, size.height, gl])

  // Watch for capture requests
  useEffect(() => {
    if (status === 'capturing') {
      pendingCaptureRef.current = true
    }
  }, [status])

  // Capture on next frame render
  useFrame(() => {
    if (!pendingCaptureRef.current || !renderTargetRef.current) return
    pendingCaptureRef.current = false

    try {
      const target = renderTargetRef.current
      const width = target.width
      const height = target.height

      // Save current render target
      const currentTarget = gl.getRenderTarget()

      // Render scene to our target
      // Note: This renders the raw scene. For post-processed output,
      // we need to hook into the post-processing pipeline instead.
      gl.setRenderTarget(target)
      gl.render(scene, camera)
      gl.setRenderTarget(currentTarget)

      // Read pixels
      const pixels = new Uint8Array(width * height * 4)
      gl.readRenderTargetPixels(target, 0, 0, width, height, pixels)

      // WebGL renders with Y-flipped compared to canvas
      // Flip the pixels vertically
      const flippedPixels = new Uint8Array(width * height * 4)
      for (let y = 0; y < height; y++) {
        const srcOffset = y * width * 4
        const dstOffset = (height - 1 - y) * width * 4
        flippedPixels.set(pixels.subarray(srcOffset, srcOffset + width * 4), dstOffset)
      }

      // Create canvas and draw pixels
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      const imageData = new ImageData(new Uint8ClampedArray(flippedPixels.buffer), width, height)
      ctx.putImageData(imageData, 0, 0)

      // Convert to data URL
      const dataUrl = canvas.toDataURL('image/png')
      setCapturedImage(dataUrl)

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Screenshot capture failed')
    }
  }, 1) // Run after scene render

  return null
}
```

#### 1.3 Create Hook: `src/hooks/useScreenshotCapture.ts`

```typescript
import { useScreenshotCaptureStore } from '@/stores/screenshotCaptureStore'
import { useCallback } from 'react'

/**
 * Hook for capturing screenshots from outside R3F context.
 * Returns a promise that resolves with the captured image data URL.
 */
export function useScreenshotCapture() {
  const { requestCapture, status, capturedImage, error, reset } = useScreenshotCaptureStore()

  const captureScreenshot = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      reset()
      requestCapture()

      const checkResult = () => {
        const state = useScreenshotCaptureStore.getState()

        if (state.status === 'ready' && state.capturedImage) {
          resolve(state.capturedImage)
        } else if (state.status === 'error') {
          reject(new Error(state.error || 'Screenshot capture failed'))
        } else if (state.status === 'capturing') {
          // Still capturing, check again on next frame
          requestAnimationFrame(checkResult)
        }
      }

      requestAnimationFrame(checkResult)
    })
  }, [requestCapture, reset])

  return { captureScreenshot, status, capturedImage, error }
}
```

### Phase 2: Handle Post-Processed Output

The basic controller above renders the raw scene. To capture the post-processed output, we have two options:

#### Option A: Intercept Post-Processing Output (Recommended)

Modify the post-processing pipeline to optionally output to a capture target. This requires changes to:
- `src/rendering/graph/RenderGraph.tsx` or equivalent
- Add a capture target that receives the final composed output

#### Option B: Synchronous Canvas Copy (Simpler)

Use `gl.domElement` immediately after the frame renders (before swap):

```typescript
useFrame(() => {
  if (!pendingCaptureRef.current) return
  // Capture happens in useFrame AFTER scene renders but before swap

  // Create temp canvas and copy
  const canvas = document.createElement('canvas')
  const width = gl.domElement.width
  const height = gl.domElement.height
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(gl.domElement, 0, 0)

  const dataUrl = canvas.toDataURL('image/png')
  // ... store result
}, 999) // Run LAST, after all other useFrame hooks
```

**Note:** Option B may work with `preserveDrawingBuffer: false` because we're copying in the same frame before the browser composites. However, this is browser-dependent and may not be 100% reliable.

**Recommendation:** Start with Option B for simplicity. If it proves unreliable, implement Option A.

### Phase 3: Update Capture Points

#### 3.1 Update `src/lib/export/image.ts`

```typescript
import { useScreenshotCaptureStore } from '@/stores/screenshotCaptureStore'

export async function exportSceneToPNG(_options: ExportOptions = {}): Promise<boolean> {
  try {
    // Request capture via store
    useScreenshotCaptureStore.getState().requestCapture()

    // Wait for capture to complete
    const result = await new Promise<string>((resolve, reject) => {
      const unsubscribe = useScreenshotCaptureStore.subscribe((state) => {
        if (state.status === 'ready' && state.capturedImage) {
          unsubscribe()
          resolve(state.capturedImage)
        } else if (state.status === 'error') {
          unsubscribe()
          reject(new Error(state.error || 'Capture failed'))
        }
      })

      // Timeout after 5 seconds
      setTimeout(() => {
        unsubscribe()
        reject(new Error('Screenshot capture timeout'))
      }, 5000)
    })

    // Open modal with captured image
    useScreenshotStore.getState().openModal(result)
    return true

  } catch (error) {
    useMsgBoxStore.getState().showMsgBox('Export Failed',
      error instanceof Error ? error.message : 'Unknown error', 'error')
    return false
  }
}
```

#### 3.2 Update EditorTopBar video export preview

```typescript
const handleExportVideo = useCallback(async () => {
  // Request screenshot capture
  useScreenshotCaptureStore.getState().requestCapture()

  // Wait for capture with timeout
  const waitForCapture = (): Promise<string | null> => {
    return new Promise((resolve) => {
      let attempts = 0
      const check = () => {
        const state = useScreenshotCaptureStore.getState()
        if (state.status === 'ready' && state.capturedImage) {
          resolve(state.capturedImage)
        } else if (state.status === 'error' || attempts++ > 100) {
          resolve(null)
        } else {
          requestAnimationFrame(check)
        }
      }
      requestAnimationFrame(check)
    })
  }

  const dataUrl = await waitForCapture()
  if (dataUrl) {
    setPreviewImage(dataUrl)
  }

  // ... rest of function
}, [/* deps */])
```

#### 3.3 Update CropEditor preview recapture

Similar pattern to EditorTopBar.

### Phase 4: Video Export Frame Capture

For video export, the current approach uses `ctx.drawImage(this.canvas, ...)` to copy pixels to a composition canvas. This should work without `preserveDrawingBuffer` because:

1. `VideoExportController` calls `advance()` which renders synchronously
2. Immediately after, `captureFrame()` is called which does `drawImage()`
3. The copy happens before the browser composites the frame

**However**, to ensure reliability, we should verify this works with `preserveDrawingBuffer: false` before deploying.

If issues arise, we can modify `VideoRecorder` to use the WebGLRenderTarget approach for each frame capture (with performance implications).

### Phase 5: Update App.tsx

After all capture points are updated:

```typescript
gl={{ alpha: false, antialias: false, preserveDrawingBuffer: false }}
```

### Phase 6: Add Controller to App

```typescript
// In App.tsx Canvas children
<ScreenshotCaptureController />
```

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/stores/screenshotCaptureStore.ts` | **New** | Store for capture state management |
| `src/rendering/controllers/ScreenshotCaptureController.tsx` | **New** | R3F controller for capture |
| `src/hooks/useScreenshotCapture.ts` | **New** | Hook for external consumers |
| `src/lib/export/image.ts` | **Modify** | Use new capture system |
| `src/components/layout/EditorTopBar/index.tsx` | **Modify** | Use new capture system |
| `src/components/overlays/CropEditor.tsx` | **Modify** | Use new capture system |
| `src/App.tsx` | **Modify** | Add controller, change gl config |
| `src/stores/index.ts` | **Modify** | Export new store |

## Testing Plan

1. **Unit Tests**
   - Test store state transitions
   - Test capture request/response flow

2. **Integration Tests**
   - Screenshot export produces valid PNG
   - Video export preview shows correct image
   - Crop editor preview updates correctly

3. **Cross-Browser Testing**
   - Chrome, Firefox, Safari, Edge
   - Verify frame timing reliability

4. **Performance Testing**
   - Measure render performance before/after preserveDrawingBuffer change
   - Ensure no memory leaks from render targets

## Rollback Plan

If issues are discovered post-deployment:
1. Change `preserveDrawingBuffer` back to `true` in App.tsx
2. Revert capture points to use direct `toDataURL()`
3. Keep new infrastructure for future optimization

## Open Questions

1. **Post-Processing Capture**: Should we capture raw scene or post-processed output?
   - Current plan: Post-processed (what user sees)
   - May need to hook into render graph for accurate capture

2. **Video Frame Capture**: Does `drawImage()` work reliably without preserveDrawingBuffer?
   - Needs testing before Phase 5
   - Fallback: Use WebGLRenderTarget for video frames too

3. **JPEG vs PNG for previews**: Should we standardize format?
   - PNG: Better quality, larger size
   - JPEG: Good for previews, smaller
   - Recommendation: Keep JPEG for previews, PNG for final export
