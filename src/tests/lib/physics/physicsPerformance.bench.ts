/**
 * Physics Performance Benchmarks
 *
 * Measures execution time of critical CPU-side physics math functions.
 * These functions run per-frame and directly impact frame rate.
 *
 * Run: npx vitest bench src/tests/lib/physics/physicsPerformance.bench.ts
 *
 * @module tests/lib/physics/physicsPerformance.bench
 */

import { bench, describe } from 'vitest'

import { complexMatMul, complexMatZero } from '@/lib/physics/openQuantum/complexMatrix'
import { applyPropagator } from '@/lib/physics/openQuantum/propagator'
import type { DensityMatrix } from '@/lib/physics/openQuantum/types'
import { computeHydrogenRadialNormND } from '@/rendering/webgpu/renderers/uniformPackingHydrogenMath'

// ── Open Quantum: Matrix-Vector Multiply (per-frame hot path) ──

describe('Open Quantum Propagator', () => {
  // K=8 hydrogen basis → N=64 propagator dimension
  const K = 8
  const N = K * K

  const propagator = complexMatZero(N)
  const vecMat = complexMatZero(N)
  const result = complexMatZero(N)

  // Fill with representative data
  for (let i = 0; i < N * N; i++) {
    propagator.real[i] = Math.random() * 0.01
    propagator.imag[i] = Math.random() * 0.01
  }
  for (let i = 0; i < N; i++) {
    propagator.real[i * N + i] = (propagator.real[i * N + i] ?? 0) + 1.0
  }
  // Set up vecMat as single column
  for (let i = 0; i < N; i++) {
    vecMat.real[i * N] = Math.random()
    vecMat.imag[i * N] = Math.random()
  }

  bench('complexMatMul 64×64 (K=8 basis)', () => {
    complexMatMul(propagator, vecMat, result, N)
  })

  // K=14 hydrogen basis → N=196
  const K14 = 14
  const N14 = K14 * K14

  const prop14 = complexMatZero(N14)
  const vec14 = complexMatZero(N14)
  const res14 = complexMatZero(N14)

  for (let i = 0; i < N14 * N14; i++) {
    prop14.real[i] = Math.random() * 0.001
    prop14.imag[i] = Math.random() * 0.001
  }
  for (let i = 0; i < N14; i++) {
    prop14.real[i * N14 + i] = (prop14.real[i * N14 + i] ?? 0) + 1.0
    vec14.real[i * N14] = Math.random()
    vec14.imag[i * N14] = Math.random()
  }

  bench('complexMatMul 196×196 (K=14 basis)', () => {
    complexMatMul(prop14, vec14, res14, N14)
  })

  // Actual per-frame operation: mat-vec multiply (applyPropagator)
  const rho8: DensityMatrix = {
    K: 8,
    elements: new Float64Array(2 * 64),
  }
  for (let i = 0; i < 64; i++) {
    rho8.elements[2 * i] = Math.random() * 0.01
    rho8.elements[2 * i + 1] = Math.random() * 0.01
  }
  rho8.elements[0] = 0.5
  rho8.elements[2 * 9] = 0.5 // trace = 1

  bench('applyPropagator (K=8, mat-vec)', () => {
    applyPropagator(propagator, rho8)
  })

  const rho14: DensityMatrix = {
    K: 14,
    elements: new Float64Array(2 * 196),
  }
  for (let i = 0; i < 196; i++) {
    rho14.elements[2 * i] = Math.random() * 0.001
    rho14.elements[2 * i + 1] = Math.random() * 0.001
  }
  rho14.elements[0] = 0.5
  rho14.elements[2 * 15] = 0.5

  bench('applyPropagator (K=14, mat-vec)', () => {
    applyPropagator(prop14, rho14)
  })
})

// ── Hydrogen Normalization (per-sample in inline path, per-frame in uniform packing) ──

describe('Hydrogen Radial Normalization', () => {
  bench('computeHydrogenRadialNormND (n=1,l=0,3D)', () => {
    computeHydrogenRadialNormND(0, 0.0, 1.0, 1.0)
  })

  bench('computeHydrogenRadialNormND (n=7,l=6,11D)', () => {
    // nr=0, lambda=6+(11-3)/2=10, nEff=0+10+1=11
    computeHydrogenRadialNormND(0, 10.0, 11.0, 1.0)
  })

  // Simulate per-frame cost: compute norms for all hydrogen states in a typical session
  bench('hydrogen norm computation (batch of 100)', () => {
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
