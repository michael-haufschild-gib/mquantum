/**
 * Shared density grid texture resolution.
 *
 * Both the GPU 3D density texture (rendering layer) and the CPU k-space
 * display pipeline (physics layer) must use this same value. A mismatch
 * causes the CPU-produced k-space data to be written to the wrong region
 * of the GPU texture.
 */
export const DENSITY_GRID_SIZE = 96
