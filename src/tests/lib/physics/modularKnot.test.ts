/**
 * Tests for the Modular Knot / Rademacher Horizon physics core.
 *
 * These assert the EXACT number theory (Dedekind sums, the Rademacher
 * invariant Φ), the deterministic geodesic enumeration, the diverging Φ
 * colormap, and the structural correctness of the volume bake. Every assertion
 * is chosen so that a real break in the math (wrong sawtooth, wrong Φ formula,
 * wrong winding, mis-strided volume) fails the test.
 *
 * @module tests/lib/physics/modularKnot
 */

import { describe, expect, it } from 'vitest'

import {
  bakeModularKnotVolume,
  dedekindSum,
  enumerateModularGeodesics,
  phiColor,
  rademacherPhi,
  TREFOIL,
} from '@/lib/physics/modularKnot'

/** 2×2 row-major matrix product `[a,b,c,d]`. */
function mul(
  m: [number, number, number, number],
  n: [number, number, number, number]
): [number, number, number, number] {
  const [a, b, c, d] = m
  const [e, f, g, h] = n
  return [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h]
}

const L: [number, number, number, number] = [1, 1, 0, 1]
const R: [number, number, number, number] = [1, 0, 1, 1]

/** Φ of a `{L,R}` word via its product matrix. */
function phiOfWord(word: string): number {
  let m: [number, number, number, number] = [1, 0, 0, 1]
  for (const ch of word) m = mul(m, ch === 'L' ? L : R)
  return rademacherPhi(m[0], m[1], m[2], m[3])
}

describe('dedekindSum', () => {
  it('s(1, k) = (k-1)(k-2)/(12k); s(1, 5) = 0.2 exactly', () => {
    // (4·3)/(60) = 12/60 = 0.2
    expect(dedekindSum(1, 5)).toBeCloseTo(0.2, 12)
    // General closed form for a few k.
    for (const k of [3, 4, 6, 7, 11]) {
      const expected = ((k - 1) * (k - 2)) / (12 * k)
      expect(dedekindSum(1, k)).toBeCloseTo(expected, 12)
    }
  })

  it('s(2, 5) = 0 (exact)', () => {
    expect(dedekindSum(2, 5)).toBeCloseTo(0, 12)
  })

  it('satisfies Dedekind reciprocity for gcd(h,k)=1, e.g. (2,5)', () => {
    const h = 2
    const k = 5
    const lhs = dedekindSum(h, k) + dedekindSum(k, h)
    const rhs = -0.25 + (h / k + k / h + 1 / (h * k)) / 12
    expect(lhs).toBeCloseTo(rhs, 12)
  })

  it('satisfies reciprocity for additional coprime pairs', () => {
    for (const [h, k] of [
      [3, 7],
      [4, 9],
      [5, 12],
      [7, 11],
    ] as const) {
      const lhs = dedekindSum(h, k) + dedekindSum(k, h)
      const rhs = -0.25 + (h / k + k / h + 1 / (h * k)) / 12
      expect(lhs).toBeCloseTo(rhs, 11)
    }
  })

  it('returns 0 for k = 1 (empty sum)', () => {
    expect(dedekindSum(3, 1)).toBe(0)
  })
})

describe('rademacherPhi — verified integer values', () => {
  it('Φ(T = [1,1,0,1]) = 1', () => {
    expect(rademacherPhi(1, 1, 0, 1)).toBe(1)
  })

  it('Φ(S = [0,-1,1,0]) = 0', () => {
    expect(rademacherPhi(0, -1, 1, 0)).toBe(0)
  })

  it('Φ(LR = [2,1,1,1]) = 0', () => {
    const lr = mul(L, R)
    expect(lr).toEqual([2, 1, 1, 1])
    expect(rademacherPhi(lr[0], lr[1], lr[2], lr[3])).toBe(0)
  })

  it('Φ(RL) = 0 — conjugacy invariant, equals Φ(LR)', () => {
    const rl = mul(R, L)
    expect(rademacherPhi(rl[0], rl[1], rl[2], rl[3])).toBe(0)
    expect(phiOfWord('RL')).toBe(phiOfWord('LR'))
  })

  it('Φ(LLR = [3,2,1,1]) = 1', () => {
    const llr = mul(mul(L, L), R)
    expect(llr).toEqual([3, 2, 1, 1])
    expect(rademacherPhi(llr[0], llr[1], llr[2], llr[3])).toBe(1)
  })

  it('Φ(LRRR = [4,1,3,1]) = -2', () => {
    const lrrr = mul(mul(mul(L, R), R), R)
    expect(lrrr).toEqual([4, 1, 3, 1])
    expect(rademacherPhi(lrrr[0], lrrr[1], lrrr[2], lrrr[3])).toBe(-2)
  })

  it('is an integer for every enumerated class', () => {
    for (const g of enumerateModularGeodesics(8)) {
      expect(Number.isInteger(g.phi)).toBe(true)
    }
  })

  it('quasimorphism defect |Φ(AB) − Φ(A) − Φ(B)| ≤ 3 for several pairs', () => {
    const pairs: [string, string][] = [
      ['LR', 'LLR'],
      ['LR', 'RRL'],
      ['LLR', 'LRR'],
      ['LRRR', 'LLRR'],
      ['LLLR', 'LRRR'],
    ]
    for (const [a, b] of pairs) {
      const defect = Math.abs(phiOfWord(a + b) - phiOfWord(a) - phiOfWord(b))
      expect(defect).toBeLessThanOrEqual(3)
    }
  })
})

