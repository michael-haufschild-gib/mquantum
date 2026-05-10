/**
 * Structural unit test for the curved-space v2 metric block of the TDSE
 * uniform buffer. Drives {@link writeTdseUniforms} directly and inspects
 * the packed 1024-byte ArrayBuffer at:
 *   - index 208 (u32 metricKind)
 *   - index 209 (f32 throatRadius)
 *   - indices 212..227 (v2 metric block: per-kind params + torusPeriod + stage times)
 *
 * Covers:
 *   - all 8 metric kinds map to the correct numeric code at u32[208],
 *   - per-kind param fields are written only when the kind needs them
 *     and are zero otherwise (defensive),
 *   - torus period is written correctly,
 *   - flat metric writes zero to every v2 field,
 *   - RK4 stage times equal [t, t+dt/2, t+dt/2, t+dt] for the given
 *     simTime and dt.
 *
 * Keeps helpers in lockstep with `tdseIslandUniformPack.test.ts` to reuse
 * the device stub + writeBuffer capture pattern.
 *
 * @module tests/rendering/tdseCurvedV2UniformPack
 */

import { describe, expect, it } from 'vitest'

import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { MetricConfig } from '@/lib/physics/tdse/metrics/types'
import { TDSE_UNIFORM_SIZE } from '@/rendering/webgpu/passes/TDSEComputePassResources'
import { writeTdseUniforms } from '@/rendering/webgpu/passes/TDSEComputePassUniforms'

/** Capture the uniform ArrayBuffer that writeTdseUniforms hands to the GPU queue. */
function packAndCapture(
  metric: MetricConfig | undefined,
  opts?: { simTime?: number; dt?: number }
): { u32: Uint32Array; f32: Float32Array; size: number } {
  const base: TdseConfig =
    metric === undefined ? { ...DEFAULT_TDSE_CONFIG } : { ...DEFAULT_TDSE_CONFIG, metric }
  const config: TdseConfig = opts?.dt !== undefined ? { ...base, dt: opts.dt } : base
  const data = new ArrayBuffer(TDSE_UNIFORM_SIZE)
  const u32 = new Uint32Array(data)
  const f32 = new Float32Array(data)
  let captured: ArrayBuffer | null = null
  const stub = {
    queue: {
      writeBuffer: (_b: unknown, _o: number, src: ArrayBuffer) => {
        captured = src.slice(0)
      },
    },
  }
  writeTdseUniforms(stub as unknown as GPUDevice, {} as unknown as GPUBuffer, data, u32, f32, {
    config,
    totalSites: config.gridSize.reduce((a, b) => a * b, 1),
    simTime: opts?.simTime ?? 0,
    maxDensity: 1,
    initialMaxDensity: 1,
    autoScaleMaxGain: 20,
    strides: [1, config.gridSize[0]!, config.gridSize[0]! * config.gridSize[1]!],
    needsInit: false,
  })
  if (!captured) throw new Error('writeTdseUniforms did not invoke writeBuffer')
  const capBuf = captured as ArrayBuffer
  return {
    u32: new Uint32Array(capBuf),
    f32: new Float32Array(capBuf),
    size: capBuf.byteLength,
  }
}

