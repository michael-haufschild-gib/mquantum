import { describe, expect, it } from 'vitest'

import { DEFAULT_CONSTRAINT_SEAM_CONFIG } from '@/lib/geometry/extended/wdwZeta/constraintSeam'
import { DEFAULT_FIELD_ONE_ELEMENT_CONFIG } from '@/lib/geometry/extended/wdwZeta/fieldOneElement'
import { DEFAULT_MOEBIUS_NO_BOUNDARY_CONFIG } from '@/lib/geometry/extended/wdwZeta/moebiusNoBoundary'
import { DEFAULT_PRIMON_MULTIVERSE_CONFIG } from '@/lib/geometry/extended/wdwZeta/primonMultiverse'
import { DEFAULT_TURNING_SURFACE_CONFIG } from '@/lib/geometry/extended/wdwZeta/turningSurface'
import { DEFAULT_WEIL_POSITIVITY_CONFIG } from '@/lib/geometry/extended/wdwZeta/weilPositivity'
import { RIEMANN_ZEROS } from '@/lib/physics/riemannZeta'
import {
  buildWdwZetaLut,
  seamZeroCount,
  WDW_ZETA_AUX_OFFSET,
  WDW_ZETA_FIELD_NX,
  WDW_ZETA_FIELD_NY,
  WDW_ZETA_FIELD_OFFSET,
  WDW_ZETA_LUT_VEC4,
  WDW_ZETA_MEASURES_COUNT,
  WDW_ZETA_MEASURES_OFFSET,
  WDW_ZETA_MEASURES_TMAX,
  WDW_ZETA_MEASURES_TMIN,
  WDW_ZETA_MOEBIUS_LACE_COUNT,
  WDW_ZETA_ZEROS_OFFSET,
  wdwZetaLutHash,
} from '@/lib/physics/wdwZeta/lut'
import { generateMainBlockWdwZetaVolume } from '@/rendering/webgpu/shaders/schroedinger/mainWdwZetaVolume.wgsl'
import { generateWdwZetaLib } from '@/rendering/webgpu/shaders/schroedinger/wdwZetaLib.wgsl'

/** Read vec4 entry `i` from a LUT float view. */
function vec4(lut: Float32Array, i: number): [number, number, number, number] {
  const o = i * 4
  return [lut[o]!, lut[o + 1]!, lut[o + 2]!, lut[o + 3]!]
}

