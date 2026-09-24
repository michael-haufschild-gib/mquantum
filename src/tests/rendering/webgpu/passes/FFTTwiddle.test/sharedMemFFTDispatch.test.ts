/**
 * TDSE / BEC / Pauli used a one-pencil-per-workgroup shared-memory FFT and
 * dispatched totalSites / N workgroups along x. The device keeps the default
 * 65535-per-dimension limit, so default high-D grids (TDSE/BEC 9D 4⁹, Pauli
 * 7D 8⁷, 9D–11D) produced an invalid dispatch and the mode never stepped.
 * They now compose the multi-pencil kernel (max(1, 128/N) pencils per
 * workgroup) and dispatch `sharedMemFFTWorkgroupCount`.
 *
 * The CPU emulation below transliterates the multi-pencil WGSL kernel
 * (load → stage 0 → stage 1 → table stages → store, barrier-separated) and
 * checks every axis of a mixed-size lattice against a direct DFT.
 */
import { describe, expect, it } from 'vitest'

import { computeDefaultPow2GridPerDim, sanitizePowerOfTwoGridSizes } from '@/lib/math/ndArray'
import {
  MAX_DISPATCH_PER_DIM,
  MAX_LINEAR_DISPATCH_SITES,
  packFFTAxisUniforms,
  sharedMemFFTWorkgroupCount,
} from '@/rendering/webgpu/passes/computePassUtils'
import { buildFFTTwiddleTable } from '@/rendering/webgpu/passes/FFTTwiddle'
import { composePauliFftSharedMemShader } from '@/rendering/webgpu/passes/PauliComputePassSetup'
import { composeTdseFftSharedMemShader } from '@/rendering/webgpu/passes/TDSEComputePassSetup'

const TDSE_BUDGET = 262144

function pauliDefaultGrid(dim: number): number[] {
  const n = dim <= 3 ? 64 : dim <= 4 ? 32 : dim <= 7 ? 8 : 4
  const raw = { latticeDim: dim, gridSize: Array.from({ length: dim }, () => n) }
  return sanitizePowerOfTwoGridSizes(raw, {
    maxTotalSites: MAX_LINEAR_DISPATCH_SITES,
    maxDimensions: 11,
  }).gridSize
}

describe('shared-memory FFT dispatch size', () => {
  it('packs 128/N pencils per workgroup', () => {
    expect(sharedMemFFTWorkgroupCount(262144, 4)).toBe(2048)
    expect(sharedMemFFTWorkgroupCount(128 ** 3, 128)).toBe(16384)
    expect(sharedMemFFTWorkgroupCount(8 * 16, 8)).toBe(1) // partial last workgroup
  })

  it('stays within the per-dimension dispatch limit for every default grid', () => {
    let oldMaxPencils = 0
    for (let dim = 3; dim <= 11; dim++) {
      const tdseN = computeDefaultPow2GridPerDim(dim, TDSE_BUDGET)
      const grids = [Array.from({ length: dim }, () => tdseN), pauliDefaultGrid(dim)]
      for (const grid of grids) {
        const total = grid.reduce((a, b) => a * b, 1)
        for (const n of grid) {
          expect(sharedMemFFTWorkgroupCount(total, n)).toBeLessThanOrEqual(MAX_DISPATCH_PER_DIM)
          oldMaxPencils = Math.max(oldMaxPencils, total / n)
        }
      }
    }
    // One pencil per workgroup exceeded the limit (non-vacuous).
    expect(oldMaxPencils).toBeGreaterThan(MAX_DISPATCH_PER_DIM)
  })

  it('TDSE and Pauli compose the multi-pencil kernel', () => {
    for (const wgsl of [composeTdseFftSharedMemShader(), composePauliFftSharedMemShader()]) {
      expect(wgsl).toContain('fn pencils_per_workgroup(N: u32) -> u32')
      expect(wgsl).toContain('let pencilStart = wgid.x * pencilsPerWG;')
    }
  })
})

// ---------------------------------------------------------------------------
// CPU emulation of the multi-pencil WGSL kernel
// ---------------------------------------------------------------------------

type C = [number, number]
const f = Math.fround