describe('TDSE uniform pack — curved-space v2 metric block', () => {
  // ── metricKind numeric codes (u32[208]) ────────────────────────────────
  it.each([
    ['flat', 0],
    ['morrisThorne', 1],
    ['schwarzschild', 2],
    ['deSitter', 3],
    ['antiDeSitter', 4],
    ['sphere2D', 5],
    ['torus', 6],
    ['doubleThroat', 7],
  ] as const)('maps metric kind %s → numeric code %i at u32[208]', (kind, code) => {
    const { u32, size } = packAndCapture({ kind } as MetricConfig)
    expect(u32[208]).toBe(code)
    expect(size).toBe(1024)
  })

  // ── Schwarzschild mass written to f32[212] and nowhere else ───────────
  it('writes Schwarzschild mass to f32[212] and clamps to bounds', () => {
    const { f32 } = packAndCapture({ kind: 'schwarzschild', schwarzschildMass: 2.5 })
    expect(f32[212]).toBeCloseTo(2.5, 5)
    // Other per-kind fields zero.
    expect(f32[213]).toBe(0) // hubble
    expect(f32[214]).toBe(0) // ads
    expect(f32[215]).toBe(0) // sphere
    expect(f32[216]).toBe(0) // doubleThroatSep
    expect(f32[217]).toBe(0) // doubleThroatRad
    // Above-bounds (MAX=10) clamps.
    const hi = packAndCapture({ kind: 'schwarzschild', schwarzschildMass: 999 })
    expect(hi.f32[212]).toBe(10)
    // Below-bounds (MIN=0.01) clamps.
    const lo = packAndCapture({ kind: 'schwarzschild', schwarzschildMass: 0.00001 })
    expect(lo.f32[212]).toBeCloseTo(0.01, 6)
  })

  // ── de Sitter Hubble rate written to f32[213] ─────────────────────────
  it('writes deSitter hubble rate to f32[213]', () => {
    const { f32 } = packAndCapture({ kind: 'deSitter', hubbleRate: 0.75 })
    expect(f32[213]).toBeCloseTo(0.75, 5)
    expect(f32[212]).toBe(0)
    expect(f32[214]).toBe(0)
  })

  // ── AdS radius to f32[214] ────────────────────────────────────────────
  it('writes antiDeSitter radius to f32[214]', () => {
    const { f32 } = packAndCapture({ kind: 'antiDeSitter', adsRadius: 3 })
    expect(f32[214]).toBeCloseTo(3, 5)
  })

  // ── Sphere radius to f32[215] ─────────────────────────────────────────
  it('writes sphere2D radius to f32[215]', () => {
    const { f32, u32 } = packAndCapture({ kind: 'sphere2D', sphereRadius: 1.5 })
    expect(f32[215]).toBeCloseTo(1.5, 5)
    // sphere2D is mixed topology: theta is bounded, phi (axis 2) is periodic.
    // The absorber must therefore skip only the phi seam.
    const compactMask = u32[184] ?? 0
    expect(compactMask & (1 << 2)).toBe(1 << 2)
    expect(compactMask & (1 << 1)).toBe(0)
  })

  // ── Double throat fields ──────────────────────────────────────────────
  it('writes doubleThroat separation and radius to f32[216,217] with fallback', () => {
    const { f32 } = packAndCapture({
      kind: 'doubleThroat',
      doubleThroatSeparation: 2.0,
      doubleThroatRadius: 0.8,
    })
    expect(f32[216]).toBeCloseTo(2.0, 5)
    expect(f32[217]).toBeCloseTo(0.8, 5)
    // Fallback: doubleThroatRadius unset → use throatRadius.
    const fallback = packAndCapture({
      kind: 'doubleThroat',
      doubleThroatSeparation: 1.5,
      throatRadius: 0.6,
    })
    expect(fallback.f32[217]).toBeCloseTo(0.6, 5)
  })

  // ── Torus period (3 × f32) at indices 220..222 ────────────────────────
  it('writes torusPeriod[0..2] to f32[220..222]', () => {
    const { f32 } = packAndCapture({ kind: 'torus', torusPeriod: [4, 5, 6] })
    expect(f32[220]).toBeCloseTo(4, 5)
    expect(f32[221]).toBeCloseTo(5, 5)
    expect(f32[222]).toBeCloseTo(6, 5)
  })

  // ── Flat metric writes zero to every v2 field ─────────────────────────
  it('flat metric writes zero to every v2 metric field (212..223)', () => {
    const { f32, u32 } = packAndCapture({ kind: 'flat' })
    expect(u32[208]).toBe(0)
    expect(f32[209]).toBe(0) // throatRadius
    for (let i = 212; i <= 223; i++) {
      expect(f32[i]).toBe(0)
    }
  })

  // ── throatRadius (v1 slot) gets written for both morrisThorne and doubleThroat ─
  it('throatRadius (f32[209]) written for morrisThorne and doubleThroat only', () => {
    const mt = packAndCapture({ kind: 'morrisThorne', throatRadius: 0.7 })
    expect(mt.f32[209]).toBeCloseTo(0.7, 5)
    const dt = packAndCapture({ kind: 'doubleThroat', throatRadius: 0.4 })
    expect(dt.f32[209]).toBeCloseTo(0.4, 5)
    const sp = packAndCapture({ kind: 'sphere2D', sphereRadius: 2 })
    expect(sp.f32[209]).toBe(0)
  })

  // ── RK4 stage times at f32[224..227] ──────────────────────────────────
  it('stage times equal [t, t+dt/2, t+dt/2, t+dt]', () => {
    const { f32 } = packAndCapture(
      { kind: 'deSitter', hubbleRate: 0.5 },
      {
        simTime: 3.0,
        dt: 0.02,
      }
    )
    expect(f32[224]).toBeCloseTo(3.0, 5) // K1 = t
    expect(f32[225]).toBeCloseTo(3.01, 5) // K2 = t + dt/2
    expect(f32[226]).toBeCloseTo(3.01, 5) // K3 = t + dt/2
    expect(f32[227]).toBeCloseTo(3.02, 5) // K4 = t + dt
  })

  // ── Defaults: no metric set ──────────────────────────────────────────
  it('defaults (metric undefined) ⇒ flat code + all v2 fields zero', () => {
    const { u32, f32 } = packAndCapture(undefined)
    expect(u32[208]).toBe(0)
    for (let i = 212; i <= 223; i++) {
      expect(f32[i]).toBe(0)
    }
  })

  // ── Torus metric override: effective spacing derived from torusPeriod ─
  // The FFT kinetic step uses spacing[axis] to compute k_max = π/dx and thus
  // the quantized torus momenta k_n = 2π·n/(N·dx). When torus metric is
  // active, torusPeriod[axis] is the authoritative period of the compactified
  // torus, so effective spacing must be L/N — not the user's raw dx.
  it('torus metric overrides effective spacing to torusPeriod / gridSize', () => {
    const { f32 } = packAndCapture({
      kind: 'torus',
      torusPeriod: [Math.PI, Math.PI, Math.PI],
    })
    // DEFAULT_TDSE_CONFIG uses gridSize=[64,64,64] so dx_eff = π/64.
    const expected = Math.PI / 64
    expect(f32[32]).toBeCloseTo(expected, 6)
    expect(f32[33]).toBeCloseTo(expected, 6)
    expect(f32[34]).toBeCloseTo(expected, 6)
    // The raw torusPeriod values remain visible at 220..222 (for shader + URL).
    expect(f32[220]).toBeCloseTo(Math.PI, 5)
  })

  it('non-torus metric leaves effective spacing at user-set dx', () => {
    // With the default 0.1 spacing and flat metric, no override should fire.
    const { f32 } = packAndCapture({ kind: 'flat' })
    expect(f32[32]).toBeCloseTo(0.1, 6)
    expect(f32[33]).toBeCloseTo(0.1, 6)
    expect(f32[34]).toBeCloseTo(0.1, 6)
  })
})
