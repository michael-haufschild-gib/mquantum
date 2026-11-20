/** Exterior radius in units of the AdS length (horizon at r = 1). */
export const INNER_RADIUS = 1.02
export const OUTER_RADIUS = 4
export const REFERENCE_RADIUS = 2
export const BALL_LIMIT = 0.985
export const DISPLAY_RADIUS = 2.5

/** HGT's Neumann master profile fN(w,r) = r exp(w γ(r)), relative to r = 2.
 * For w = −½ − iν, the complex factor is gain · exp(−iν delay). */
export function radialProfile(r: number): { delay: number; gain: number } {
  const delay = 0.5 * Math.log((1 - 1 / r ** 2) / (1 - 1 / REFERENCE_RADIUS ** 2))
  return { delay, gain: (r / REFERENCE_RADIUS) * Math.exp(-delay / 2) }
}

/** Constant-r sections of the spatial Poincaré ball are spherical caps.
 * Return the angular disk coordinate at the nearest visible probe-shell hit.
 * origin and unit ray are in the intrinsic ball frame. */
export function intersectExteriorShell(
  origin: number[],
  ray: number[],
  radius: number,
  cutaway: boolean
): [number, number] | null {
  const offset = 1 / Math.sqrt(radius ** 2 - 1)
  const [x, y, z] = origin as [number, number, number]
  const [u, v, w] = ray as [number, number, number]
  const along = x * u + y * v + (z + offset) * w
  const disc = along ** 2 - (x * x + y * y + z * z + 2 * offset * z - 1)
  if (disc < 0) return null
  for (const t of [-along - Math.sqrt(disc), -along + Math.sqrt(disc)]) {
    const bx = x + u * t,
      by = y + v * t,
      bz = z + w * t
    const norm2 = bx * bx + by * by + bz * bz
    if (t < 0 || bz <= 0 || norm2 > BALL_LIMIT ** 2 || (cutaway && bx > by)) continue
    const scale = 2 / (1 + norm2 + radius * (1 - norm2))
    return [bx * scale, by * scale]
  }
  return null
}
