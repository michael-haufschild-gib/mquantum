/**
 * Geometry Worker Hook
 *
 * Provides a React hook for communicating with the geometry Web Worker.
 * Uses a singleton pattern to share a single worker instance across components.
 *
 * Features:
 * - Singleton worker with reference counting
 * - Promise-based request/response API
 * - Request cancellation support
 * - Progress callback support
 * - Automatic cleanup on unmount
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { sendRequest, cancelRequest } = useGeometryWorker()
 *
 *   const generatePolytope = async () => {
 *     const response = await sendRequest({
 *       type: 'generate-wythoff',
 *       id: 'my-request',
 *       dimension: 4,
 *       config: { preset: 'regular' },
 *     })
 *     if (response.type === 'result') {
 *       console.log('Got geometry:', response.geometry)
 *     }
 *   }
 * }
 * ```
 */

import { useCallback, useEffect, useRef } from 'react'
import type { WorkerRequest, WorkerResponse, GenerationStage } from '@/workers/types'

// ============================================================================
// Worker Singleton Management
// ============================================================================

/**
 * Singleton worker instance shared across all hook consumers
 */
let workerInstance: Worker | null = null

/**
 * Reference count for worker lifecycle management.
 * Worker is terminated when count reaches 0.
 */
let workerRefCount = 0

/**
 * Global pending requests map shared across all hook instances.
 * Maps request IDs to their resolve/reject handlers.
 */
const globalPendingRequests = new Map<
  string,
  {
    resolve: (response: WorkerResponse) => void
    reject: (error: Error) => void
    onProgress?: (progress: number, stage: GenerationStage) => void
  }
>()

/**
 * Callbacks waiting for worker ready state
 */
const readyCallbacks: Array<() => void> = []

/**
 * Global message handler (attached once when worker is created)
 * @param event
 */
function handleWorkerMessage(event: MessageEvent<WorkerResponse>): void {
  const response = event.data

  // Handle worker lifecycle messages (no request ID)
  if (response.type === 'ready') {
    if (import.meta.env.DEV) {
      console.log('[useGeometryWorker] Worker WASM initialized and ready')
    }
    // Notify any waiting callbacks
    for (const callback of readyCallbacks) {
      callback()
    }
    readyCallbacks.length = 0
    return
  }

  if (response.type === 'init-error') {
    console.error('[useGeometryWorker] Worker initialization failed:', response.error)
    // Reject all pending requests
    for (const [id, pending] of globalPendingRequests) {
      globalPendingRequests.delete(id)
      pending.reject(new Error(`Worker initialization failed: ${response.error}`))
    }
    return
  }

  // Handle request-specific responses
  const pending = globalPendingRequests.get(response.id)

  if (!pending) {
    // Response for unknown request (possibly cancelled)
    if (import.meta.env.DEV) {
      console.warn(`[useGeometryWorker] Received response for unknown request: ${response.id}`)
    }
    return
  }

  switch (response.type) {
    case 'result':
    case 'cancelled':
      // Terminal responses - clean up and resolve
      globalPendingRequests.delete(response.id)
      pending.resolve(response)
      break

    case 'error':
      // Error response - clean up and reject
      globalPendingRequests.delete(response.id)
      pending.reject(new Error(response.error))
      break

    case 'progress':
      // Progress update - call callback but don't resolve
      pending.onProgress?.(response.progress, response.stage)
      break
  }
}

/**
 * Handle worker errors
 * @param event
 */
function handleWorkerError(event: ErrorEvent): void {
  if (import.meta.env.DEV) {
    console.error('[useGeometryWorker] Worker error:', event.message)
  }

  // Reject all pending requests
  for (const [id, pending] of globalPendingRequests) {
    globalPendingRequests.delete(id)
    pending.reject(new Error(`Worker error: ${event.message}`))
  }
}

/**
 * Check if Web Workers are available in this environment.
 * Workers are not available in test environments (happy-dom/jsdom).
 * @returns True if Worker API is available
 */
function isWorkerAvailable(): boolean {
  return typeof Worker !== 'undefined'
}

/**
 * Get or create the singleton worker instance.
 * Increments reference count.
 * Returns null if Worker is not available (e.g., in test environment).
 * @returns Worker instance or null if unavailable
 */
function getWorker(): Worker | null {
  // Check if Worker API is available
  if (!isWorkerAvailable()) {
    if (import.meta.env.DEV) {
      console.warn('[useGeometryWorker] Worker not available in this environment')
    }
    return null
  }

  if (!workerInstance) {
    // Create new worker using Vite's worker syntax
    workerInstance = new Worker(new URL('../workers/geometry.worker.ts', import.meta.url), {
      type: 'module',
    })

    // Attach global handlers
    workerInstance.addEventListener('message', handleWorkerMessage)
    workerInstance.addEventListener('error', handleWorkerError)

    if (import.meta.env.DEV) {
      console.log('[useGeometryWorker] Worker instance created')
    }
  }

  workerRefCount++
  return workerInstance
}

/**
 * Release a reference to the worker.
 * Terminates worker when reference count reaches 0.
 */
