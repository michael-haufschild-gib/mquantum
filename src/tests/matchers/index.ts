/**
 * Custom Vitest matchers for domain-specific assertions.
 *
 * Provides semantic assertions for WGSL shaders, quantum physics matrices,
 * and n-dimensional vectors. Registered globally in test setup.
 *
 * @module tests/matchers
 */

import type { ExpectationResult } from '@vitest/expect'
import { expect } from 'vitest'

// ============================================================================
// WGSL Shader Matchers
// ============================================================================

/** Strips single-line and multi-line comments from WGSL source. */
function stripComments(wgsl: string): string {
  return wgsl.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

function toBeValidWGSL(
  received: string,
  shaderType: 'fragment' | 'vertex' | 'compute' = 'fragment'
): ExpectationResult {
  const failures: string[] = []
  const code = stripComments(received)

  if (received.length < 50) {
    failures.push(`Shader is suspiciously short (${received.length} chars)`)
  }

  if (!received.match(/fn\s+\w+\s*\(/)) {
    failures.push('Missing WGSL function declaration (fn keyword)')
  }

  // GLSL contamination checks
  if (code.includes('void main()')) failures.push('Contains GLSL void main()')
  if (code.includes('gl_FragColor')) failures.push('Contains GLSL gl_FragColor')
  if (code.match(/\bprecision\s+(highp|mediump|lowp)/))
    failures.push('Contains GLSL precision qualifier')
  if (code.match(/\bvarying\s+(highp|mediump|lowp|vec|mat|float|int)/))
    failures.push('Contains GLSL varying')
  if (code.match(/\battribute\s+(highp|mediump|lowp|vec|mat|float|int)/))
    failures.push('Contains GLSL attribute')
  if (code.match(/\btexture2D\s*\(/)) failures.push('Contains GLSL texture2D()')

  // Two-arg atan (should be atan2 in WGSL)
  const atanMatches = code.match(/\batan\s*\([^,)]+,[^)]+\)/g)
  if (atanMatches) {
    const wrongAtanCalls = atanMatches.filter((m) => !m.includes('atan2'))
    if (wrongAtanCalls.length > 0) failures.push('Uses GLSL atan(y,x) instead of WGSL atan2(y,x)')
  }

  // Bind group decorators for uniform vars
  if (
    code.includes('var<uniform>') &&
    !received.match(/@group\s*\(\s*\d+\s*\)\s*@binding\s*\(\s*\d+\s*\)/)
  ) {
    failures.push('Has var<uniform> without @group/@binding decorators')
  }

  // Entry point check
  const entryPointMap = { fragment: '@fragment', vertex: '@vertex', compute: '@compute' }
  const required = entryPointMap[shaderType]
  if (!received.includes(required)) {
    failures.push(`Missing ${required} entry point decorator`)
  }

  return {
    pass: failures.length === 0,
    message: () =>
      failures.length === 0
        ? `Expected WGSL shader to be invalid, but it passed all checks`
        : `Invalid WGSL (${shaderType}):\n${failures.map((f) => `  - ${f}`).join('\n')}`,
  }
}

function toHaveNoGLSLLeakage(received: string): ExpectationResult {
  const code = stripComments(received)
  const failures: string[] = []

  if (code.includes('void main()')) failures.push('GLSL void main()')
  if (code.includes('gl_FragColor')) failures.push('GLSL gl_FragColor')
  if (code.match(/\btexture2D\s*\(/)) failures.push('GLSL texture2D()')

  const atanMatches = code.match(/\batan\s*\([^,)]+,[^)]+\)/g)
  if (atanMatches) {
    const wrong = atanMatches.filter((m) => !m.includes('atan2'))
    if (wrong.length > 0) failures.push(`GLSL atan(y,x): ${wrong.join(', ')}`)
  }

  return {
    pass: failures.length === 0,
    message: () =>
      failures.length === 0
        ? 'Expected GLSL contamination, but shader is clean WGSL'
        : `GLSL leakage detected:\n${failures.map((f) => `  - ${f}`).join('\n')}`,
  }
}

// ============================================================================
// Quantum Physics Matchers
// ============================================================================

interface DensityMatrix {
  K: number
  elements: Float64Array
}

