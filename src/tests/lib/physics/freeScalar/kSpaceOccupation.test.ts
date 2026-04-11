import { describe, expect, it } from 'vitest'

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { fftNd } from '@/lib/math/fft'
import { sampleAdiabaticVacuum } from '@/lib/physics/cosmology/adiabaticVacuum'
import {
  computeRawKSpaceData,
  computeTotalParticleNumber,
  float32ToFloat16,
  type KSpaceRawData,
} from '@/lib/physics/freeScalar/kSpaceOccupation'
import {
  computeFsfCosmologyCoefs,
  computeFsfVacuumDispersion,
} from '@/lib/physics/freeScalar/vacuumDispersion'
import {
  computeOmegaK,
  computeOmegaKFromMassSq,
  sampleVacuumSpectrum,
} from '@/lib/physics/freeScalar/vacuumSpectrum'

describe('float32ToFloat16', () => {
  it('encodes 0.0 correctly', () => {
    expect(float32ToFloat16(0.0)).toBe(0)
  })

  it('encodes 1.0 correctly (0x3C00)', () => {
    expect(float32ToFloat16(1.0)).toBe(0x3c00)
  })

  it('encodes -1.0 correctly (0xBC00)', () => {
    expect(float32ToFloat16(-1.0)).toBe(0xbc00)
  })

  it('encodes Infinity correctly', () => {
    expect(float32ToFloat16(Infinity)).toBe(0x7c00)
  })

  it('encodes -Infinity correctly', () => {
    expect(float32ToFloat16(-Infinity)).toBe(0xfc00)
  })

  it('preserves approximate value for 0.5', () => {
    const f16 = float32ToFloat16(0.5)
    // 0.5 = 0x3800 in half float
    expect(f16).toBe(0x3800)
  })
})

describe('k-space energy conservation', () => {
  it('conserves energy: sum(n_k * omega_k) ≈ total field energy', () => {
    const N = 8
    const gridSize = [N, N]
    const spacing = [1.0, 1.0]
    const totalSites = N * N
    const mass = 0.5

    // Create a field with known energy
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const idx = iy * N + ix
        phi[idx] = 0.3 * Math.cos((2 * Math.PI * ix) / N)
        pi[idx] = 0.2 * Math.sin((2 * Math.PI * iy) / N)
      }
    }

    // Compute energy in real space: E = sum over sites of [0.5*pi^2 + 0.5*m^2*phi^2 + 0.5*|grad phi|^2]
    let realEnergy = 0
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const idx = iy * N + ix
        const p = pi[idx]!
        const f = phi[idx]!
        realEnergy += 0.5 * p * p + 0.5 * mass * mass * f * f

        // Gradient energy (periodic boundary)
        const ixp = (ix + 1) % N
        const iyp = (iy + 1) % N
        const dPhiX = phi[iy * N + ixp]! - f
        const dPhiY = phi[iyp * N + ix]! - f
        realEnergy += (0.5 * (dPhiX * dPhiX + dPhiY * dPhiY)) / (spacing[0]! * spacing[0]!)
      }
    }

    // Compute energy in k-space: E_k = sum_k (n_k + 0.5) * omega_k
    const phiComplex = new Float64Array(totalSites * 2)
    const piComplex = new Float64Array(totalSites * 2)
    for (let i = 0; i < totalSites; i++) {
      phiComplex[i * 2] = phi[i]!
      piComplex[i * 2] = pi[i]!
    }
    fftNd(phiComplex, gridSize)
    fftNd(piComplex, gridSize)

    let kEnergy = 0
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const i = iy * N + ix
        const omega = computeOmegaK([ix, iy], gridSize, spacing, mass, 2)
        const phiRe = phiComplex[i * 2]!
        const phiIm = phiComplex[i * 2 + 1]!
        const piRe = piComplex[i * 2]!
        const piIm = piComplex[i * 2 + 1]!
        const phiKSq = phiRe * phiRe + phiIm * phiIm
        const piKSq = piRe * piRe + piIm * piIm
        // E_k = (|pi_k|^2 + omega_k^2 * |phi_k|^2) / (2N)
        kEnergy += (piKSq + omega * omega * phiKSq) / (2 * totalSites)
      }
    }

    // Real-space and k-space energies should match
    expect(Math.abs(realEnergy - kEnergy) / Math.max(realEnergy, 1e-10)).toBeLessThan(0.01)
  })
})

