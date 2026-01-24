/**
 * Dimension-based color coding utilities
 *
 * Provides functions to map dimension indices to distinct colors
 * for per-dimension visual differentiation of polytope edges.
 *
 * @see docs/prd/enhanced-visuals-rendering-pipeline.md
 */

/**
 * Get a color for a specific dimension index using HSL color wheel.
 *
 * Maps dimension indices to evenly spaced hues around the color wheel,
 * providing visually distinct colors for each dimension.
 *
 * @param dimIndex - The dimension index (0-based)
 * @param totalDims - Total number of dimensions
 * @returns HSL color string
 *
 * @example
 * ```ts
 * // For a 4D object:
 * getDimensionColor(0, 4); // "hsl(0, 80%, 60%)" - red (X)
 * getDimensionColor(1, 4); // "hsl(90, 80%, 60%)" - green (Y)
 * getDimensionColor(2, 4); // "hsl(180, 80%, 60%)" - cyan (Z)
 * getDimensionColor(3, 4); // "hsl(270, 80%, 60%)" - purple (W)
 * ```
 */
export function getDimensionColor(dimIndex: number, totalDims: number): string {
  if (totalDims <= 0) return 'hsl(0, 80%, 60%)'
  const hue = (dimIndex / totalDims) * 360
  return `hsl(${hue}, 80%, 60%)`
}

/**
 * Get a hex color for a specific dimension index.
 *
 * @param dimIndex - The dimension index (0-based)
 * @param totalDims - Total number of dimensions
 * @returns Hex color string
 *
 * @example
 * ```ts
 * getDimensionColorHex(0, 4); // "#ff3333" - red (X)
 * getDimensionColorHex(1, 4); // "#33ff33" - green (Y)
 * ```
 */
export function getDimensionColorHex(dimIndex: number, totalDims: number): string {
  if (totalDims <= 0) return '#ff3333'
  const hue = (dimIndex / totalDims) * 360
  return hslToHex(hue, 80, 60)
}

/**
 * Determine which dimensions an edge belongs to.
 *
 * An edge "belongs to" a dimension if the two vertices differ
 * in that dimension's coordinate. For standard polytopes, edges
 * typically differ in exactly one dimension.
 *
 * @param v1 - First vertex coordinates
 * @param v2 - Second vertex coordinates
 * @returns Array of dimension indices where the vertices differ
 *
 * @example
 * ```ts
 * // Edge in the X dimension
 * getEdgeDimensions([0, 0, 0], [1, 0, 0]); // [0]
 *
 * // Edge in the Y dimension
 * getEdgeDimensions([0, 0, 0], [0, 1, 0]); // [1]
 *
 * // Diagonal edge (rare in standard polytopes)
 * getEdgeDimensions([0, 0, 0], [1, 1, 0]); // [0, 1]
 * ```
 */
export function getEdgeDimensions(v1: number[], v2: number[]): number[] {
  const dimensions: number[] = []
  const minLength = Math.min(v1.length, v2.length)

  for (let i = 0; i < minLength; i++) {
    // Use a small epsilon for floating point comparison
    if (Math.abs((v1[i] ?? 0) - (v2[i] ?? 0)) > 1e-10) {
      dimensions.push(i)
    }
  }

  return dimensions
}

/**
 * Get the primary dimension for an edge.
 *
 * Returns the first dimension where the vertices differ,
 * or 0 if they don't differ (shouldn't happen for valid edges).
 *
 * @param v1 - First vertex coordinates
 * @param v2 - Second vertex coordinates
 * @returns Primary dimension index
 */
export function getEdgePrimaryDimension(v1: number[], v2: number[]): number {
  const dims = getEdgeDimensions(v1, v2)
  return dims[0] ?? 0
}

/**
 * Get a color for an edge based on its dimensions.
 *
 * If the edge belongs to multiple dimensions (diagonal), blends the colors.
 * Otherwise, returns the color for the primary dimension.
 *
 * @param v1 - First vertex coordinates
 * @param v2 - Second vertex coordinates
 * @param totalDims - Total number of dimensions in the polytope
 * @returns Hex color string
 */
export function getEdgeColor(v1: number[], v2: number[], totalDims: number): string {
  const dims = getEdgeDimensions(v1, v2)

  if (dims.length === 0) {
    return getDimensionColorHex(0, totalDims)
  }

  if (dims.length === 1) {
    return getDimensionColorHex(dims[0]!, totalDims)
  }

  // For multi-dimension edges, use the primary (first) dimension
  return getDimensionColorHex(dims[0]!, totalDims)
}

/**
 * Predefined dimension colors for common dimensions.
 *
 * These provide recognizable colors for standard XYZ(W) axes:
 * - X: Red
 * - Y: Green
 * - Z: Blue
 * - W: Purple/Magenta
 * - Higher dimensions: Cycle through additional colors
 */
export const DIMENSION_COLORS: Record<number, string> = {
  0: '#FF4444', // X - Red
  1: '#44FF44', // Y - Green
  2: '#4444FF', // Z - Blue
  3: '#FF44FF', // W - Magenta
  4: '#FFFF44', // V - Yellow
  5: '#44FFFF', // U - Cyan
  6: '#FF8844', // T - Orange
  7: '#8844FF', // S - Purple
}

/**
 * Get a predefined dimension color.
 *
 * Uses predefined colors for the first 8 dimensions,
 * then falls back to computed HSL colors for higher dimensions.
 *
 * @param dimIndex - The dimension index
 * @param totalDims - Total number of dimensions (used for fallback)
 * @returns Hex color string
 */
export function getPredefinedDimensionColor(dimIndex: number, totalDims: number): string {
  if (dimIndex < 8 && DIMENSION_COLORS[dimIndex]) {
    return DIMENSION_COLORS[dimIndex]!
  }
  return getDimensionColorHex(dimIndex, totalDims)
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert HSL values to hex color string.
 *
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns Hex color string
 */
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100
  const lNorm = l / 100

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lNorm - c / 2

  let r = 0,
    g = 0,
    b = 0

  if (0 <= h && h < 60) {
    r = c
    g = x
    b = 0
  } else if (60 <= h && h < 120) {
    r = x
    g = c
    b = 0
  } else if (120 <= h && h < 180) {
    r = 0
    g = c
    b = x
  } else if (180 <= h && h < 240) {
    r = 0
    g = x
    b = c
  } else if (240 <= h && h < 300) {
    r = x
    g = 0
    b = c
  } else if (300 <= h && h < 360) {
    r = c
    g = 0
    b = x
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