function toHaveUnitTrace(received: DensityMatrix, tolerance = 1e-6): ExpectationResult {
  let trace = 0
  let traceIm = 0
  for (let k = 0; k < received.K; k++) {
    const idx = 2 * (k * received.K + k)
    trace += received.elements[idx]!
    traceIm += received.elements[idx + 1]!
  }

  const delta = Math.hypot(trace - 1, traceIm)
  const pass = delta <= tolerance
  return {
    pass,
    message: () =>
      pass
        ? `Expected density matrix NOT to have unit trace, but Tr(rho) = ${trace} + ${traceIm}i`
        : `Expected Tr(rho) = 1.0, got ${trace} + ${traceIm}i (delta: ${delta}, tolerance: ${tolerance})`,
  }
}

function toBeHermitian(received: DensityMatrix, tolerance = 1e-10): ExpectationResult {
  const violations: string[] = []

  for (let k = 0; k < received.K; k++) {
    const diag = 2 * (k * received.K + k)
    if (
      !Number.isFinite(received.elements[diag]) ||
      !(2 * Math.abs(received.elements[diag + 1]!) <= tolerance)
    ) {
      violations.push(`Invalid diagonal entry at ${k}`)
    }
    for (let l = k + 1; l < received.K; l++) {
      const idx_kl = 2 * (k * received.K + l)
      const idx_lk = 2 * (l * received.K + k)
      const realDiff = Math.abs(received.elements[idx_kl]! - received.elements[idx_lk]!)
      const imagDiff = Math.abs(received.elements[idx_kl + 1]! + received.elements[idx_lk + 1]!)

      if (!(Math.hypot(realDiff, imagDiff) <= tolerance)) {
        violations.push(`Off-diagonal mismatch at [${k},${l}]: (${realDiff}, ${imagDiff})`)
      }
    }
  }

  return {
    pass: violations.length === 0,
    message: () =>
      violations.length === 0
        ? 'Expected non-Hermitian matrix, but all symmetry conditions hold'
        : `Matrix is not Hermitian (tolerance ${tolerance}):\n${violations
            .slice(0, 5)
            .map((v) => `  - ${v}`)
            .join(
              '\n'
            )}${violations.length > 5 ? `\n  ... and ${violations.length - 5} more` : ''}`,
  }
}

// ============================================================================
// N-Dimensional Vector/Matrix Matchers
// ============================================================================

function toBeNormalizedVector(
  received: number[] | Float32Array | Float64Array,
  tolerance = 1e-6
): ExpectationResult {
  let sumSq = 0
  for (let i = 0; i < received.length; i++) {
    sumSq += received[i]! * received[i]!
  }
  const magnitude = Math.sqrt(sumSq)
  const pass = Math.abs(magnitude - 1.0) < tolerance

  return {
    pass,
    message: () =>
      pass
        ? `Expected vector NOT to be normalized, but |v| = ${magnitude}`
        : `Expected |v| = 1.0, got ${magnitude} (delta: ${Math.abs(magnitude - 1.0)})`,
  }
}

function toBeOrthogonalTo(
  received: number[] | Float32Array | Float64Array,
  other: number[] | Float32Array | Float64Array,
  tolerance = 1e-6
): ExpectationResult {
  if (received.length !== other.length) {
    return {
      pass: false,
      message: () => `Vectors have different dimensions: ${received.length} vs ${other.length}`,
    }
  }

  let dot = 0
  for (let i = 0; i < received.length; i++) {
    dot += received[i]! * other[i]!
  }

  const pass = Math.abs(dot) < tolerance
  return {
    pass,
    message: () =>
      pass
        ? `Expected vectors NOT to be orthogonal, but dot product = ${dot}`
        : `Expected orthogonal vectors (dot = 0), got dot = ${dot}`,
  }
}

// ============================================================================
// Registration
// ============================================================================

expect.extend({
  toBeValidWGSL,
  toHaveNoGLSLLeakage,
  toHaveUnitTrace,
  toBeHermitian,
  toBeNormalizedVector,
  toBeOrthogonalTo,
})

declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>> {
    toBeValidWGSL(shaderType?: 'fragment' | 'vertex' | 'compute'): R
    toHaveNoGLSLLeakage(): R
    toHaveUnitTrace(tolerance?: number): R
    toBeHermitian(tolerance?: number): R
    toBeNormalizedVector(tolerance?: number): R
    toBeOrthogonalTo(other: number[] | Float32Array | Float64Array, tolerance?: number): R
  }
}
