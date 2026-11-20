/**
 * Physics Performance Benchmarks
 *
 * Measures execution time of critical CPU-side physics math functions.
 * These functions run per-frame and directly impact frame rate.
 *
 * Run: pnpm exec vitest bench --run src/tests/lib/physics/physicsPerformance.bench
 *
 * @module tests/lib/physics/physicsPerformance.bench
 */

import { describe } from 'vitest'

import { complexMatMul, complexMatZero } from '@/lib/physics/openQuantum/complexMatrix'
import { applyPropagator } from '@/lib/physics/openQuantum/propagator'
import type { DensityMatrix } from '@/lib/physics/openQuantum/types'
import { computeHydrogenRadialNormND } from '@/rendering/webgpu/renderers/uniformPackingHydrogenMath'
import { benchmark } from '@/tests/benchmark'

// ── Open Quantum: Matrix-Vector Multiply (per-frame hot path) ──

describe('Open Quantum Propagator', () => {
  for (const K of [8, 14]) {
    const N = K * K
    const propagator = complexMatZero(N)
    const result = complexMatZero(N)
    // Conjugation by the discrete Fourier transform preserves trace and positivity.
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        const phase =
          ((2 * Math.PI) / K) * (Math.floor(row / K) * Math.floor(col / K) - (row % K) * (col % K))
        propagator.real[row * N + col] = Math.cos(phase) / K
        propagator.imag[row * N + col] = Math.sin(phase) / K
      }
    }
    const rho: DensityMatrix = { K, elements: new Float64Array(2 * N) }
    rho.elements[0] = 1

    benchmark(`complexMatMul ${N}×${N} (K=${K} basis)`, () => {
      complexMatMul(propagator, propagator, result, N)
    })
    benchmark(`applyPropagator (K=${K}, mat-vec)`, () => {
      applyPropagator(propagator, rho)
    })
  }
})

// ── Hydrogen Normalization (per-sample in inline path, per-frame in uniform packing) ──

describe('Hydrogen Radial Normalization', () => {
  benchmark('computeHydrogenRadialNormND (n=1,l=0,3D)', () => {
    computeHydrogenRadialNormND(0, 0.0, 1.0, 1.0)
  })

  benchmark('computeHydrogenRadialNormND (n=7,l=6,11D)', () => {
    // nr=0, lambda=6+(11-3)/2=10, nEff=0+10+1=11
    computeHydrogenRadialNormND(0, 10.0, 11.0, 1.0)
  })

  // Simulate per-frame cost: compute norms for all hydrogen states in a typical session
  benchmark('hydrogen norm computation (batch of 100)', () => {
    for (let i = 0; i < 100; i++) {
      const n = (i % 7) + 1
      const l = i % n
      const dim = 3 + (i % 9)
      const lambda = l + (dim - 3) / 2
      const nr = n - l - 1
      const nEff = nr + lambda + 1
      computeHydrogenRadialNormND(nr, lambda, nEff, 1.0)
    }
  })
})
