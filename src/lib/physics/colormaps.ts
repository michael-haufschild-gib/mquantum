/**
 * Perceptually Uniform Colormaps
 *
 * CPU-side colormap lookup tables for scientific visualization.
 * Provides viridis, inferno, magma, and plasma — the standard
 * perceptually uniform sequential colormaps (Matplotlib 2.0+).
 *
 * Each built-in colormap is defined by 11 sampled control points in sRGB [0,1],
 * taken at uniform positions along [0,1] from the matplotlib reference tables.
 * These are expanded at runtime into a 256-entry LUT via linear interpolation
 * to produce smooth gradients at lookup time.
 *
 * @module lib/physics/colormaps
 */

/** Available perceptually uniform colormaps. */
export type CarpetColormap = 'viridis' | 'inferno' | 'magma' | 'plasma'

// ═══════════════════════════════════════════════════════════════════════════
// COLORMAP DATA — 11 control points each, interpolated to 256 entries
// Sampled from matplotlib reference tables at uniform intervals
// ═══════════════════════════════════════════════════════════════════════════

/** [r, g, b] triplets at uniform positions along [0,1] (11 per built-in colormap) */
type ColormapControlPoints = readonly (readonly [number, number, number])[]

const VIRIDIS_CONTROL: ColormapControlPoints = [
  [0.267, 0.005, 0.329],
  [0.283, 0.141, 0.458],
  [0.254, 0.265, 0.53],
  [0.207, 0.372, 0.553],
  [0.164, 0.471, 0.558],
  [0.128, 0.567, 0.551],
  [0.135, 0.659, 0.518],
  [0.267, 0.749, 0.441],
  [0.478, 0.821, 0.318],
  [0.741, 0.873, 0.15],
  [0.993, 0.906, 0.144],
] as const

const INFERNO_CONTROL: ColormapControlPoints = [
  [0.001, 0.0, 0.014],
  [0.087, 0.044, 0.225],
  [0.232, 0.06, 0.438],
  [0.396, 0.083, 0.434],
  [0.55, 0.121, 0.378],
  [0.694, 0.165, 0.299],
  [0.816, 0.24, 0.202],
  [0.908, 0.36, 0.099],
  [0.961, 0.521, 0.014],
  [0.969, 0.711, 0.097],
  [0.988, 0.998, 0.645],
] as const

const MAGMA_CONTROL: ColormapControlPoints = [
  [0.001, 0.0, 0.014],
  [0.079, 0.052, 0.216],
  [0.208, 0.075, 0.429],
  [0.371, 0.074, 0.503],
  [0.53, 0.098, 0.506],
  [0.678, 0.153, 0.477],
  [0.82, 0.237, 0.415],
  [0.927, 0.378, 0.378],
  [0.973, 0.556, 0.416],
  [0.983, 0.75, 0.533],
  [0.987, 0.991, 0.75],
] as const

const PLASMA_CONTROL: ColormapControlPoints = [
  [0.05, 0.03, 0.528],
  [0.229, 0.029, 0.586],
  [0.382, 0.001, 0.603],
  [0.519, 0.004, 0.565],
  [0.64, 0.057, 0.488],
  [0.742, 0.144, 0.389],
  [0.832, 0.244, 0.283],
  [0.905, 0.36, 0.184],
  [0.954, 0.498, 0.098],
  [0.975, 0.656, 0.039],
  [0.94, 0.975, 0.131],
] as const

// ═══════════════════════════════════════════════════════════════════════════
// LUT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interpolate between control points to produce a 256-entry RGBA LUT.
 *
 * @param controls - Array of [r, g, b] control points (sRGB, 0-1)
 * @returns Uint8ClampedArray of length 1024 (256 RGBA entries)
 */
