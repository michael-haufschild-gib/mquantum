/**
 * Known benign GPU console messages that are not bugs.
 *
 * These patterns match messages that occur during normal operation
 * (especially rapid mode switching) and do not indicate incorrect behavior.
 * They are filtered from BOTH console.error and console.warning captures.
 *
 * Shared between fixtures.ts and app-helpers.ts to avoid divergence.
 *
 * - Buffer destroyed during pending MapAsync: Diagnostic staging buffers
 *   are destroyed while a readback mapAsync is still pending. Dawn emits
 *   a validation warning, but the app catches the rejected promise.
 *
 * - DiracAlgebraBridge disposed during gamma matrix generation: The Dirac
 *   mode logs console.error when its algebra bridge is disposed while an
 *   async gamma matrix computation is in flight. The app recovers by
 *   loading the next mode's pipeline.
 */
export const BENIGN_GPU_PATTERNS: RegExp[] = [
  // Staging buffer destroyed while mapAsync is pending (rapid mode teardown).
  /is destroyed[\s\S]*While calling[\s\S]*MapAsync/i,
  // Dirac algebra bridge disposed during async gamma matrix generation.
  /DiracAlgebraBridge disposed/i,
]
