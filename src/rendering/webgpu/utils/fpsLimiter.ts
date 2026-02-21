/**
 * FPS limiter helper for RAF-driven render loops.
 *
 * Uses deadline scheduling so target FPS values that are not divisors of the
 * display refresh cadence still map to the expected long-run average.
 */

const FRAME_INTERVAL_EPSILON_MS = 0.05

/**
 * Input arguments for FPS limiter evaluation.
 */
export interface EvaluateFpsLimitArgs {
  nowMs: number
  throttleAnchorMs: number
  maxFps: number
}

/**
 * Result of an FPS limiter evaluation step.
 */
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
  const safeNowMs = Number.isFinite(nowMs) ? nowMs : 0
  const safeThrottleAnchorMs = Number.isFinite(throttleAnchorMs) ? throttleAnchorMs : 0

  if (!(maxFps > 0) || !Number.isFinite(maxFps)) {
    return {
      shouldRender: true,
      nextThrottleAnchorMs: safeNowMs,
    }
  }

  const targetFrameIntervalMs = 1000 / maxFps
  if (!(targetFrameIntervalMs > 0) || !Number.isFinite(targetFrameIntervalMs)) {
    return {
      shouldRender: true,
      nextThrottleAnchorMs: safeNowMs,
    }
  }

  const nextEligibleRenderMs = safeThrottleAnchorMs > 0 ? safeThrottleAnchorMs : safeNowMs
  if (safeNowMs + FRAME_INTERVAL_EPSILON_MS < nextEligibleRenderMs) {
    return {
      shouldRender: false,
      nextThrottleAnchorMs: safeThrottleAnchorMs,
    }
  }

  let nextThrottleAnchorMs = nextEligibleRenderMs + targetFrameIntervalMs
  if (nextThrottleAnchorMs <= safeNowMs) {
    const skippedIntervals =
      Math.floor((safeNowMs - nextThrottleAnchorMs) / targetFrameIntervalMs) + 1
    nextThrottleAnchorMs += skippedIntervals * targetFrameIntervalMs
  }

  return {
    shouldRender: true,
    nextThrottleAnchorMs,
  }
}