function generateLUT(controls: ColormapControlPoints): Uint8ClampedArray {
  const n = controls.length
  const lut = new Uint8ClampedArray(256 * 4)

  for (let i = 0; i < 256; i++) {
    const t = i / 255
    const scaledT = t * (n - 1)
    const idx = Math.min(Math.floor(scaledT), n - 2)
    const frac = scaledT - idx

    // idx is clamped to [0, n-2] and controls has at least 2 entries
    const c0 = controls[idx]!
    const c1 = controls[idx + 1]!
    const r = c0[0] + (c1[0] - c0[0]) * frac
    const g = c0[1] + (c1[1] - c0[1]) * frac
    const b = c0[2] + (c1[2] - c0[2]) * frac

    const base = i * 4
    lut[base] = Math.round(r * 255)
    lut[base + 1] = Math.round(g * 255)
    lut[base + 2] = Math.round(b * 255)
    lut[base + 3] = 255
  }

  return lut
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHED LUTS
// ═══════════════════════════════════════════════════════════════════════════

const lutCache = new Map<CarpetColormap, Uint8ClampedArray>()

/**
 * Get the 256-entry RGBA lookup table for a colormap.
 * Results are cached — subsequent calls return the same array.
 *
 * @param name - Colormap name
 * @returns Uint8ClampedArray of length 1024 (256 × RGBA)
 *
 * @example
 * ```ts
 * const lut = getColormapLUT('viridis')
 * const r = lut[i * 4 + 0]
 * const g = lut[i * 4 + 1]
 * const b = lut[i * 4 + 2]
 * ```
 */
export function getColormapLUT(name: CarpetColormap): Uint8ClampedArray {
  const cached = lutCache.get(name)
  if (cached) return cached

  const controls = COLORMAP_CONTROLS[name]
  const lut = generateLUT(controls)
  lutCache.set(name, lut)
  return lut
}

const COLORMAP_CONTROLS: Record<CarpetColormap, ColormapControlPoints> = {
  viridis: VIRIDIS_CONTROL,
  inferno: INFERNO_CONTROL,
  magma: MAGMA_CONTROL,
  plasma: PLASMA_CONTROL,
}

/**
 * Map a normalized density value [0,1] to an RGBA color using the specified colormap.
 *
 * @param value - Normalized density in [0, 1] (clamped internally)
 * @param name - Colormap name
 * @returns [r, g, b, a] in [0, 255]
 *
 * @example
 * ```ts
 * const [r, g, b, a] = colormapRGBA(0.5, 'viridis')
 * ```
 */
export function colormapRGBA(
  value: number,
  name: CarpetColormap
): [number, number, number, number] {
  const lut = getColormapLUT(name)
  const idx = Math.max(0, Math.min(255, Math.round(value * 255)))
  const base = idx * 4
  // idx is clamped to [0, 255], lut is 1024 entries — always in bounds
  return [lut[base]!, lut[base + 1]!, lut[base + 2]!, lut[base + 3]!]
}

/**
 * Paint carpet density data onto a canvas 2D context using the specified colormap.
 *
 * Renders the rolling carpet with the write head determining the newest row.
 * Rows are displayed with oldest at top, newest at bottom.
 *
 * @param ctx - Canvas 2D rendering context
 * @param data - Float32Array of carpet density values (gridSize × historyLength)
 * @param gridSize - Number of spatial samples per row
 * @param historyLength - Total number of rows in the rolling buffer
 * @param writeHead - Current write position (most recently written row)
 * @param totalFrames - Total frames accumulated (used to determine filled region)
 * @param colormap - Colormap to apply
 * @param logScale - Whether data is already in log scale
 */
export function paintCarpetToCanvas(
  ctx: CanvasRenderingContext2D,
  data: Float32Array,
  gridSize: number,
  historyLength: number,
  writeHead: number,
  totalFrames: number,
  colormap: CarpetColormap,
  logScale: boolean
): void {
  const canvasW = ctx.canvas.width
  const canvasH = ctx.canvas.height
  const imageData = ctx.createImageData(canvasW, canvasH)
  const pixels = imageData.data
  const lut = getColormapLUT(colormap)
  const filledRows = Math.min(totalFrames, historyLength)

  // Find value range for normalization
  let minVal = Infinity
  let maxVal = -Infinity
  const dataLen = data.length
  for (let i = 0; i < dataLen; i++) {
    const v = data[i]! // i < dataLen guarantees in bounds
    if (v < minVal) minVal = v
    if (v > maxVal) maxVal = v
  }

  // Log data can be negative (log of small densities). Linear data is [0, max].
  // Normalize both to [0, 1] using their actual range.
  const rangeMin = logScale ? minVal : 0
  const range = maxVal - rangeMin
  const invRange = range > 0 ? 1 / range : 1

  // Scale factors for mapping canvas pixels to carpet data
  const xScale = gridSize / canvasW
  const yScale = historyLength / canvasH

  for (let py = 0; py < canvasH; py++) {
    const carpetRow = Math.floor(py * yScale)

    if (carpetRow >= filledRows) {
      const rowBase = py * canvasW * 4
      for (let px = 0; px < canvasW; px++) {
        const pBase = rowBase + px * 4
        pixels[pBase] = 0
        pixels[pBase + 1] = 0
        pixels[pBase + 2] = 0
        pixels[pBase + 3] = 255
      }
      continue
    }

    // Rolling buffer: display row 0 = oldest, (filledRows-1) = newest = writeHead
    const dataRow = (writeHead - filledRows + 1 + carpetRow + historyLength) % historyLength

    const rowBase = py * canvasW * 4
    const dataRowOffset = dataRow * gridSize

    for (let px = 0; px < canvasW; px++) {
      const dataCol = Math.min(Math.floor(px * xScale), gridSize - 1)
      // dataRowOffset + dataCol is within data bounds (bounded by gridSize * historyLength)
      const raw = data[dataRowOffset + dataCol]!
      const normalized = (raw - rangeMin) * invRange

      // lutIdx clamped to [0, 255]*4 — always in bounds for 1024-entry LUT
      const lutIdx = Math.max(0, Math.min(255, Math.round(normalized * 255))) * 4
      const pBase = rowBase + px * 4
      pixels[pBase] = lut[lutIdx]!
      pixels[pBase + 1] = lut[lutIdx + 1]!
      pixels[pBase + 2] = lut[lutIdx + 2]!
      pixels[pBase + 3] = 255
    }
  }

  ctx.putImageData(imageData, 0, 0)
}