function releaseWorker(): void {
  workerRefCount--

  if (workerRefCount <= 0 && workerInstance) {
    // Cancel all pending requests
    for (const [id, pending] of globalPendingRequests) {
      globalPendingRequests.delete(id)
      pending.reject(new Error('Worker terminated'))
    }

    // Remove handlers and terminate
    workerInstance.removeEventListener('message', handleWorkerMessage)
    workerInstance.removeEventListener('error', handleWorkerError)
    workerInstance.terminate()
    workerInstance = null
    workerRefCount = 0
    readyCallbacks.length = 0

    if (import.meta.env.DEV) {
      console.log('[useGeometryWorker] Worker instance terminated')
    }
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: number, stage: GenerationStage) => void

/**
 * Hook return type
 */
export interface UseGeometryWorkerResult {
  /**
   * Send a request to the worker and get a Promise for the response.
   * @param request - The worker request to send
   * @param onProgress - Optional callback for progress updates
   * @param transferables - Optional array of Transferable objects for zero-copy transfer
   * @returns Promise resolving to the worker response
   */
  sendRequest: (
    request: WorkerRequest,
    onProgress?: ProgressCallback,
    transferables?: Transferable[]
  ) => Promise<WorkerResponse>

  /**
   * Cancel a pending request by ID.
   * @param id - The request ID to cancel
   */
  cancelRequest: (id: string) => void

  /**
   * Check if a request is currently pending.
   * @param id - The request ID to check
   * @returns True if the request is pending
   */
  isRequestPending: (id: string) => boolean
}

/**
 * Hook for communicating with the geometry Web Worker.
 *
 * Manages worker lifecycle and provides a Promise-based API for
 * sending requests and receiving responses.
 *
 * In environments where Worker is not available (e.g., tests),
 * sendRequest will reject with an error indicating worker unavailability.
 *
 * @returns Object with sendRequest, cancelRequest, and isRequestPending functions
 */
export function useGeometryWorker(): UseGeometryWorkerResult {
  const localRequestIds = useRef<Set<string>>(new Set())
  const workerAvailable = useRef<boolean>(isWorkerAvailable())

  // Initialize worker SYNCHRONOUSLY to avoid race conditions where
  // sendRequest is called before the useEffect runs.
  // This ensures the worker is available on the very first render.
  const workerRef = useRef<Worker | null>(workerAvailable.current ? getWorker() : null)

  // Re-initialize worker if ref was cleared (e.g., by React StrictMode cleanup)
  // useRef initial value only applies on first mount, so we need this effect
  // to restore the worker reference after StrictMode's double-invoke pattern.
  useEffect(() => {
    if (!workerRef.current && workerAvailable.current) {
      workerRef.current = getWorker()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    // Capture ref values at effect setup time for cleanup
    const requestIds = localRequestIds.current
    const worker = workerRef.current

    return () => {
      if (!worker) return

      // Cancel all local requests on unmount
      // Wrap in try-catch as worker may already be terminated
      for (const id of requestIds) {
        if (globalPendingRequests.has(id)) {
          try {
            worker.postMessage({ type: 'cancel', id })
          } catch {
            // Worker already terminated - ignore
          }
          globalPendingRequests.delete(id)
        }
      }
      requestIds.clear()

      releaseWorker()
      workerRef.current = null
    }
  }, [])

  /**
   * Send a request to the worker
   */
  const sendRequest = useCallback(
    (
      request: WorkerRequest,
      onProgress?: ProgressCallback,
      transferables?: Transferable[]
    ): Promise<WorkerResponse> => {
      return new Promise((resolve, reject) => {
        // Handle environments where Worker is not available
        if (!workerAvailable.current) {
          reject(new Error('Worker not available in this environment'))
          return
        }

        // Try to restore worker ref if it was cleared (React StrictMode can cause this)
        if (!workerRef.current) {
          workerRef.current = getWorker()
        }

        if (!workerRef.current) {
          reject(new Error('Worker not initialized'))
          return
        }

        // Track request locally for cleanup
        if (request.type !== 'cancel') {
          localRequestIds.current.add(request.id)
        }

        // Register pending request
        globalPendingRequests.set(request.id, {
          resolve: (response) => {
            localRequestIds.current.delete(request.id)
            resolve(response)
          },
          reject: (error) => {
            localRequestIds.current.delete(request.id)
            reject(error)
          },
          onProgress,
        })

        // Send to worker with optional zero-copy transfer
        if (transferables && transferables.length > 0) {
          workerRef.current.postMessage(request, transferables)
        } else {
          workerRef.current.postMessage(request)
        }
      })
    },
    []
  )

  /**
   * Cancel a pending request
   */
  const cancelRequest = useCallback((id: string): void => {
    if (!workerRef.current) return

    // Send cancel message to worker
    workerRef.current.postMessage({ type: 'cancel', id })

    // Clean up local tracking
    localRequestIds.current.delete(id)

    // Remove from pending (the cancelled response will be ignored)
    const pending = globalPendingRequests.get(id)
    if (pending) {
      globalPendingRequests.delete(id)
      // Resolve with a cancelled response instead of rejecting
      pending.resolve({ type: 'cancelled', id })
    }
  }, [])

  /**
   * Check if a request is pending
   */
  const isRequestPending = useCallback((id: string): boolean => {
    return globalPendingRequests.has(id)
  }, [])

  return {
    sendRequest,
    cancelRequest,
    isRequestPending,
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique request ID.
 *
 * @param prefix - Optional prefix for the ID
 * @returns Unique request ID string
 */
export function generateRequestId(prefix = 'req'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