function emulateAxis(buf: C[], u: DataView, tw: Float32Array, workgroups: number): void {
  const N = u.getUint32(0, true)
  const dir = u.getFloat32(4, true)
  const totalElements = u.getUint32(8, true)
  const axisStride = u.getUint32(12, true)
  const log2N = u.getUint32(16, true)
  const halfN = N >> 1
  const pencilCount = totalElements / N
  const ppw = Math.max(1, Math.floor(128 / N))
  const packed = ppw * N
  const base = (pencilId: number) =>
    Math.floor(pencilId / axisStride) * axisStride * N + (pencilId % axisStride)
  const cmul = (a: C, b: C): C => [f(a[0] * b[0] - a[1] * b[1]), f(a[0] * b[1] + a[1] * b[0])]
  const add = (a: C, b: C): C => [f(a[0] + b[0]), f(a[1] + b[1])]
  const sub = (a: C, b: C): C => [f(a[0] - b[0]), f(a[1] - b[1])]

  for (let wg = 0; wg < workgroups; wg++) {
    const smem: C[] = Array.from({ length: 256 }, () => [0, 0])
    const start = wg * ppw
    for (let i = 0; i < packed; i++) {
      const pid = start + Math.floor(i / N)
      smem[i] = pid < pencilCount ? buf[base(pid) + (i % N) * axisStride]! : [0, 0]
    }
    const butterflies = ppw * halfN
    if (log2N > 0) {
      for (let t = 0; t < Math.min(64, butterflies); t++) {
        const p = Math.floor(t / halfN)
        const lt = t - p * halfN
        const b = p * N
        const v0 = smem[b + lt]!
        const v1 = smem[b + lt + halfN]!
        smem[128 + b + 2 * lt] = add(v0, v1)
        smem[128 + b + 2 * lt + 1] = sub(v0, v1)
      }
    }
    if (log2N > 1) {
      for (let t = 0; t < Math.min(64, butterflies); t++) {
        const p = Math.floor(t / halfN)
        const lt = t - p * halfN
        const b = p * N
        const j = lt & 1
        const o = ((lt & ~1) << 1) + j
        const v0 = smem[128 + b + lt]!
        const v1 = smem[128 + b + lt + halfN]!
        const t1: C = j === 1 ? [f(dir * v1[1]), f(-dir * v1[0])] : v1
        smem[b + o] = add(v0, t1)
        smem[b + o + 2] = sub(v0, t1)
      }
    }
    for (let s = 2; s < log2N; s++) {
      const hs = 1 << s
      const src = (s & 1) << 7
      const dst = ((s + 1) & 1) << 7
      const stride = 1 << (7 - s - 1)
      for (let t = 0; t < Math.min(64, butterflies); t++) {
        const p = Math.floor(t / halfN)
        const lt = t - p * halfN
        const b = p * N
        const j = lt & (hs - 1)
        const o = ((lt & ~(hs - 1)) << 1) + j
        const v0 = smem[src + b + lt]!
        const v1 = smem[src + b + lt + halfN]!
        const k = j * stride
        const w: C = [tw[2 * k]!, f(dir * tw[2 * k + 1]!)]
        const t1 = cmul(w, v1)
        smem[dst + b + o] = add(v0, t1)
        smem[dst + b + o + hs] = sub(v0, t1)
      }
    }
    const fin = (log2N & 1) << 7
    for (let i = 0; i < packed; i++) {
      const pid = start + Math.floor(i / N)
      if (pid < pencilCount) buf[base(pid) + (i % N) * axisStride] = smem[fin + i]!
    }
  }
}

describe('multi-pencil shared-memory FFT (CPU emulation)', () => {
  it('matches a direct DFT along every axis, forward and inverse', () => {
    const gridSize = [4, 8, 2, 16]
    const latticeDim = gridSize.length
    const total = gridSize.reduce((a, b) => a * b, 1)
    const uniforms = packFFTAxisUniforms({ latticeDim, gridSize }, total)
    const tw = buildFFTTwiddleTable()
    let seed = 12345
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1
    const input: C[] = Array.from({ length: total }, () => [f(rnd()), f(rnd())])

    // Slots: forward axes latticeDim-1 … 0, then inverse axes in the same order.
    let slot = 0
    for (const dirSign of [1, -1]) {
      let axisStride = 1
      for (let d = latticeDim - 1; d >= 0; d--, slot++) {
        const N = gridSize[d]!
        const view = new DataView(uniforms, slot * 32, 32)
        expect(view.getFloat32(4, true)).toBe(dirSign)
        const buf = input.map((c) => [...c] as C)
        emulateAxis(buf, view, tw, sharedMemFFTWorkgroupCount(total, N))

        let maxErr = 0
        for (let idx = 0; idx < total; idx++) {
          const k = Math.floor(idx / axisStride) % N
          const rowBase = idx - k * axisStride
          let re = 0
          let im = 0
          for (let n = 0; n < N; n++) {
            const [xr, xi] = input[rowBase + n * axisStride]!
            const a = (-dirSign * 2 * Math.PI * k * n) / N
            re += xr * Math.cos(a) - xi * Math.sin(a)
            im += xr * Math.sin(a) + xi * Math.cos(a)
          }
          maxErr = Math.max(maxErr, Math.abs(buf[idx]![0] - re), Math.abs(buf[idx]![1] - im))
        }
        expect(maxErr).toBeLessThan(1e-5)
        axisStride *= N
      }
    }
  })
})
