/**
 * GPU timestamp query collector for render pass timing.
 *
 * Manages GPU timestamp queries, readback scheduling, and timing extraction.
 * Used by WebGPURenderGraph to collect per-pass GPU timing data.
 *
 * @module rendering/webgpu/graph/WebGPUTimestampCollector
 */

import { logger } from '@/lib/logger'

/** Per-pass GPU timing breakdown (milliseconds). */
export interface PassGPUTiming {
  total: number
  compute: number
  render: number
}

/**
 * Collects GPU timestamp queries across render passes and extracts timing data
 * via async readback.
 *
 * Lifecycle: call {@link initialize} once when the device supports timestamp queries,
 * then {@link resolveAndCopy} + {@link scheduleReadback} each frame. Results are
 * available via {@link getLastTimings} on the following frame.
 */
export class WebGPUTimestampCollector {
  private enabled = false
  private collectionActive = false
  private querySet: GPUQuerySet | null = null
  private resolveBuffer: GPUBuffer | null = null
  private readBuffer: GPUBuffer | null = null
  private readbackInFlight = false
  private lastPassTimings = new Map<string, PassGPUTiming>()

  /**
   * Create timestamp query set and associated GPU buffers.
   *
   * @param device - GPU device (must support 'timestamp-query' feature)
   */
  initialize(device: GPUDevice): void {
    // 4 timestamp slots per pass: [computeBegin, computeEnd, renderBegin, renderEnd]
    const maxPasses = 32
    const queryCount = maxPasses * 4

    this.querySet = device.createQuerySet({
      type: 'timestamp',
      count: queryCount,
    })

    this.resolveBuffer = device.createBuffer({
      label: 'timestamp-collector-resolve',
      size: queryCount * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    })

    this.readBuffer = device.createBuffer({
      label: 'timestamp-collector-readback',
      size: queryCount * 8,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    this.enabled = true
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Activate or deactivate per-frame timestamp collection.
   * When inactive, GPU resources remain allocated but no queries are written
   * or read back, eliminating the per-frame `onSubmittedWorkDone` fence cost.
   *
   * @param active - Whether a consumer (e.g. expanded perf monitor) needs GPU timing data
   */
  setCollectionActive(active: boolean): void {
    this.collectionActive = active
  }

  getQuerySet(): GPUQuerySet | null {
    return this.querySet
  }

  getLastTimings(): ReadonlyMap<string, PassGPUTiming> {
    return this.lastPassTimings
  }

  /**
   * Whether timestamp collection can proceed this frame
   * (enabled, actively requested, resources exist, no pending readback).
   */
  canCollect(): boolean {
    return (
      this.enabled &&
      this.collectionActive &&
      !!this.querySet &&
      !!this.resolveBuffer &&
      !!this.readBuffer &&
      !this.readbackInFlight
    )
  }

  /**
   * Encode resolve + copy commands for the measured timestamps.
   * Call after all passes have executed, before command buffer submission.
   *
   * @param encoder - Active command encoder
   * @param measuredPassCount - Number of passes that wrote timestamp queries
   */
  resolveAndCopy(encoder: GPUCommandEncoder, measuredPassCount: number): void {
    if (measuredPassCount <= 0 || !this.querySet || !this.resolveBuffer || !this.readBuffer) return
    const count = measuredPassCount * 4
    encoder.resolveQuerySet(this.querySet, 0, count, this.resolveBuffer, 0)
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.readBuffer, 0, count * 8)
  }

  /**
   * Schedule async GPU-to-CPU readback of timestamp results.
   * Parses BigUint64 timestamps into millisecond timings per pass.
   *
   * @param device - GPU device for queue access
   * @param measuredPassCount - Number of passes measured this frame
   * @param timedPassIds - Pass IDs in measurement order
   * @param timedPassPhases - Which phases (compute/render) each pass used
   */
  scheduleReadback(
    device: GPUDevice,
    measuredPassCount: number,
    timedPassIds: string[],
    timedPassPhases: Array<{ hasCompute: boolean; hasRender: boolean }>
  ): void {
    if (measuredPassCount <= 0 || this.readbackInFlight || !this.readBuffer) return

    // 4 slots per pass: [computeBegin, computeEnd, renderBegin, renderEnd]
    const byteLength = measuredPassCount * 4 * 8
    const readBuffer = this.readBuffer
    const passIds = timedPassIds.slice(0, measuredPassCount)
    const phases = timedPassPhases.slice(0, measuredPassCount)
    this.readbackInFlight = true

    device.queue
      .onSubmittedWorkDone()
      .then(async () => {
        // Guard against disposal during async gap
        if (this.readBuffer !== readBuffer) return
        await readBuffer.mapAsync(GPUMapMode.READ, 0, byteLength)
        try {
          const range = readBuffer.getMappedRange(0, byteLength)
          const timestamps = new BigUint64Array(range)
          const nextTimings = new Map<string, PassGPUTiming>()
          let previousPassEnd: bigint | null = null

          for (let i = 0; i < passIds.length; i++) {
            const base = i * 4
            const phase = phases[i]!

            // Only read slots that were actually written to (phase tracking).
            // Unwritten slots contain stale values from previous frames.
            const computeBegin = phase.hasCompute ? timestamps[base]! : 0n
            const computeEnd = phase.hasCompute ? timestamps[base + 1]! : 0n
            const renderBegin = phase.hasRender ? timestamps[base + 2]! : 0n
            const renderEnd = phase.hasRender ? timestamps[base + 3]! : 0n

            let earliestStart: bigint | null = null
            let latestEnd: bigint | null = null
            if (phase.hasCompute && computeEnd > 0n) {
              if (computeBegin > 0n) earliestStart = computeBegin
              latestEnd = computeEnd
            }
            if (phase.hasRender && renderEnd > 0n) {
              if (renderBegin > 0n && (earliestStart === null || renderBegin < earliestStart)) {
                earliestStart = renderBegin
              }
              if (latestEnd === null || renderEnd > latestEnd) {
                latestEnd = renderEnd
              }
            }

            if (latestEnd === null) {
              nextTimings.set(passIds[i]!, { total: 0, compute: 0, render: 0 })
              continue
            }

            // Some browser/GPU stacks report per-pass begin timestamps from a
            // common frame origin while end timestamps advance monotonically.
            // Clamp each pass start to the previous pass end so consumers get
            // actual per-pass deltas instead of cumulative frame time.
            const timingFloor = previousPassEnd ?? earliestStart ?? latestEnd
            const passStart =
              earliestStart !== null && earliestStart > timingFloor ? earliestStart : timingFloor

            let computeMs = 0
            if (phase.hasCompute && computeEnd > 0n) {
              const computeStart = computeBegin > passStart ? computeBegin : passStart
              if (computeEnd > computeStart) {
                computeMs = Number(computeEnd - computeStart) / 1_000_000
              }
            }

            let renderMs = 0
            if (phase.hasRender && renderEnd > 0n) {
              let renderStart = renderBegin > passStart ? renderBegin : passStart
              if (phase.hasCompute && computeEnd > renderStart && renderEnd > computeEnd) {
                renderStart = computeEnd
              }
              if (renderEnd > renderStart) {
                renderMs = Number(renderEnd - renderStart) / 1_000_000
              }
            }

            const totalMs = latestEnd > passStart ? Number(latestEnd - passStart) / 1_000_000 : 0
            previousPassEnd =
              previousPassEnd === null || latestEnd > previousPassEnd ? latestEnd : previousPassEnd

            nextTimings.set(passIds[i]!, { total: totalMs, compute: computeMs, render: renderMs })
          }

          this.lastPassTimings = nextTimings
        } finally {
          readBuffer.unmap()
        }
      })
      .catch((err) => {
        if (!this.enabled) return
        logger.warn('[WebGPU RenderGraph] Timestamp readback failed:', err)
      })
      .finally(() => {
        this.readbackInFlight = false
      })
  }

  dispose(): void {
    this.querySet?.destroy()
    this.querySet = null
    this.resolveBuffer?.destroy()
    this.resolveBuffer = null
    this.readBuffer?.destroy()
    this.readBuffer = null
    this.enabled = false
    this.readbackInFlight = false
    this.lastPassTimings.clear()
  }
}