describe('enumerateModularGeodesics', () => {
  it('yields a stable count of 69 at maxLen = 8', () => {
    expect(enumerateModularGeodesics(8)).toHaveLength(69)
  })

  it('is deterministic (identical results across calls)', () => {
    const a = enumerateModularGeodesics(8)
    const b = enumerateModularGeodesics(8)
    expect(a).toEqual(b)
  })

  it('every class is hyperbolic (|trace| > 2) with matching length', () => {
    for (const g of enumerateModularGeodesics(8)) {
      expect(Math.abs(g.trace)).toBeGreaterThan(2)
      expect(g.length).toBeCloseTo(2 * Math.acosh(Math.abs(g.trace) / 2), 12)
      expect(g.length).toBeGreaterThan(0)
    }
  })

  it('is sorted by length ascending', () => {
    const geos = enumerateModularGeodesics(8)
    for (let i = 1; i < geos.length; i++) {
      expect(geos[i]!.length).toBeGreaterThanOrEqual(geos[i - 1]!.length)
    }
  })

  it('the shortest geodesic is LR (trace 3, Φ 0)', () => {
    const first = enumerateModularGeodesics(8)[0]!
    expect(first.word).toBe('LR')
    expect(first.trace).toBe(3)
    expect(first.phi).toBe(0)
    expect(first.matrix).toEqual([2, 1, 1, 1])
  })

  it('LR and RL collapse to one class (cyclic dedupe); both Φ = 0', () => {
    const words = enumerateModularGeodesics(8).map((g) => g.word)
    expect(words).toContain('LR')
    expect(words).not.toContain('RL') // RL is the same class as LR
    // Conjugacy invariance carried into enumeration.
    expect(phiOfWord('LR')).toBe(phiOfWord('RL'))
  })

  it('contains no non-primitive (proper-power) words like LRLR', () => {
    const words = enumerateModularGeodesics(8).map((g) => g.word)
    expect(words).not.toContain('LRLR') // = (LR)^2
    expect(words).not.toContain('LLLL') // pure-parabolic anyway, but also non-primitive
  })

  it('exposes the expected first geodesics with verified Φ', () => {
    const geos = enumerateModularGeodesics(8)
    // LLR and LRR are conjugate-mirror classes: same length, opposite Φ.
    const llr = geos.find((g) => g.word === 'LLR')!
    const lrr = geos.find((g) => g.word === 'LRR')!
    expect(llr.phi).toBe(1)
    expect(lrr.phi).toBe(-1)
    expect(llr.length).toBeCloseTo(lrr.length, 12)
  })
})

describe('phiColor — diverging Φ colormap', () => {
  it('negative Φ is bluer than positive Φ (higher blue channel)', () => {
    const neg = phiColor(-3, 3)
    const pos = phiColor(3, 3)
    expect(neg[2]).toBeGreaterThan(pos[2]) // blue channel
    expect(pos[0]).toBeGreaterThan(neg[0]) // red channel
  })

  it('Φ = 0 is a light neutral grey (no strong hue bias)', () => {
    const [r, g, b] = phiColor(0, 4)
    expect(Math.abs(r - g)).toBeLessThan(20)
    expect(Math.abs(g - b)).toBeLessThan(20)
    // A light neutral (well above mid-grey), but deliberately NOT near-white —
    // a pure-white Φ=0 over-blooms the low-|Φ| tube cores into a featureless cloud.
    expect(r).toBeGreaterThan(150)
    expect(r).toBeLessThan(230)
  })

  it('magnitude drives saturation: larger |Φ| is more saturated', () => {
    const small = phiColor(-1, 4)
    const large = phiColor(-4, 4)
    // Saturation = the blue-over-red channel spread (cool dominance). Larger
    // |Φ| pulls further from neutral white, so the spread grows and red drops.
    const spreadSmall = small[2] - small[0]
    const spreadLarge = large[2] - large[0]
    expect(spreadLarge).toBeGreaterThan(spreadSmall)
    expect(large[0]).toBeLessThan(small[0]) // red channel falls as it gets bluer
  })

  it('is symmetric in magnitude: +Φ and −Φ are mirror-saturated', () => {
    const neg = phiColor(-2, 4)
    const pos = phiColor(2, 4)
    // Saturation magnitude equal: distance from neutral white matches.
    const dNeg = Math.abs(neg[2] - 245)
    const dPos = Math.abs(pos[0] - 245)
    expect(dNeg).toBeCloseTo(dPos, 0)
  })

  it('clamps all channels to 0..255 integers, even for out-of-range Φ', () => {
    for (const phi of [-100, -3, 0, 5, 1000]) {
      const c = phiColor(phi, 4)
      for (const ch of c) {
        expect(Number.isInteger(ch)).toBe(true)
        expect(ch).toBeGreaterThanOrEqual(0)
        expect(ch).toBeLessThanOrEqual(255)
      }
    }
  })

  it('treats maxAbsPhi ≤ 0 as 1 (no division by zero / NaN)', () => {
    const c = phiColor(-1, 0)
    for (const ch of c) expect(Number.isFinite(ch)).toBe(true)
  })
})