describe('computeRawKSpaceData', () => {
  it('uses active dimensions for total site count when latticeDim < gridSize.length', () => {
    const gridSize = [4, 4, 2] as const
    const latticeDim = 2
    const activeTotalSites = 16
    const spacing = [1, 1, 1]
    const phi = new Float32Array(activeTotalSites)
    const pi = new Float32Array(activeTotalSites)

    const raw = computeRawKSpaceData(phi, pi, gridSize, spacing, 0.5, latticeDim)

    expect(raw.totalSites).toBe(activeTotalSites)
    expect(raw.gridSize).toEqual([4, 4])
    expect(raw.nk).toHaveLength(activeTotalSites)
    expect(raw.omega).toHaveLength(activeTotalSites)
  })

  // ─── Adiabatic-vacuum dispatch (Round 2) ──────────────────────────────────

  /**
   * Backward compatibility: the default `dispersion = 'kgFloor'` must produce
   * the pre-adiabatic-thermometer `n_k` values. We use `phi = [1,0,0,0]`,
   * `pi = [0,0,0,0]` so the DFT gives `phi_k = [1,1,1,1]` exactly, which
   * reduces `n_k = 1 / (2·ω_k·N) − 0.5` to a closed form for hand-verification.
   */
  it('preserves pre-adiabatic n_k values under the default "kgFloor" dispersion', () => {
    const gridSize = [4] as const
    const spacing = [1] as const
    const mass = 1
    const latticeDim = 1
    const N = 4

    const phi = new Float32Array([1, 0, 0, 0])
    const pi = new Float32Array([0, 0, 0, 0])

    const raw = computeRawKSpaceData(phi, pi, gridSize, spacing, mass, latticeDim)

    // ω_k² = m² + (2·sin(πk/N))² with m = 1, N = 4, a = 1:
    //   k=0 → ω² = 1          → ω = 1
    //   k=1 → ω² = 1 + 2      → ω = √3
    //   k=2 → ω² = 1 + 4      → ω = √5
    //   k=3 → ω² = 1 + 2      → ω = √3
    // After FFT of [1,0,0,0], phi_k = [1,1,1,1] → |phi_k|² = 1, |pi_k|² = 0.
    // n_k = ω² · 1 / (2·ω·N) − 0.5 = ω / (2·N) − 0.5
    const expectedNk = [
      1 / (2 * N) - 0.5,
      Math.sqrt(3) / (2 * N) - 0.5,
      Math.sqrt(5) / (2 * N) - 0.5,
      Math.sqrt(3) / (2 * N) - 0.5,
    ]
    const expectedOmega = [1, Math.sqrt(3), Math.sqrt(5), Math.sqrt(3)]

    for (let k = 0; k < N; k++) {
      expect(raw.nk[k]!).toBeCloseTo(expectedNk[k]!, 10)
      expect(raw.omega[k]!).toBeCloseTo(expectedOmega[k]!, 10)
    }

    // Explicit pass of the 'kgFloor' tag must yield byte-identical nk/omega.
    const rawExplicit = computeRawKSpaceData(
      phi,
      pi,
      gridSize,
      spacing,
      mass,
      latticeDim,
      'kgFloor'
    )
    for (let k = 0; k < N; k++) {
      expect(rawExplicit.nk[k]!).toBe(raw.nk[k]!)
      expect(rawExplicit.omega[k]!).toBe(raw.omega[k]!)
    }
  })

  it('dispatches to computeOmegaKFromMassSq when dispersion is a finite number', () => {
    const gridSize = [4] as const
    const spacing = [1] as const
    const latticeDim = 1
    const N = 4
    // m = 0 so the default 'kgFloor' would use M_FLOOR for the zero mode;
    // the explicit dispersion = 1.0 must instead compute
    // ω_k² = k_lat² + 1.0 at every site — distinct from the KG path.
    const phi = new Float32Array(N)
    const pi = new Float32Array(N)

    const raw = computeRawKSpaceData(phi, pi, gridSize, spacing, 0, latticeDim, 1.0)

    for (let k = 0; k < N; k++) {
      const expected = computeOmegaKFromMassSq([k], gridSize, spacing, 1.0, latticeDim)
      expect(raw.omega[k]!).toBe(expected)
      // And the KG path on the same geometry with m = 0 should differ
      // (because M_FLOOR² ≠ 1 at the zero mode).
      const kgVal = computeOmegaK([k], gridSize, spacing, 0, latticeDim)
      if (k === 0) {
        expect(raw.omega[k]!).not.toBe(kgVal)
      }
    }
  })
})

