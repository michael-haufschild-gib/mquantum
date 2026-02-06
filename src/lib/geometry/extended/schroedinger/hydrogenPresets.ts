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

/**
 * Generate a label for arbitrary quantum numbers.
 * @param n - Principal quantum number
 * @param l - Angular momentum quantum number
 * @param m - Magnetic quantum number
 * @returns Human-readable label string
 */
export function quantumNumbersToLabel(n: number, l: number, m: number): string {
  const letter = orbitalShapeLetter(l)
  if (l === 0) {
    return `${n}${letter}`
  }

  if (l === 1) {
    if (m === 0) return `${n}pz`
    if (m === 1) return `${n}px`
    if (m === -1) return `${n}py`
  }

  if (l === 2) {
    if (m === 0) return `${n}dz²`
    if (m === 1) return `${n}dxz`
    if (m === -1) return `${n}dyz`
    if (m === 2) return `${n}dxy`
    if (m === -2) return `${n}dx²-y²`
  }

  return `${n}${letter} (m=${m})`
}
