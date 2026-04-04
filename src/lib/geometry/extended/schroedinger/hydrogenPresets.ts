/**
 * Hydrogen quantum number utilities
 *
 * Shared helpers used by Hydrogen ND controls and labels.
 */

/**
 * Orbital shape letter from azimuthal quantum number.
 * @param l - The azimuthal quantum number
 * @returns The orbital shape letter (s, p, d, f, etc.)
 */
export function orbitalShapeLetter(l: number): string {
  const letters = ['s', 'p', 'd', 'f', 'g', 'h', 'i']
  return letters[l] ?? `l=${l}`
}

/**
 * Get maximum l for a given n.
 * @param n - The principal quantum number
 * @returns Maximum azimuthal quantum number (n-1)
 */
export function maxAzimuthalForPrincipal(n: number): number {
  return Math.max(0, n - 1)
}

/**
 * Validate quantum number constraints.
 * @param n - Principal quantum number
 * @param l - Azimuthal quantum number
 * @param m - Magnetic quantum number
 * @returns True if quantum numbers are valid
 */
export function validateQuantumNumbers(n: number, l: number, m: number): boolean {
  if (n < 1) return false
  if (l < 0 || l >= n) return false
  if (Math.abs(m) > l) return false
  return true
}

/** Lookup table mapping (l, m) → orbital suffix for well-known orbitals. */
const ORBITAL_SUFFIX: Record<number, Record<number, string>> = {
  1: { 0: 'pz', 1: 'px', '-1': 'py' },
  2: { 0: 'dz²', 1: 'dxz', '-1': 'dyz', 2: 'dx²-y²', '-2': 'dxy' },
}

/**
 * Generate a label for arbitrary quantum numbers.
 * @param n - Principal quantum number
 * @param l - Angular momentum quantum number
 * @param m - Magnetic quantum number
 * @returns Human-readable label string
 */
export function quantumNumbersToLabel(n: number, l: number, m: number): string {
  const letter = orbitalShapeLetter(l)
  if (l === 0) return `${n}${letter}`

  const suffix = ORBITAL_SUFFIX[l]?.[m]
  if (suffix) return `${n}${suffix}`

  return `${n}${letter} (m=${m})`
}
