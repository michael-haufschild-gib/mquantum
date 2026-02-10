/**
 * FPS limiter helper for RAF-driven render loops.
 *
 * Uses deadline scheduling so target FPS values that are not divisors of the
 * display refresh cadence still map to the expected long-run average.
 */

const FRAME_INTERVAL_EPSILON_MS = 0.05

export interface EvaluateFpsLimitArgs {
  nowMs: number
  throttleAnchorMs: number
  maxFps: number
}

export interface FpsLimitDecision {
  shouldRender: boolean
  nextThrottleAnchorMs: number
}

/**
 * Decide whether the current RAF tick should render a frame.
 *
 * @param args Decision arguments.
 * @param args.nowMs Current high-resolution timestamp.
 * @param args.throttleAnchorMs Previous limiter anchor timestamp.
 * @param args.maxFps Requested FPS cap (<= 0 disables limiting).
 * @returns Render decision and next limiter anchor.
 */
export function evaluateFpsLimit({
  nowMs,
  throttleAnchorMs,
  maxFps,
}: EvaluateFpsLimitArgs): FpsLimitDecision {
  if (!(maxFps > 0) || !Number.isFinite(maxFps)) {
    return {
      shouldRender: true,
      nextThrottleAnchorMs: nowMs,
    }
  }

  const targetFrameIntervalMs = 1000 / maxFps
  if (!(targetFrameIntervalMs > 0) || !Number.isFinite(targetFrameIntervalMs)) {
    return {
      shouldRender: true,
      nextThrottleAnchorMs: nowMs,
    }
  }

  const nextEligibleRenderMs = throttleAnchorMs > 0 ? throttleAnchorMs : nowMs
  if (nowMs + FRAME_INTERVAL_EPSILON_MS < nextEligibleRenderMs) {
    return {
      shouldRender: false,
      nextThrottleAnchorMs: throttleAnchorMs,
    }
  }

  let nextThrottleAnchorMs = nextEligibleRenderMs + targetFrameIntervalMs
  if (nextThrottleAnchorMs <= nowMs) {
    const skippedIntervals =
      Math.floor((nowMs - nextThrottleAnchorMs) / targetFrameIntervalMs) + 1
    nextThrottleAnchorMs += skippedIntervals * targetFrameIntervalMs
  }

  return {
    shouldRender: true,
    nextThrottleAnchorMs,
  }
}