describe('TREFOIL', () => {
  it('is a closed curve (start ≈ end at t = 0 and t = 2π)', () => {
    const a = TREFOIL(0)
    const b = TREFOIL(2 * Math.PI)
    for (let i = 0; i < 3; i++) expect(a[i]!).toBeCloseTo(b[i]!, 10)
  })

  it('stays inside the embedding box (|coord| ≤ ~1)', () => {
    for (let i = 0; i <= 64; i++) {
      const p = TREFOIL((i / 64) * 2 * Math.PI)
      for (const coord of p) expect(Math.abs(coord)).toBeLessThanOrEqual(1)
    }
  })
})

describe('bakeModularKnotVolume', () => {
  it('returns a row-major RGBA8 cube of size³·4 bytes', () => {
    const size = 48
    const { data, size: outSize } = bakeModularKnotVolume({ size })
    expect(outSize).toBe(size)
    expect(data).toBeInstanceOf(Uint8Array)
    expect(data.length).toBe(size * size * size * 4)
  })

  it('contains nonzero density (the scene is actually splatted)', () => {
    const { data, size } = bakeModularKnotVolume({ size: 48 })
    let nonzeroAlpha = 0
    for (let i = 0; i < size * size * size; i++) {
      if (data[i * 4 + 3]! > 0) nonzeroAlpha++
    }
    expect(nonzeroAlpha).toBeGreaterThan(0)
  })

  it('contains light-neutral high-density low-|Φ| voxels (no hue bias, not white)', () => {
    const { data, size } = bakeModularKnotVolume({ size: 64 })
    let lightNeutral = 0
    for (let i = 0; i < size * size * size; i++) {
      const r = data[i * 4]!
      const g = data[i * 4 + 1]!
      const b = data[i * 4 + 2]!
      const a = data[i * 4 + 3]!
      // Low-|Φ| cores: dense, light, neutral (r≈g≈b) — but not the old near-white
      // (>230) that bloomed the knot into a white cloud.
      const neutral = Math.abs(r - g) < 25 && Math.abs(g - b) < 25
      if (a > 200 && neutral && r > 150 && r < 230) lightNeutral++
    }
    expect(lightNeutral).toBeGreaterThan(0)
  })

  it('all bytes are finite and within 0..255', () => {
    const { data } = bakeModularKnotVolume({ size: 40 })
    // Scan once and assert once: a per-byte triple-expect over 256k bytes is
    // ~768k matcher calls — slow enough to flake the 5s timeout under suite
    // contention. A single reduction is both faster and a sharper assertion.
    let firstBad = -1
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!
      if (!Number.isFinite(v) || v < 0 || v > 255) {
        firstBad = i
        break
      }
    }
    expect(firstBad, `byte ${firstBad} = ${data[firstBad]} is out of [0,255]`).toBe(-1)
  })

  it('is deterministic — identical bytes across two bakes', () => {
    const a = bakeModularKnotVolume({ size: 40 })
    const b = bakeModularKnotVolume({ size: 40 })
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
  })

  it('encodes Φ color: blue (Φ<0) and warm (Φ>0) voxels both appear', () => {
    // With geodesics of both signs splatted, the colored tubes must produce
    // voxels that lean blue and voxels that lean warm (red dominant).
    const { data, size } = bakeModularKnotVolume({ size: 64 })
    let bluish = 0
    let warmish = 0
    for (let i = 0; i < size * size * size; i++) {
      const r = data[i * 4]!
      const g = data[i * 4 + 1]!
      const b = data[i * 4 + 2]!
      const a = data[i * 4 + 3]!
      if (a < 20) continue
      // Skip near-neutral (trefoil / Φ≈0): require a clear channel separation.
      if (b > r + 40 && b > g + 20) bluish++
      if (r > b + 40 && r > g + 20) warmish++
    }
    expect(bluish).toBeGreaterThan(0)
    expect(warmish).toBeGreaterThan(0)
  })
})
