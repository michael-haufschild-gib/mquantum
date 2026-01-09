/**
 * Kerr Black Hole Physics
 *
 * Computes physically accurate radii for rotating (Kerr) black holes.
 * All formulas use geometric units (G = c = 1) where:
 *   - Mass M defines the scale
 *   - Schwarzschild radius rs = 2M
 *   - Spin parameter a = J/(Mc) is dimensionless (0 to M)
 *   - Dimensionless spin chi = a/M (0 to ~0.998)
 *
 * References:
 * - https://en.wikipedia.org/wiki/Kerr_metric
 * - https://en.wikipedia.org/wiki/Innermost_stable_circular_orbit
 * - https://www.fabiopacucci.com/resources/black-hole-calculator/formulas-black-hole-calculator/
 */

/**
 * Kerr black hole computed radii (all in units of M, the mass parameter).
 */
export interface KerrRadii {
  /** Event horizon radius r+ (outer horizon) */
  eventHorizon: number
  /** Cauchy horizon radius r- (inner horizon, for reference) */
  cauchyHorizon: number
  /** Prograde photon sphere radius */
  photonSpherePrograde: number
  /** Retrograde photon sphere radius */
  photonSphereRetrograde: number
  /** Prograde ISCO (innermost stable circular orbit) */
  iscoPrograde: number
  /** Retrograde ISCO */
  iscoRetrograde: number
  /**
   * Shadow radius (apparent black hole silhouette as seen from infinity).
   * For Schwarzschild: 3√3 * M ≈ 5.196 * M ≈ 2.598 * rs
   * For Kerr: varies with spin and viewing angle (this is approximate average)
   *
   * This is the critical impact parameter - rays with smaller impact
   * parameter will be captured by the black hole.
   */
  shadowRadius: number
}

/**
 * Compute all Kerr black hole radii from mass and spin.
 *
 * @param mass - Black hole mass parameter M (determines overall scale)
 * @param spin - Dimensionless spin chi = a/M (0 = Schwarzschild, 0.998 = near-extremal)
 * @returns All computed radii in units of M
 */
export function computeKerrRadii(mass: number, spin: number): KerrRadii {
  const chi = Math.max(0, Math.min(0.998, spin))
  const M = mass

  const chiSq = chi * chi

  // r± = M ± M*sqrt(1 - chi^2)
  const sqrtTerm = M * Math.sqrt(Math.max(0, 1 - chiSq))
  const eventHorizon = M + sqrtTerm
  const cauchyHorizon = M - sqrtTerm

  // Photon sphere: use one acos
  const theta = Math.acos(chi) // acos(+chi)
  const thetaNeg = Math.PI - theta // acos(-chi)
  const twoThirds = 2 / 3

  const photonSpherePrograde = 2 * M * (1 + Math.cos(twoThirds * thetaNeg))
  const photonSphereRetrograde = 2 * M * (1 + Math.cos(twoThirds * theta))

  // ISCO: reuse cbrts, reuse chiSq
  const oneMinusChiSq = Math.max(0, 1 - chiSq)
  const c1 = Math.cbrt(oneMinusChiSq)
  const cPlus = Math.cbrt(1 + chi)
  const cMinus = Math.cbrt(1 - chi)

  const Z1 = 1 + c1 * (cPlus + cMinus)
  const Z2 = Math.sqrt(3 * chiSq + Z1 * Z1)

  const sqrtISCO = Math.sqrt(Math.max(0, (3 - Z1) * (3 + Z1 + 2 * Z2)))
  const base = M * (3 + Z2)
  const iscoPrograde = base - M * sqrtISCO
  const iscoRetrograde = base + M * sqrtISCO

  // Shadow radius: reuse chiSq
  const schwarzschildShadow = 3 * Math.sqrt(3) * M
  const shadowRadius = schwarzschildShadow * Math.sqrt(1 - chiSq / 4)

  return {
    eventHorizon,
    cauchyHorizon,
    photonSpherePrograde,
    photonSphereRetrograde,
    iscoPrograde,
    iscoRetrograde,
    shadowRadius,
  }
}

