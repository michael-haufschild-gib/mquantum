/**
 * Temporal Sub-Pixel Jitter
 *
 * Shared WGSL code generator for Bayer-pattern sub-pixel jitter used by
 * temporal rendering modes. In quarter-res rendering, each pixel covers a
 * 2x2 block; the Bayer offset cycles through sub-pixel positions over 4 frames.
 *
 * @module rendering/webgpu/shaders/schroedinger/temporalJitter
 */

/** Bayer pattern offsets for the 4-frame temporal jitter cycle. */
export const BAYER_OFFSETS: [number, number][] = [
  [0, 0],
  [1, 1],
  [1, 0],
  [0, 1],
]

/** Advance temporal Bayer state after the current frame has used `currentIndex`. */
export function advanceTemporalBayerCycle(
  currentIndex: number,
  completedFullCycle: boolean,
  sceneChanged: boolean
): { index: number; completedFullCycle: boolean } {
  if (sceneChanged) {
    return { index: (currentIndex + 1) % BAYER_OFFSETS.length, completedFullCycle: false }
  }

  if (!completedFullCycle) {
    const nextIndex = (currentIndex + 1) % BAYER_OFFSETS.length
    return { index: nextIndex, completedFullCycle: nextIndex === 0 }
  }

  return { index: currentIndex, completedFullCycle }
}

/**
 * Generate the WGSL Bayer sub-pixel jitter block.
 *
 * Produces `jitteredVPosition` (vec3f) from `input.vPosition` and camera uniforms.
 * All quarter-res pixels render — no discard based on Bayer pattern.
 *
 * @returns WGSL code block (empty string if disabled)
 */
export function generateBayerJitterSection(bayerJitter: boolean): string {
  if (!bayerJitter) return ''

  return `
  // ============================================
  // Temporal Sub-Pixel Jitter
  // ============================================
  // In quarter-res mode, each pixel covers a 2×2 block of full-res pixels.
  // The Bayer offset determines which sub-pixel within the block we sample.
  // Over 4 frames (with cycling offsets), all sub-pixels are covered.
  // NO DISCARD — all quarter-res pixels must render for proper accumulation.

  let jitterOffset = camera.bayerOffset - vec2f(0.5);
  let dist = length(input.vPosition - camera.cameraPosition);
  let pixelSizeY = 2.0 * dist * tan(camera.fov * 0.5) / camera.resolution.y;
  let pixelSizeX = 2.0 * dist * tan(camera.fov * 0.5) * camera.aspectRatio /
                   camera.resolution.x;
  let cameraRight = normalize(camera.inverseViewMatrix[0].xyz);
  let cameraUp = normalize(camera.inverseViewMatrix[1].xyz);
  let worldOffset = cameraRight * (jitterOffset.x * pixelSizeX) -
                    cameraUp * (jitterOffset.y * pixelSizeY);
  let jitteredVPosition = input.vPosition + worldOffset;
`
}

/**
 * Get the ray direction source variable name based on jitter state.
 *
 * @returns 'jitteredVPosition' when jitter enabled, 'input.vPosition' otherwise
 */
export function getRayDirSource(bayerJitter: boolean): string {
  return bayerJitter ? 'jitteredVPosition' : 'input.vPosition'
}
