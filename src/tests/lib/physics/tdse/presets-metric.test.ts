/**
 * Tests for the curved-space TDSE v2 presets.
 *
 * Verifies:
 *   1. Each new preset loads into the store with the expected metric kind
 *      and a finite, in-range parameter set.
 *   2. Every preset's `dt` is ≤ 0.01 (sanity bound for RK4 on the curved
 *      kinetic operator).
 *   3. Every preset description contains both an explicit "NOT" caveat
 *      and at least one physics-domain keyword.
 */

import { describe, expect, it } from 'vitest'

import { TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'

const NEW_V2_IDS = [
  'wormholeEntangledPair',
  'schwarzschildOrbit',
  'gravitationalRedshift',
  'cosmologicalRedshift',
  'sphereCompactification',
  'torusEigenstates',
  'adsBoundaryBounce',
] as const

/**
 * Per-preset keyword regex. Replaces a single global union list so a
 * description copy-pasted between presets (for example, pasting the
 * gravitational-redshift blurb into `sphereCompactification`) is caught —
 * the old global check would pass either description because both
 * contain keywords from the unified list.
 */
const REQUIRED_KEYWORDS_PER_ID: Record<(typeof NEW_V2_IDS)[number], RegExp> = {
  wormholeEntangledPair: /wormhole|throat/i,
  schwarzschildOrbit: /schwarzschild|curvature|lensing/i,
  gravitationalRedshift: /schwarzschild|conformal|redshift|phase/i,
  cosmologicalRedshift: /de sitter|cosmological|hubble|scale factor|expansion/i,
  sphereCompactification: /sphere|polar|azimuthal|compactif/i,
  torusEigenstates: /torus|compact|period|plane wave/i,
  adsBoundaryBounce: /ads|anti-de sitter|poincar|boundary/i,
}

describe('TDSE curved-space v2 presets', () => {
  const v2Presets = TDSE_SCENARIO_PRESETS.filter((p) =>
    NEW_V2_IDS.includes(p.id as (typeof NEW_V2_IDS)[number])
  )

  it('ships exactly the 7 expected v2 preset ids', () => {
    expect(new Set(v2Presets.map((p) => p.id))).toEqual(new Set(NEW_V2_IDS))
  })

  it('preserves the v1 wormholeWavepacket preset (must not be replaced)', () => {
    const v1 = TDSE_SCENARIO_PRESETS.find((p) => p.id === 'wormholeWavepacket')
    expect(v1?.overrides.metric).toEqual({ kind: 'morrisThorne', throatRadius: 0.5 })
  })

  describe.each(NEW_V2_IDS)('%s', (id) => {
    const preset = TDSE_SCENARIO_PRESETS.find((p) => p.id === id)
    if (!preset) throw new Error(`preset ${id} not found`)

    it('has a non-flat metric override (curved-space preset)', () => {
      // Asserts the preset routes to the curved Laplace–Beltrami integrator
      // instead of the flat split-step FFT.
      expect(preset.overrides.metric?.kind).not.toBe('flat')
    })

    it('uses dt in (0, 0.01] (RK4 stability bound)', () => {
      const dt = preset.overrides.dt
      expect(dt).toBeGreaterThan(0)
      expect(dt!).toBeLessThanOrEqual(0.01)
    })

    it('description contains "NOT" caveat and a topic-specific keyword', () => {
      const desc = preset.description
      expect(desc.includes('NOT')).toBe(true)
      const requiredPattern = REQUIRED_KEYWORDS_PER_ID[id]
      expect(
        requiredPattern.test(desc),
        `preset ${id} description must match ${requiredPattern}; got: ${desc.slice(0, 120)}…`
      ).toBe(true)
    })

    it('has matching latticeDim and array lengths for grid/spacing/packetCenter', () => {
      const o = preset.overrides
      // latticeDim drives every per-axis array length; mismatches would
      // crash the resize path inside `applyTdsePreset`.
      const dim = o.latticeDim
      expect(dim).toBe(3)
      expect(o.gridSize?.length).toBe(dim)
      expect(o.spacing?.length).toBe(dim)
      expect(o.packetCenter?.length).toBe(dim)
      expect(o.packetMomentum?.length).toBe(dim)
    })

    it('is capped at the 3D slice it describes', () => {
      expect(preset.maxDim).toBe(3)
    })

    it('has strictly positive physics-scale metric parameters', () => {
      // Every populated metric parameter must be > 0. A zero throat
      // radius or sphere radius produces a singular metric that the
      // Laplace–Beltrami integrator cannot evolve. A zero packetWidth
      // collapses the Gaussian to a Dirac delta that aliases across the
      // lattice.
      const o = preset.overrides
      expect(o.packetWidth ?? 0, `${id}: packetWidth must be > 0`).toBeGreaterThan(0)
      const m = o.metric
      if (!m) throw new Error(`${id}: expected metric override`)
      // Every kind-specific scale must be > 0 when present. Optional
      // chaining because not every field applies to every kind.
      if (m.throatRadius !== undefined) expect(m.throatRadius).toBeGreaterThan(0)
      if (m.schwarzschildMass !== undefined) expect(m.schwarzschildMass).toBeGreaterThan(0)
      if (m.hubbleRate !== undefined) expect(m.hubbleRate).toBeGreaterThan(0)
      if (m.adsRadius !== undefined) expect(m.adsRadius).toBeGreaterThan(0)
      if (m.sphereRadius !== undefined) expect(m.sphereRadius).toBeGreaterThan(0)
      if (m.doubleThroatRadius !== undefined) expect(m.doubleThroatRadius).toBeGreaterThan(0)
      if (m.doubleThroatSeparation !== undefined) {
        // Geometric non-overlap invariant: the two throats live on axis 0
        // centered at ±separation/2 with per-throat radius
        // doubleThroatRadius; their interior surfaces must not cross.
        expect(m.doubleThroatSeparation).toBeGreaterThan(0)
        const radius = m.doubleThroatRadius ?? m.throatRadius ?? 0
        expect(
          m.doubleThroatSeparation,
          `${id}: doubleThroatSeparation=${m.doubleThroatSeparation} must exceed 2·doubleThroatRadius=${2 * radius} for disjoint throats`
        ).toBeGreaterThan(2 * radius)
      }
      if (m.torusPeriod !== undefined) {
        for (let i = 0; i < m.torusPeriod.length; i++) {
          expect(m.torusPeriod[i], `${id}: torusPeriod[${i}] must be > 0`).toBeGreaterThan(0)
        }
      }
    })
  })

  it('wormholeEntangledPair uses doubleThroat metric with correct params', () => {
    const p = v2Presets.find((x) => x.id === 'wormholeEntangledPair')!
    const m = p.overrides.metric!
    expect(m.kind).toBe('doubleThroat')
    expect(m.doubleThroatSeparation).toBe(4.0)
    expect(m.doubleThroatRadius).toBe(0.4)
  })

  it('schwarzschildOrbit launches packet tangentially (axis-1 momentum)', () => {
    const p = v2Presets.find((x) => x.id === 'schwarzschildOrbit')!
    expect(p.overrides.metric?.kind).toBe('schwarzschild')
    // Tangential = momentum perpendicular to the radial direction.
    expect(p.overrides.packetMomentum?.[0]).toBe(0)
    expect(Math.abs(p.overrides.packetMomentum?.[1] ?? 0)).toBeGreaterThan(0)
  })

  it('gravitationalRedshift renders phase, not density', () => {
    const p = v2Presets.find((x) => x.id === 'gravitationalRedshift')!
    expect(p.overrides.fieldView).toBe('phase')
    expect(p.overrides.metric?.kind).toBe('schwarzschild')
  })

  it('cosmologicalRedshift uses time-dependent deSitter metric', () => {
    const p = v2Presets.find((x) => x.id === 'cosmologicalRedshift')!
    expect(p.overrides.metric?.kind).toBe('deSitter')
    expect(p.overrides.metric?.hubbleRate).toBe(0.3)
  })

  it('sphereCompactification places packet at θ=π/2 (equator)', () => {
    const p = v2Presets.find((x) => x.id === 'sphereCompactification')!
    expect(p.overrides.metric?.kind).toBe('sphere2D')
    expect(p.overrides.packetCenter?.[1]).toBeCloseTo(Math.PI / 2, 6)
  })

  it('torusEigenstates uses torus metric with period π and resonant momentum', () => {
    const p = v2Presets.find((x) => x.id === 'torusEigenstates')!
    expect(p.overrides.metric?.kind).toBe('torus')
    const period = p.overrides.metric?.torusPeriod
    expect(period?.[0]).toBeCloseTo(Math.PI, 5)
    expect(period?.[1]).toBeCloseTo(Math.PI, 5)
    expect(period?.[2]).toBeCloseTo(Math.PI, 5)
    // k = 2π·n/L = 2 → n = 1, resonant.
    expect(p.overrides.packetMomentum?.[0]).toBe(2.0)
    expect(p.overrides.absorberEnabled).toBe(false)
  })

  it('adsBoundaryBounce launches packet toward the boundary (z→0)', () => {
    const p = v2Presets.find((x) => x.id === 'adsBoundaryBounce')!
    expect(p.overrides.metric?.kind).toBe('antiDeSitter')
    // Packet at z>0 with momentum pointing toward z=0.
    expect(p.overrides.packetCenter?.[0]).toBeGreaterThan(0)
    expect(p.overrides.packetMomentum?.[0]).toBeLessThan(0)
  })

  it('every non-compact v2 preset has absorber + diagnostics enabled', () => {
    for (const p of v2Presets) {
      if (p.overrides.metric?.kind === 'torus') {
        expect(p.overrides.absorberEnabled).toBe(false)
        expect(p.overrides.diagnosticsEnabled).toBe(true)
        continue
      }
      expect(p.overrides.absorberEnabled).toBe(true)
      expect(p.overrides.absorberWidth).toBe(0.15)
      expect(p.overrides.diagnosticsEnabled).toBe(true)
    }
  })
})