/**
 * Compute the Schwarzschild (non-rotating) radii for reference.
 *
 * @param mass - Black hole mass parameter M
 * @returns Schwarzschild radii
 */
export function computeSchwarzschildRadii(mass: number) {
  const M = mass
  return {
    eventHorizon: 2 * M, // rs = 2M
    photonSphere: 3 * M, // r_ph = 1.5 * rs = 3M
    isco: 6 * M, // r_ISCO = 3 * rs = 6M
  }
}

/**
 * Convert blackbody temperature to RGB color.
 *
 * Uses Planckian locus approximation for temperatures 1000K - 40000K.
 * Based on the algorithm by Tanner Helland.
 *
 * @param temperature - Temperature in Kelvin (1000 - 40000)
 * @returns RGB values in [0, 1] range
 */
export function temperatureToRGB(temperature: number): [number, number, number] {
  // Clamp to valid range
  const temp = Math.max(1000, Math.min(40000, temperature)) / 100

  let r: number, g: number, b: number

  // Red channel
  if (temp <= 66) {
    r = 255
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592)
    r = Math.max(0, Math.min(255, r))
  }

  // Green channel
  if (temp <= 66) {
    g = 99.4708025861 * Math.log(temp) - 161.1195681661
  } else {
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492)
  }
  g = Math.max(0, Math.min(255, g))

  // Blue channel
  if (temp >= 66) {
    b = 255
  } else if (temp <= 19) {
    b = 0
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307
    b = Math.max(0, Math.min(255, b))
  }

  return [r / 255, g / 255, b / 255]
}

/**
 * Convert RGB to hex color string.
 *
 * @param r - Red channel (0-1)
 * @param g - Green channel (0-1)
 * @param b - Blue channel (0-1)
 * @returns Hex color string (e.g., "#ff8800")
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Compute disk color from temperature using blackbody approximation.
 *
 * @param temperature - Temperature in Kelvin (1000 - 40000)
 * @returns Hex color string
 */
export function diskTemperatureToColor(temperature: number): string {
  const [r, g, b] = temperatureToRGB(temperature)
  return rgbToHex(r, g, b)
}

/**
 * Standard accretion disk temperature profile with stress-free ISCO boundary.
 *
 * For a thin disk around a Schwarzschild/Kerr black hole:
 *   T(r) = T_max * (r/r_ISCO)^(-3/4) * [1 - sqrt(r_ISCO/r)]^(1/4)
 *
 * The [1 - sqrt(r_ISCO/r)]^(1/4) factor accounts for the stress-free
 * boundary condition at ISCO where torque vanishes:
 * - Goes to 0 at r = r_ISCO (no radiation at inner edge)
 * - Approaches 1 for r >> r_ISCO (standard profile at large r)
 * - Peak temperature occurs at r ≈ 1.36 * r_ISCO
 *
 * Reference: Novikov & Thorne (1973), Page & Thorne (1974)
 *
 * @param r - Radius from center
 * @param rInner - Inner disk radius (ISCO)
 * @param tInner - Temperature scale (peak temperature, not at ISCO)
 * @returns Temperature at radius r (in Kelvin)
 */
export function diskTemperatureProfile(r: number, rInner: number, tInner: number): number {
  if (r <= rInner) return 0
  const x = rInner / r // reuse
  const basicFalloff = Math.pow(x, 0.75)
  const iscoCorrection = Math.pow(1 - Math.sqrt(x), 0.25)
  return tInner * basicFalloff * iscoCorrection
}

/**
 * Estimate inner disk temperature from black hole mass.
 *
 * For stellar mass black holes: T_inner ~ 10^7 K
 * For supermassive black holes: T_inner ~ 10^5 K
 *
 * This is a simplified artistic approximation, not a precise calculation.
 *
 * @param mass - Black hole mass parameter (arbitrary units for visualization)
 * @returns Estimated inner disk temperature in Kelvin
 */
export function estimateDiskTemperature(mass: number): number {
  const baseTempK = 8000
  const scaleFactor = 1.0 / Math.sqrt(Math.sqrt(mass))
  return baseTempK * scaleFactor
}