describe('wdwZeta LUT builders', () => {
  it('allocates the fixed-size buffer', () => {
    // mode 4 (primon) has no 2D-field bake, so this stays cheap under the suite.
    const lut = buildWdwZetaLut(4, { primonMultiverse: DEFAULT_PRIMON_MULTIVERSE_CONFIG })
    expect(lut.length).toBe(WDW_ZETA_LUT_VEC4 * 4)
  })

  it('writes the constraint-seam header + the first ζ-zero ordinate', () => {
    const cfg = { ...DEFAULT_CONSTRAINT_SEAM_CONFIG, reliefHeight: 0.8, heightWindow: 60 }
    const lut = buildWdwZetaLut(0, { constraintSeam: cfg })
    const header = vec4(lut, 0)
    expect(header[0]).toBeCloseTo(0.8, 5) // reliefHeight
    expect(header[1]).toBeCloseTo(60, 5) // heightWindow (the t-window)
    // ζ-zeros block begins at WDW_ZETA_ZEROS_OFFSET with t₁ = 14.134725…
    expect(vec4(lut, WDW_ZETA_ZEROS_OFFSET)[0]).toBeCloseTo(RIEMANN_ZEROS[0]!, 3)
  })

  it('primon occupations follow the Bose law n_p = 1/(p^β − 1)', () => {
    const cfg = { ...DEFAULT_PRIMON_MULTIVERSE_CONFIG, beta: 1.4, primeCount: 6 }
    const lut = buildWdwZetaLut(4, { primonMultiverse: cfg })
    // aux[0] is the first prime (2): p in .x, occupation in .y, ln p in .z
    const first = vec4(lut, WDW_ZETA_AUX_OFFSET)
    expect(first[0]).toBe(2)
    expect(first[1]).toBeCloseTo(1 / (Math.pow(2, 1.4) - 1), 4)
    expect(first[2]).toBeCloseTo(Math.log(2), 5)
    // second prime is 3
    expect(vec4(lut, WDW_ZETA_AUX_OFFSET + 1)[0]).toBe(3)
  })

  it('lower β (toward Hagedorn) raises the low-prime occupation', () => {
    const occAt = (beta: number) => {
      const lut = buildWdwZetaLut(4, {
        primonMultiverse: { ...DEFAULT_PRIMON_MULTIVERSE_CONFIG, beta, primeCount: 4 },
      })
      return vec4(lut, WDW_ZETA_AUX_OFFSET)[1]
    }
    expect(occAt(1.1)).toBeGreaterThan(occAt(2.0))
  })

  it('weil header records the off-line-zero (ghost) toggle', () => {
    const on = buildWdwZetaLut(9, {
      weilPositivity: { ...DEFAULT_WEIL_POSITIVITY_CONFIG, offLineZero: true, offLineOffset: 0.3 },
    })
    const off = buildWdwZetaLut(9, {
      weilPositivity: { ...DEFAULT_WEIL_POSITIVITY_CONFIG, offLineZero: false },
    })
    expect(vec4(on, 0)[2]).toBe(1) // ghost flag on
    expect(vec4(on, 0)[3]).toBeCloseTo(0.3, 5)
    expect(vec4(off, 0)[2]).toBe(0)
  })

  it('lutHash changes iff the config changes', () => {
    const a = wdwZetaLutHash(0, { constraintSeam: { ...DEFAULT_CONSTRAINT_SEAM_CONFIG } })
    const b = wdwZetaLutHash(0, { constraintSeam: { ...DEFAULT_CONSTRAINT_SEAM_CONFIG } })
    const c = wdwZetaLutHash(0, {
      constraintSeam: { ...DEFAULT_CONSTRAINT_SEAM_CONFIG, reliefHeight: 0.99 },
    })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('seamZeroCount counts ζ-zeros within [2, T]', () => {
    expect(seamZeroCount(30, RIEMANN_ZEROS)).toBe(
      RIEMANN_ZEROS.filter((t) => t >= 2 && t <= 30).length
    )
    // monotonic: a wider window never counts fewer zeros
    expect(seamZeroCount(80, RIEMANN_ZEROS)).toBeGreaterThanOrEqual(
      seamZeroCount(40, RIEMANN_ZEROS)
    )
  })
})

describe('wdwZeta cross-domain enrichments', () => {
  /** Read field-block cell (ix, iy) component `comp`. */
  function fieldComp(lut: Float32Array, ix: number, iy: number, comp: number): number {
    return lut[(WDW_ZETA_FIELD_OFFSET + iy * WDW_ZETA_FIELD_NX + ix) * 4 + comp]!
  }

  it('constraint-seam header B carries σ-band, carpet gain, and domain-shade flag', () => {
    const cfg = {
      ...DEFAULT_CONSTRAINT_SEAM_CONFIG,
      stripBand: 0.3,
      carpetGain: 0.7,
      domainShade: false,
    }
    const hb = vec4(buildWdwZetaLut(0, { constraintSeam: cfg }), 1)
    expect(hb[0]).toBeCloseTo(0.3, 5) // stripBand
    expect(hb[1]).toBeCloseTo(0.7, 5) // carpetGain
    expect(hb[2]).toBe(0) // domainShade off
  })

  it('bakes a normalized, non-flat TDSE Talbot carpet into the field .z channel', () => {
    const lut = buildWdwZetaLut(0, { constraintSeam: { ...DEFAULT_CONSTRAINT_SEAM_CONFIG } })
    let maxZ = 0
    let minZ = 1
    for (let i = 0; i < WDW_ZETA_FIELD_NX * WDW_ZETA_FIELD_NY; i++) {
      const z = lut[(WDW_ZETA_FIELD_OFFSET + i) * 4 + 2]!
      expect(z).toBeGreaterThanOrEqual(-1e-6)
      expect(z).toBeLessThanOrEqual(1 + 1e-6)
      maxZ = Math.max(maxZ, z)
      minZ = Math.min(minZ, z)
    }
    expect(maxZ).toBeCloseTo(1, 5) // normalized to peak 1
    expect(maxZ - minZ).toBeGreaterThan(0.2) // genuine interference structure, not flat
  })

  it('turning-surface φ-mass asymmetry breaks the φ → −φ symmetry of the baked U', () => {
    const sym = buildWdwZetaLut(3, {
      turningSurface: { ...DEFAULT_TURNING_SURFACE_CONFIG, asymmetry: 1 },
    })
    const asym = buildWdwZetaLut(3, {
      turningSurface: { ...DEFAULT_TURNING_SURFACE_CONFIG, asymmetry: 2.5 },
    })
    const ix = Math.floor(WDW_ZETA_FIELD_NX * 0.6)
    const iyHi = WDW_ZETA_FIELD_NY - 6
    const iyLo = WDW_ZETA_FIELD_NY - 1 - iyHi // mirror row (same |φ|)
    // .z = signed U. Isotropic: U(+φ) == U(−φ). Anisotropic: it must differ.
    expect(fieldComp(sym, ix, iyHi, 2)).toBeCloseTo(fieldComp(sym, ix, iyLo, 2), 4)
    expect(Math.abs(fieldComp(asym, ix, iyHi, 2) - fieldComp(asym, ix, iyLo, 2))).toBeGreaterThan(
      0.01
    )
  })

  it('primon header B carries the partition Z = ζ(β), link gain, and occupation scale', () => {
    const hb = vec4(
      buildWdwZetaLut(4, {
        primonMultiverse: { ...DEFAULT_PRIMON_MULTIVERSE_CONFIG, linkGain: 0.8, occScale: 1.5 },
      }),
      1
    )
    expect(hb[0]).toBeGreaterThan(1) // Z = ζ(β) > 1 for β > 1
    expect(hb[1]).toBeCloseTo(0.8, 5) // linkGain
    expect(hb[2]).toBeCloseTo(1.5, 5) // occScale
  })

  it('bakes the shared arithmetic-measures table for EVERY mode (N(t), ψ, M, osc)', () => {
    // The shared measure table must be present and well-formed regardless of mode.
    for (const modeId of [0, 4, 9]) {
      const lut = buildWdwZetaLut(modeId, {
        constraintSeam: { ...DEFAULT_CONSTRAINT_SEAM_CONFIG },
        primonMultiverse: { ...DEFAULT_PRIMON_MULTIVERSE_CONFIG },
        weilPositivity: { ...DEFAULT_WEIL_POSITIVITY_CONFIG },
      } as never)
      const at = (i: number) => vec4(lut, WDW_ZETA_MEASURES_OFFSET + i)
      let prevN = -1
      let prevPsi = -1
      let distinctN = new Set<number>()
      for (let i = 0; i < WDW_ZETA_MEASURES_COUNT; i++) {
        const [Nt, psi, M, osc] = at(i)
        // N(t) is a non-decreasing integer staircase.
        expect(Nt).toBeGreaterThanOrEqual(prevN)
        expect(Nt).toBeCloseTo(Math.round(Nt), 5)
        prevN = Nt
        distinctN.add(Nt)
        // ψ(x) is non-decreasing and normalized to [0,1].
        expect(psi).toBeGreaterThanOrEqual(prevPsi - 1e-6)
        expect(psi).toBeLessThanOrEqual(1 + 1e-6)
        prevPsi = psi
        // M(x) and the explicit-formula oscillation are normalized to [−1,1].
        expect(Math.abs(M)).toBeLessThanOrEqual(1 + 1e-6)
        expect(Math.abs(osc)).toBeLessThanOrEqual(1 + 1e-6)
      }
      // The zero-count staircase actually climbs (more than one band).
      expect(distinctN.size, `mode ${modeId} N(t) should climb`).toBeGreaterThan(3)
    }
  })

  it('𝔽₁ bakes Euler totients φ(n) + prime flags per cyclotomic ring', () => {
    const lut = buildWdwZetaLut(10, {
      fieldOneElement: { ...DEFAULT_FIELD_ONE_ELEMENT_CONFIG, maxOrder: 12 },
    })
    // header A = (maxOrder, qDeform, towerTwist, primeGlow)
    expect(vec4(lut, 0)[0]).toBeCloseTo(12, 5)
    // aux[n−1] = (φ(n), isPrime, φ(n)/n, n). Known totients: φ(1..7)=1,1,2,2,4,2,6.
    const phi = [1, 1, 2, 2, 4, 2, 6]
    const prime = [0, 1, 1, 0, 1, 0, 1] // n=1..7: 2,3,5,7 prime
    for (let n = 1; n <= 7; n++) {
      const a = vec4(lut, WDW_ZETA_AUX_OFFSET + (n - 1))
      expect(a[0], `φ(${n})`).toBe(phi[n - 1])
      expect(a[1], `isPrime(${n})`).toBe(prime[n - 1])
      expect(a[2], `φ(${n})/${n}`).toBeCloseTo(phi[n - 1]! / n, 5)
      expect(a[3]).toBe(n)
    }
  })

  it('weil header B carries bowl curvature, ring gain, and vacuum-mound blend', () => {
    const hb = vec4(
      buildWdwZetaLut(9, {
        weilPositivity: {
          ...DEFAULT_WEIL_POSITIVITY_CONFIG,
          bowlCurve: 0.9,
          ringGain: 0.6,
          kahlerMix: 0.7,
        },
      }),
      1
    )
    expect(hb[1]).toBeCloseTo(0.9, 5) // bowlCurve
    expect(hb[2]).toBeCloseTo(0.6, 5) // ringGain
    expect(hb[3]).toBeCloseTo(0.7, 5) // kahlerMix
  })
})

// Regression: the Li/Keiper ghost added only ½+δ ± iγ₀. ξ(s) = ξ(1−s) forces
// the full quartet (bakeXiField already multiplies all four in); the missing
// ½−δ pair is the only one with |1 − 1/ρ| > 1, i.e. the only one whose terms
// can go negative.
describe('wdwZeta Weil Li coefficients', () => {
  /** Independent polar-form λ_n = Σ_ρ [1 − |1−1/ρ|^n cos(n·arg(1−1/ρ))]. */
  function liReference(zeros: readonly [number, number][], n: number): number {
    let sum = 0
    for (const [re, im] of zeros) {
      const d = re * re + im * im
      const br = 1 - re / d
      const bi = im / d
      sum += 1 - Math.pow(br * br + bi * bi, n / 2) * Math.cos(n * Math.atan2(bi, br))
    }
    return sum
  }

  it('sums the full functional-equation quartet for the off-line ghost', () => {
    const delta = 0.3
    const zeroCount = 16
    const lut = buildWdwZetaLut(9, {
      weilPositivity: {
        ...DEFAULT_WEIL_POSITIVITY_CONFIG,
        zeroCount,
        offLineZero: true,
        offLineOffset: delta,
      },
    })
    const g0 = RIEMANN_ZEROS[0]!
    const zeros: [number, number][] = []
    for (let i = 0; i < zeroCount; i++) {
      zeros.push([0.5, RIEMANN_ZEROS[i]!], [0.5, -RIEMANN_ZEROS[i]!])
    }
    zeros.push([0.5 + delta, g0], [0.5 + delta, -g0], [0.5 - delta, g0], [0.5 - delta, -g0])
    for (const n of [1, 7, 20, 40]) {
      const raw = vec4(lut, WDW_ZETA_AUX_OFFSET + (n - 1))[1]
      const ref = liReference(zeros, n)
      expect(Math.abs(raw - ref) / Math.abs(ref), `λ_${n}`).toBeLessThan(1e-5)
    }
  })

  it('leaves the RH (no-ghost) coefficients as the on-line sum', () => {
    const lut = buildWdwZetaLut(9, {
      weilPositivity: { ...DEFAULT_WEIL_POSITIVITY_CONFIG, zeroCount: 8, offLineZero: false },
    })
    const zeros: [number, number][] = []
    for (let i = 0; i < 8; i++) zeros.push([0.5, RIEMANN_ZEROS[i]!], [0.5, -RIEMANN_ZEROS[i]!])
    const raw = vec4(lut, WDW_ZETA_AUX_OFFSET + 9)[1]
    expect(Math.abs(raw - liReference(zeros, 10)) / liReference(zeros, 10)).toBeLessThan(1e-5)
  })
})

// Regression: the shared `.w` measure baked Σ cos(γ·log x)/|ρ|, dropping the
// phase arg ρ ≈ π/2 and the sign of −Σ_ρ x^ρ/ρ — the quadrature wave, which is
// uncorrelated (r ≈ −0.06) with the true explicit-formula residual of ψ(x).
describe('wdwZeta explicit-formula measure', () => {
  /** Chebyshev ψ₀(x) with the half-value convention at prime-power jumps. */
  function psi0(x: number): number {
    let s = 0
    for (let p = 2; p <= x; p++) {
      let prime = true
      for (let q = 2; q * q <= p; q++) if (p % q === 0) prime = false
      if (!prime) continue
      for (let pk = p; pk <= x; pk *= p) s += Math.log(p) * (pk === x ? 0.5 : 1)
    }
    return s
  }

  it('tracks ψ₀(x) − x + log 2π + ½log(1 − x⁻²) (the explicit-formula zero sum)', () => {
    const lut = buildWdwZetaLut(4, { primonMultiverse: DEFAULT_PRIMON_MULTIVERSE_CONFIG })
    const baked: number[] = []
    const truth: number[] = []
    const span = WDW_ZETA_MEASURES_TMAX - WDW_ZETA_MEASURES_TMIN
    for (let i = 0; i < WDW_ZETA_MEASURES_COUNT; i++) {
      const x = WDW_ZETA_MEASURES_TMIN + (span * i) / (WDW_ZETA_MEASURES_COUNT - 1)
      baked.push(vec4(lut, WDW_ZETA_MEASURES_OFFSET + i)[3] * Math.sqrt(x))
      truth.push(psi0(x) - x + Math.log(2 * Math.PI) + 0.5 * Math.log(1 - 1 / (x * x)))
    }
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
    const mb = mean(baked)
    const mt = mean(truth)
    let sbt = 0
    let sbb = 0
    let stt = 0
    for (let i = 0; i < baked.length; i++) {
      sbt += (baked[i]! - mb) * (truth[i]! - mt)
      sbb += (baked[i]! - mb) ** 2
      stt += (truth[i]! - mt) ** 2
    }
    expect(sbt / Math.sqrt(sbb * stt)).toBeGreaterThan(0.9)
  })
})

// Regression: the Möbius lacework baked μ(n) for n ≤ 48 and the shader read
// `wzAux(idx % 48)` with idx over [0, cutoff) — at the default cutoff 60 the
// cells n = 49..60 showed μ(n − 48) (e.g. n = 49 = 7² drew μ(1) = +1, not 0).
describe('wdwZeta Möbius lacework table', () => {
  /** μ(n) by trial division (independent of the LUT's helper). */
  function mu(n: number): number {
    let m = n
    let k = 0
    for (let p = 2; p <= m; p++) {
      if (m % p !== 0) continue
      m /= p
      if (m % p === 0) return 0
      k++
    }
    return k % 2 === 0 ? 1 : -1
  }

  it('bakes μ(n) for every n the shader can index (n ≤ 111)', () => {
    const lut = buildWdwZetaLut(1, { moebiusNoBoundary: DEFAULT_MOEBIUS_NO_BOUNDARY_CONFIG })
    expect(WDW_ZETA_MOEBIUS_LACE_COUNT).toBe(111)
    for (let n = 1; n <= WDW_ZETA_MOEBIUS_LACE_COUNT; n++) {
      const [m, weight, idx] = vec4(lut, WDW_ZETA_AUX_OFFSET + (n - 1))
      expect(m, `μ(${n})`).toBe(mu(n))
      expect(weight).toBeCloseTo(mu(n) / n, 6)
      expect(idx).toBe(n)
    }
  })

  it('indexes the μ table directly, with the cutoff clamped to the baked range', () => {
    const wgsl = generateMainBlockWdwZetaVolume()
    expect(wgsl).toContain('let cutoff = clamp(wzHeadA().y, 8.0, 111.0);')
    expect(wgsl).toContain('let mu = wzAux(abs(idx)).x;')
    expect(wgsl).not.toContain('% 48')
  })

  // The Möbius Triad colour algorithm (34) kept the old `% 48` read and an
  // unclamped cutoff after the lacework fix, so for n > 48 the colour named
  // μ(n − 48) while the cell geometry showed μ(n).
  it('Möbius Triad colour algorithm uses the same direct index as the lacework', () => {
    const lib = generateWdwZetaLib()
    const algo = lib.slice(lib.indexOf('if (algo == 34)'), lib.indexOf('if (algo == 35)'))
    expect(algo).toContain('let cutoff = clamp(wzHeadA().y, 8.0, 111.0);')
    expect(algo).toContain('let mu = wzAux(abs(idx)).x;')
    expect(lib).not.toContain('% 48')
  })
})
