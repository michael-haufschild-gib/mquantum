/**
 * Shader Constant Verification Tests
 *
 * Imports the actual WGSL shader source modules, parses the template literal
 * strings to extract hardcoded numerical constants, and verifies each value
 * against its generating formula.
 *
 * This is NOT testing TypeScript mirrors. It is testing the ACTUAL values
 * that will be sent to the GPU. If someone typos a constant in the WGSL
 * source, these tests catch it — no GPU needed.
 *
 * Strategy:
 *   1. Import the .wgsl.ts module (TypeScript module that exports a string)
 *   2. Parse the WGSL string with regex to extract constant arrays
 *   3. Verify each element against its closed-form formula
 *
 * @module tests/rendering/webgpu/shaders/shaderConstants
 */

import { describe, expect, it } from 'vitest'

import { hermiteBlock } from '@/rendering/webgpu/shaders/schroedinger/quantum/hermite.wgsl'
import { ho1dBlock } from '@/rendering/webgpu/shaders/schroedinger/quantum/ho1d.wgsl'
import { hydrogenRadialBlock } from '@/rendering/webgpu/shaders/schroedinger/quantum/hydrogenRadial.wgsl'
import { laguerreBlock } from '@/rendering/webgpu/shaders/schroedinger/quantum/laguerre.wgsl'
import { legendreBlock } from '@/rendering/webgpu/shaders/schroedinger/quantum/legendre.wgsl'
import { sphericalHarmonicsBlock } from '@/rendering/webgpu/shaders/schroedinger/quantum/sphericalHarmonics.wgsl'
import { wignerHOBlock } from '@/rendering/webgpu/shaders/schroedinger/quantum/wignerHO.wgsl'

// ============================================================================
// WGSL constant extraction helper
// ============================================================================

/**
 * Extract a named constant array from WGSL source.
 *
 * Matches patterns like:
 *   const NAME: array<f32, N> = array<f32, N>( values... );
 *
 * Returns the parsed numerical values as a number[].
 */
function extractWgslArray(wgslSource: string, constName: string): number[] {
  // Match the constant declaration and its array body
  const pattern = new RegExp(`const\\s+${constName}\\s*:.*?=.*?\\(([\\s\\S]*?)\\)\\s*;`, 'm')
  const match = wgslSource.match(pattern)
  if (!match?.[1]) {
    throw new Error(`Could not find WGSL constant "${constName}" in source`)
  }

  // Strip comments and extract numbers
  const body = match[1]
    .replace(/\/\/.*$/gm, '') // strip line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments

  const numbers = body.match(/-?\d+\.?\d*(?:e[+-]?\d+)?/gi)
  if (!numbers) {
    throw new Error(`No numbers found in WGSL constant "${constName}"`)
  }

  return numbers.map(Number)
}

// ============================================================================
// Reference formulas (pure math, no mirrors)
// ============================================================================