describe('computeTotalParticleNumber', () => {
  it('returns the sum of max(nk, 0) for a hand-built raw data object', () => {
    const raw: KSpaceRawData = {
      nk: new Float64Array([-0.4, 0.25, -0.1, 1.5, 0, 0.75]),
      kMag: new Float64Array(6),
      omega: new Float64Array(6),
      nkMax: 1.5,
      kMagMax: 0,
      omegaMax: 0,
      totalSites: 6,
      gridSize: [6],
      strides: [1],
      latticeDim: 1,
      spacing: [1],
    }

    // Only positive entries contribute: 0.25 + 1.5 + 0 + 0.75 = 2.5
    expect(computeTotalParticleNumber(raw)).toBe(2.5)
  })

  it('returns zero when every n_k is non-positive', () => {
    const raw: KSpaceRawData = {
      nk: new Float64Array([-0.5, -0.1, -1, 0]),
      kMag: new Float64Array(4),
      omega: new Float64Array(4),
      nkMax: 0,
      kMagMax: 0,
      omegaMax: 0,
      totalSites: 4,
      gridSize: [4],
      strides: [1],
      latticeDim: 1,
      spacing: [1],
    }
    expect(computeTotalParticleNumber(raw)).toBe(0)
  })

  it('recovers the exact seed=42 KG-vacuum particle count on a 32-site 1D lattice', () => {
    // Regression pin for the end-to-end vacuum → FFT → n_k → total
    // particles pipeline. The free-field vacuum is a Gaussian with
    // `E[n_k] = 0`, `Var[n_k] = O(1)`; the `max(·,0)` clamp retains
    // roughly half the Gaussian per mode, so the expected total sits
    // around 5–6 particles for a 32-site 1D m=1 lattice. Seed 42 lands
    // at a specific value determined entirely by (seed, lattice, mass,
    // dispersion) — any change to the vacuum sampler, FFT convention,
    // or `n_k` formula shows up as a mismatch here, which is exactly
    // what a regression pin exists to catch.
    //
    // A loose `< totalSites` bound previously stood in for this check
    // but silently tolerated ~10× drift from the true value.
    const config = makeKSpaceFsfConfig()
    const { phi, pi } = sampleVacuumSpectrum(config, 42, 'kgFloor')
    const raw = computeRawKSpaceData(
      phi,
      pi,
      config.gridSize,
      config.spacing,
      config.mass,
      config.latticeDim
    )
    const totalParticles = computeTotalParticleNumber(raw)

    // Exact seed-specific value pinned by the vacuum sampler + the
    // `computeKSpaceOccupationInnerLoop` kernel. Tolerance 1e-10
    // absorbs roundoff in the sqrt → divide chain but rejects any
    // change that materially shifts the sampled mode energies.
    expect(totalParticles).toBeCloseTo(6.141638251073341, 10)

    // Defense in depth — the pinned value already implies these, but
    // we assert them separately so a seed-regen bug would still leave
    // the non-negativity contract under test.
    expect(totalParticles).toBeGreaterThanOrEqual(0)
    expect(totalParticles).toBeLessThan(config.gridSize[0]! / 2)
  })

  it('vacuum particle counts stay non-negative and sub-thermal across a seed spread', () => {
    // Complement to the exact seed=42 pin: verify the physical-contract
    // invariants (non-negative, well below one particle per mode on
    // average) hold across a spread of seeds so a sign-flip regression
    // in the inner loop is caught even on non-pinned draws.
    const config = makeKSpaceFsfConfig()
    for (const seed of [1, 2, 3, 7, 11, 13, 17, 23, 101]) {
      const { phi, pi } = sampleVacuumSpectrum(config, seed, 'kgFloor')
      const raw = computeRawKSpaceData(
        phi,
        pi,
        config.gridSize,
        config.spacing,
        config.mass,
        config.latticeDim
      )
      const totalParticles = computeTotalParticleNumber(raw)
      expect(totalParticles).toBeGreaterThanOrEqual(0)
      // Empirically across 10 seeds the spread at N=32, m=1 is [2.6, 10.4]
      // so `< N/2 = 16` is tight enough to catch regressions while still
      // wider than Gaussian sampling variance — a genuinely thermal
      // regression would produce `≫ N/2`.
      expect(totalParticles).toBeLessThan(config.gridSize[0]! / 2)
    }
  })
})