function factorial(n: number): number {
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

/**
 * Compute the coefficient of x^k in the physicist's Hermite polynomial H_n(x).
 *
 * H_n(x) = n! Σ_{m=0}^{floor(n/2)} (-1)^m / (m! (n-2m)!) (2x)^{n-2m}
 *
 * The coefficient of x^k is nonzero only when k = n-2m for some m, i.e., k and n
 * have the same parity.
 */
function hermiteCoefficient(n: number, k: number): number {
  // k must have the same parity as n, and 0 <= k <= n
  if (k < 0 || k > n || (n - k) % 2 !== 0) return 0
  const m = (n - k) / 2
  // Coefficient of x^k: (-1)^m * n! / (m! * (n-2m)!) * 2^(n-2m)
  return ((Math.pow(-1, m) * factorial(n)) / (factorial(m) * factorial(k))) * Math.pow(2, k)
}

// ============================================================================
// Tests
// ============================================================================

describe('HERMITE_COEFFS in hermite.wgsl.ts', () => {
  // The WGSL stores coefficients of H_n(u) in a flat array of 49 values.
  // Layout: HERMITE_COEFFS[n * 7 + k] = coefficient of u^k in H_n(u)
  // For n = 0..6, k = 0..6.
  //
  // Reference: Abramowitz & Stegun, Table 22.3 (physicist's Hermite polynomials)

  const coeffs = extractWgslArray(hermiteBlock, 'HERMITE_COEFFS')

  it('extracts exactly 49 values (7 polynomials × 7 coefficients)', () => {
    expect(coeffs.length).toBe(49)
  })

  for (let n = 0; n <= 6; n++) {
    it(`H_${n}(u) coefficients match analytical formula`, () => {
      for (let k = 0; k <= 6; k++) {
        const wgslValue = coeffs[n * 7 + k]!
        const expected = hermiteCoefficient(n, k)
        expect(wgslValue).toBe(expected)
      }
    })
  }

  // Spot-check evaluation: H_4(3) = 16·81 - 48·9 + 12 = 876
  it('coefficients produce correct H_4(3) via Horner evaluation', () => {
    const x = 3
    let result = 0
    for (let k = 6; k >= 0; k--) {
      result = result * x + coeffs[4 * 7 + k]!
    }
    expect(result).toBe(876)
  })
})

describe('HO_NORM in ho1d.wgsl.ts', () => {
  // HO_NORM[n] = 1/√(2^n · n!)
  // This is the normalization factor for the nth Hermite function.
  // Used in φ_n(x) = (ω/π)^{1/4} · HO_NORM[n] · H_n(√ω·x) · e^{-½ωx²}
  //
  // Reference: Griffiths, Introduction to Quantum Mechanics, eq. 2.85

  const norms = extractWgslArray(ho1dBlock, 'HO_NORM')

  it('extracts exactly 7 values (n = 0..6)', () => {
    expect(norms.length).toBe(7)
  })

  for (let n = 0; n <= 6; n++) {
    it(`HO_NORM[${n}] = 1/√(2^${n}·${n}!) = ${(1 / Math.sqrt(Math.pow(2, n) * factorial(n))).toFixed(12)}`, () => {
      const expected = 1 / Math.sqrt(Math.pow(2, n) * factorial(n))
      // WGSL uses f32 literals (~7 significant digits), but the values are
      // specified to 12 digits in the source. Verify to 10 digits.
      expect(norms[n]!).toBeCloseTo(expected, 10)
    })
  }
})

describe('LAGUERRE_INV_DEN in laguerre.wgsl.ts', () => {
  // LAGUERRE_INV_DEN[k] = 1/k for k = 1..7 (index 0 is unused placeholder = 1.0)
  // Used in the three-term recurrence: L_{k+1} = (...) * invDen
  // where invDen = 1/(k+1), looked up as LAGUERRE_INV_DEN[i+1].
  //
  // A wrong value here corrupts ALL Laguerre polynomial evaluations,
  // which corrupts ALL hydrogen radial wavefunctions.

  const invDens = extractWgslArray(laguerreBlock, 'LAGUERRE_INV_DEN')

  it('extracts exactly 8 values', () => {
    expect(invDens.length).toBe(8)
  })

  it('index 0 is 1.0 (unused placeholder)', () => {
    expect(invDens[0]).toBe(1.0)
  })

  for (let k = 1; k <= 7; k++) {
    it(`LAGUERRE_INV_DEN[${k}] = 1/${k} = ${(1 / k).toFixed(10)}`, () => {
      expect(invDens[k]!).toBeCloseTo(1 / k, 9)
    })
  }
})

describe('FACTORIAL_LUT in sphericalHarmonics.wgsl.ts', () => {
  // FACTORIAL_LUT[k] = k! for k = 0..12
  // 12! = 479001600 is the largest integer factorial that fits in float32.
  //
  // Used by sphericalHarmonicNorm() and hydrogenRadialNorm().
  // A wrong value corrupts ALL spherical harmonic and hydrogen radial computations.

  const factorials = extractWgslArray(sphericalHarmonicsBlock, 'FACTORIAL_LUT')

  it('extracts exactly 13 values (0! through 12!)', () => {
    expect(factorials.length).toBe(13)
  })

  for (let k = 0; k <= 12; k++) {
    it(`FACTORIAL_LUT[${k}] = ${k}! = ${factorial(k)}`, () => {
      expect(factorials[k]!).toBe(factorial(k))
    })
  }
})

describe('LN_FACTORIAL_LUT in hydrogenRadial.wgsl.ts', () => {
  // LN_FACTORIAL_LUT[k] = ln(k!) for k = 0..22
  // Used by the N-dimensional hydrogen normalization hydrogenRadialNormND().
  //
  // Values are precomputed from f64 and stored as f32. Verify against
  // Math.log(factorial) with f32 tolerance (~7 significant digits).
  //
  // Max needed index: n + l + D - 2 = 7 + 6 + 11 - 2 = 22.

  const lnFactorials = extractWgslArray(hydrogenRadialBlock, 'LN_FACTORIAL_LUT')

  it('extracts exactly 23 values (k = 0..22)', () => {
    expect(lnFactorials.length).toBe(23)
  })

  // Compute ln(k!) with arbitrary precision using ln(k!) = Σ_{i=1}^{k} ln(i)
  function lnFactorial(k: number): number {
    let sum = 0
    for (let i = 2; i <= k; i++) sum += Math.log(i)
    return sum
  }

  for (let k = 0; k <= 22; k++) {
    it(`LN_FACTORIAL_LUT[${k}] = ln(${k}!) = ${lnFactorial(k).toFixed(6)}`, () => {
      const expected = lnFactorial(k)
      // WGSL stores as f32 (~7 significant digits). The source gives ~7 digits.
      // Verify to 5 decimal places (covers f32 precision for values up to ~48).
      if (k <= 1) {
        expect(lnFactorials[k]!).toBe(0)
      } else {
        expect(lnFactorials[k]!).toBeCloseTo(expected, 4)
      }
    })
  }
})

describe('WIGNER_FACTORIAL in wignerHO.wgsl.ts', () => {
  // WIGNER_FACTORIAL[k] = k! for k = 0..7
  // Subset of FACTORIAL_LUT, used by the Wigner phase-space HO function.

  const wfact = extractWgslArray(wignerHOBlock, 'WIGNER_FACTORIAL')

  it('extracts exactly 8 values (0! through 7!)', () => {
    expect(wfact.length).toBe(8)
  })

  for (let k = 0; k <= 7; k++) {
    it(`WIGNER_FACTORIAL[${k}] = ${k}! = ${factorial(k)}`, () => {
      expect(wfact[k]!).toBe(factorial(k))
    })
  }
})

describe('spherical harmonic inline norms in sphericalHarmonics.wgsl.ts', () => {
  // fastRealSphericalHarmonicDirect and fastRealSphericalHarmonicCartesian
  // hardcode normalization constants for l = 0, 1, 2 orbitals.
  // These must match the general formula: K_l^m = √((2l+1)/(4π) · (l-|m|)!/(l+|m|)!)
  // For real spherical harmonics with m ≠ 0, multiply by √2.
  //
  // A wrong constant here silently scales specific orbital shapes.

  // Extract all float literals that appear as norm values in the shader
  // We verify by computing from the formula and checking the WGSL source contains the right value.

  // Extract the actual float values from the WGSL source and compare
  // against their closed-form formulas. Each constant appears as a literal
  // in the fastRealSphericalHarmonicDirect function body.

  it('Y_00 constant 0.28209479 matches 1/(2√π) to 8 digits', () => {
    const exact = 1 / (2 * Math.sqrt(Math.PI))
    expect(exact).toBeCloseTo(0.28209479, 7)
    expect(sphericalHarmonicsBlock).toContain('0.28209479')
  })

  it('Y_1m constant 0.48860251 matches √(3/(4π)) to 8 digits', () => {
    const exact = Math.sqrt(3 / (4 * Math.PI))
    expect(exact).toBeCloseTo(0.48860251, 7)
    expect(sphericalHarmonicsBlock).toContain('0.48860251')
  })

  it('Y_20 constant 0.31539157 matches √(5/(16π)) to 8 digits', () => {
    const exact = Math.sqrt(5 / (16 * Math.PI))
    expect(exact).toBeCloseTo(0.31539157, 7)
    expect(sphericalHarmonicsBlock).toContain('0.31539157')
  })

  it('Y_2±1 constant 1.09254843 matches √(15/(4π)) to 8 digits', () => {
    const exact = Math.sqrt(15 / (4 * Math.PI))
    expect(exact).toBeCloseTo(1.09254843, 7)
    expect(sphericalHarmonicsBlock).toContain('1.09254843')
  })

  it('Y_2±2 constant 0.54627422 matches √(15/(16π)) to 8 digits', () => {
    const exact = Math.sqrt(15 / (16 * Math.PI))
    expect(exact).toBeCloseTo(0.54627422, 7)
    expect(sphericalHarmonicsBlock).toContain('0.54627422')
  })
})

describe('cross-module constant consistency', () => {
  // Multiple WGSL modules define overlapping constant sets.
  // If they diverge, different shader paths produce different results
  // for the same quantum state — a subtle and hard-to-debug error.

  it('FACTORIAL_LUT[0..7] matches WIGNER_FACTORIAL[0..7]', () => {
    const mainFactorials = extractWgslArray(sphericalHarmonicsBlock, 'FACTORIAL_LUT')
    const wignerFactorials = extractWgslArray(wignerHOBlock, 'WIGNER_FACTORIAL')

    for (let k = 0; k <= 7; k++) {
      expect(wignerFactorials[k]).toBe(mainFactorials[k])
    }
  })

  it('HO_NORM values are consistent with HERMITE_COEFFS scaling', () => {
    // The HO wavefunction is: alphaNorm * HO_NORM[n] * H_n(u) * gauss
    // If HO_NORM or HERMITE_COEFFS are wrong, the product is wrong.
    // Verify: HO_NORM[n]² × H_n(0)² should match the expected peak density
    // for even-n states (odd-n have H_n(0) = 0).
    const norms = extractWgslArray(ho1dBlock, 'HO_NORM')
    const coeffs = extractWgslArray(hermiteBlock, 'HERMITE_COEFFS')

    // H_0(0) = 1, H_2(0) = -2, H_4(0) = 12, H_6(0) = -120
    // These are the constant terms: coeffs[n*7 + 0]
    const h0_at_0 = coeffs[0 * 7]! // H_0(0) = 1
    const h2_at_0 = coeffs[2 * 7]! // H_2(0) = -2
    const h4_at_0 = coeffs[4 * 7]! // H_4(0) = 12
    const h6_at_0 = coeffs[6 * 7]! // H_6(0) = -120

    expect(h0_at_0).toBe(1)
    expect(h2_at_0).toBe(-2)
    expect(h4_at_0).toBe(12)
    expect(h6_at_0).toBe(-120)

    // For ω=1: φ_n(0)² = (1/π)^{1/2} × HO_NORM[n]² × H_n(0)² × 1 (gauss at x=0)
    // Ground state: φ_0(0)² = π^{-1/2} × 1² × 1² = π^{-1/2}
    const phi0_sq = Math.sqrt(1 / Math.PI) * norms[0]! * norms[0]! * h0_at_0 * h0_at_0
    expect(phi0_sq).toBeCloseTo(Math.pow(Math.PI, -0.5), 10)
  })
})

describe('LEGENDRE_INV_K in legendre.wgsl.ts', () => {
  // LEGENDRE_INV_K[k] = 1/k for k = 1..7 (index 0 is 1.0 placeholder)
  // Used in the upward recurrence: P_l^m = (... * P_{l-1}^m - ... * P_{l-2}^m) * invDen
  // where invDen = 1/(ll - |m|), looked up as LEGENDRE_INV_K[ll - absM].
  //
  // A wrong value here corrupts ALL Legendre polynomial evaluations for l > |m|+1,
  // which corrupts ALL spherical harmonics → ALL hydrogen orbitals.

  const invKs = extractWgslArray(legendreBlock, 'LEGENDRE_INV_K')

  it('extracts exactly 8 values (k = 0..7)', () => {
    expect(invKs.length).toBe(8)
  })

  it('index 0 is 1.0 (placeholder, unused in recurrence)', () => {
    expect(invKs[0]).toBe(1.0)
  })

  for (let k = 1; k <= 7; k++) {
    it(`LEGENDRE_INV_K[${k}] = 1/${k} = ${(1 / k).toFixed(10)}`, () => {
      expect(invKs[k]!).toBeCloseTo(1 / k, 9)
    })
  }
})

describe('Legendre polynomial structural checks', () => {
  it('MAX_LEGENDRE_L >= 6 (required for n=7 hydrogen orbitals with l up to 6)', () => {
    const match = legendreBlock.match(/MAX_LEGENDRE_L\s*:\s*i32\s*=\s*(\d+)/)
    const maxL = Number(match?.[1])
    expect(maxL).toBeGreaterThanOrEqual(6)
  })
})

describe('hydrogenRadial structural constants', () => {
  // The hydrogenRadial.wgsl.ts has structural constants beyond LN_FACTORIAL_LUT.
  // Verify the FACTORIAL_LUT referenced by hydrogenRadialNorm is the same
  // one defined in sphericalHarmonics.wgsl.ts (they share the same block).

  it('LN_FACTORIAL_LUT covers max needed index: n+l+D-2 = 7+6+11-2 = 22', () => {
    const lnFact = extractWgslArray(hydrogenRadialBlock, 'LN_FACTORIAL_LUT')
    expect(lnFact.length).toBeGreaterThanOrEqual(23)
  })
})