describe('cosmological adiabatic-vacuum particle thermometer (integration)', () => {
  it('Minkowski adiabatic vacuum produces the same N(η) as cosmology-disabled', () => {
    // Contract anchor for the Minkowski short-circuit in
    // `sampleAdiabaticVacuum`: for any η, the particle number measured
    // against a Minkowski adiabatic vacuum must equal the particle
    // number measured against the `'kgFloor'` vacuum, byte-for-byte.
    const config = makeKSpaceFsfConfig()
    const { phi: phiMinkowski, pi: piMinkowski } = sampleAdiabaticVacuum(
      config,
      { preset: 'minkowski', spacetimeDim: 2 },
      -5,
      101
    )
    const { phi: phiKG, pi: piKG } = sampleVacuumSpectrum(config, 101, 'kgFloor')

    // Both samplers must agree at the buffer level (the Minkowski
    // adiabatic path IS the kgFloor sampler per the `sampleAdiabaticVacuum`
    // short-circuit at adiabaticVacuum.ts:205).
    expect(phiMinkowski).toEqual(phiKG)
    expect(piMinkowski).toEqual(piKG)

    // Downstream — the total particle number measured against the
    // static KG vacuum must also land identically.
    const rawAdiabatic = computeRawKSpaceData(
      phiMinkowski,
      piMinkowski,
      config.gridSize,
      config.spacing,
      config.mass,
      config.latticeDim
    )
    const rawKg = computeRawKSpaceData(
      phiKG,
      piKG,
      config.gridSize,
      config.spacing,
      config.mass,
      config.latticeDim
    )
    expect(computeTotalParticleNumber(rawAdiabatic)).toBe(computeTotalParticleNumber(rawKg))
  })

  it('de Sitter particle number grows as |η| shrinks (inflationary particle creation)', () => {
    // Physics contract: a massive scalar field in an inflating de Sitter
    // background accumulates particles as `|η|` shrinks (the comoving
    // observer is pulled further from the initial adiabatic vacuum).
    // Measured against the INITIAL vacuum state, the particle number
    // `N(η) = Σ max(n_k, 0)` is therefore monotonically non-decreasing
    // along the expansion. We set up an initial vacuum at η₀ = −10 and
    // evaluate `N(η)` at η ∈ {−10, −5, −2, −1, −0.5} using the same
    // initial field samples — the vacuum reference `ω_k² = k²+m²·a²(η)`
    // changes per evaluation while the field stays fixed, which is
    // exactly the definition of the adiabatic-vacuum particle count.
    //
    // At η = η₀ = −10 the field IS the vacuum so N ≈ 0. At later
    // (|η| smaller) times it must grow monotonically; we also pin a
    // strict positivity at the latest evaluation point.
    const base = makeKSpaceFsfConfig()
    const config: FreeScalarConfig = {
      ...base,
      // 3D lattice so de Sitter spacetimeDim = 4 is the textbook case.
      latticeDim: 3,
      gridSize: [16, 16, 16],
      spacing: [1, 1, 1],
      mass: 1,
      cosmology: {
        enabled: true,
        preset: 'deSitter',
        steepness: 5,
        hubble: 1,
        eta0: -10,
      },
    }
    const cosmoParams = {
      preset: 'deSitter' as const,
      spacetimeDim: config.latticeDim + 1,
      hubble: config.cosmology.hubble,
      steepness: config.cosmology.steepness,
    }

    // Draw a single adiabatic vacuum sample at η₀ = −10.
    const { phi, pi } = sampleAdiabaticVacuum(config, cosmoParams, config.cosmology.eta0, 7)

    // Evaluate N(η) at a spread of later times using the shared
    // dispersion helper so this test also exercises the production
    // `FreeScalarFieldKSpace → worker` pipeline, including the
    // canonical-basis `(aKinetic, aPotential)` rescale that the
    // thermometer needs to read an unbiased particle count.
    const etaEval = [-10, -5, -2, -1, -0.5]
    const totals = etaEval.map((eta) => {
      const cfgEta: FreeScalarConfig = { ...config, cosmology: { ...config.cosmology, eta0: eta } }
      const dispersion = computeFsfVacuumDispersion(cfgEta, eta)
      const cosmoCoefs = computeFsfCosmologyCoefs(cfgEta, eta)
      const raw = computeRawKSpaceData(
        phi,
        pi,
        cfgEta.gridSize,
        cfgEta.spacing,
        cfgEta.mass,
        cfgEta.latticeDim,
        dispersion,
        { aKinetic: cosmoCoefs.aKinetic, aPotential: cosmoCoefs.aPotential }
      )
      return computeTotalParticleNumber(raw)
    })

    // N(η₀) sits at the Gaussian sampling noise floor of the clamped
    // particle-number estimator, not at zero. Each mode contributes
    // n_k with mean 0 and variance 1/8 (Gamma(2, 1/4) minus 1/2), so
    // per-mode E[max(n_k, 0)] ≈ e⁻² ≈ 0.135, giving an expected floor
    // of 4096 · 0.135 ≈ 554 for this lattice. Before the canonical-
    // basis fix the Minkowski formula produced a systematic (B+1/B)/4
    // − 1/2 bias per mode, inflating the readout to ~101,582 — so a
    // bound around ~1000 fails loudly on regression while tolerating
    // ordinary sampling variance across seeds.
    expect(totals[0]!).toBeGreaterThan(300)
    expect(totals[0]!).toBeLessThan(1000)

    // Strictly monotonically increasing along the expansion — the
    // reference adiabatic vacuum is updated at each η while the field
    // stays fixed, so the field drifts farther from the local ground
    // state. Strict inequality catches any regression that would
    // flatten the particle-creation signal into the noise.
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]!).toBeGreaterThan(totals[i - 1]!)
    }

    // The late-time signal must be orders of magnitude above the
    // initial noise floor — observed seed-specific ratio is ~988×.
    // A 100× lower bound is loose enough to survive seed variance
    // but tight enough that any regression killing the particle-
    // creation signal (e.g. dispersion helper freezing at η₀)
    // would fail here.
    expect(totals[totals.length - 1]!).toBeGreaterThan(100 * totals[0]!)
  })

  it('resolveVacuumDispersion and computeRawKSpaceData agree end-to-end on every preset', () => {
    // Integration anchor for the UI → FsfKSpaceManager → worker →
    // computeRawKSpaceData pipeline: the dispersion tag returned by
    // `computeFsfVacuumDispersion` must be the exact value the k-space
    // kernel consumes. The contract is already verified piecewise in
    // `vacuumDispersion.test.ts`, but this test walks the full stack
    // on each preset so a silent ordering flip in either layer shows
    // up here.
    const base = makeKSpaceFsfConfig()
    const config: FreeScalarConfig = {
      ...base,
      latticeDim: 3,
      gridSize: [8, 8, 8],
      spacing: [1, 1, 1],
      mass: 0.5,
    }

    for (const preset of ['minkowski', 'deSitter', 'kasner', 'ekpyrotic'] as const) {
      const cfg: FreeScalarConfig = {
        ...config,
        cosmology: {
          enabled: true,
          preset,
          steepness: 5,
          hubble: 1,
          eta0: -5,
        },
      }
      const dispersion = computeFsfVacuumDispersion(cfg, cfg.cosmology.eta0)
      // All four presets are valid at spacetimeDim=4, so only Minkowski
      // returns 'kgFloor'. The others resolve to a finite m²·a²(η₀).
      if (preset === 'minkowski') {
        expect(dispersion).toBe('kgFloor')
      } else {
        if (dispersion === 'kgFloor') {
          throw new Error(`preset ${preset} fell back to kgFloor`)
        }
        expect(dispersion).toBeGreaterThan(0)
      }

      // The worker path consumes the tag as-is; mirror that here.
      const phi = new Float32Array(8 ** 3)
      const pi = new Float32Array(8 ** 3)
      const raw = computeRawKSpaceData(
        phi,
        pi,
        cfg.gridSize,
        cfg.spacing,
        cfg.mass,
        cfg.latticeDim,
        dispersion
      )
      // Zero field → total particle number clamps to zero everywhere.
      expect(computeTotalParticleNumber(raw)).toBe(0)
      // Raw outputs must have the expected shape.
      expect(raw.totalSites).toBe(512)
      expect(raw.nk.length).toBe(512)
    }
  })
})

/** Deterministic 32-site 1D FSF config used by the vacuum-particle tests. */
function makeKSpaceFsfConfig(): FreeScalarConfig {
  return {
    latticeDim: 1,
    gridSize: [32],
    spacing: [1],
    mass: 1,
    dt: 0.01,
    stepsPerFrame: 1,
    initialCondition: 'vacuumNoise',
    packetCenter: [0],
    packetWidth: 0.25,
    packetAmplitude: 1,
    modeK: [0],
    fieldView: 'phi',
    autoScale: true,
    needsReset: false,
    vacuumSeed: 42,
    selfInteractionEnabled: false,
    selfInteractionLambda: 0.5,
    selfInteractionVev: 1.0,
    absorberEnabled: false,
    absorberWidth: 0.2,
    pmlTargetReflection: 1e-6,
    diagnosticsEnabled: false,
    diagnosticsInterval: 60,
    slicePositions: [],
    kSpaceViz: {
      displayMode: 'raw3d',
      fftShiftEnabled: true,
      lowPercentile: 1,
      highPercentile: 99,
      gamma: 1,
      exposureMode: 'linear',
      broadeningEnabled: false,
      broadeningRadius: 2,
      broadeningSigma: 1,
      radialBinCount: 64,
    },
    cosmology: {
      enabled: false,
      preset: 'minkowski',
      steepness: 5,
      hubble: 1,
      eta0: -10,
    },
    preheating: {
      enabled: false,
      amplitude: 0.3,
      frequency: 2.0,
    },
  }
}
