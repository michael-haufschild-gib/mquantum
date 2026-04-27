/**
 * Named presets for the Anti-de Sitter bound-state mode.
 *
 * Each preset is a curated (d, n, ℓ, m, mL, branch, boundaryOverlay) tuple
 * illustrating a distinct physical regime:
 *   - Ground-state / conformal / multipole states across d = 4.
 *   - Radial / mixed excitations across d = 4.
 *   - Three-dimensional states covering the standard, Klebanov-Witten, and
 *     tachyonic branches.
 *   - Higher-dimensional SUGRA-style towers (d = 5, 6, 7).
 *   - A heavy-primary and a cosine-node state for visual contrast.
 */

import type {
  AdsHkllSource,
  AdsPresetName,
  AdsQuantizationBranch,
} from '@/lib/geometry/extended/antiDeSitter'

/** Preset scalar payload — the strategy applies these onto `AntiDeSitterConfig`.
 *
 * BTZ-specific fields (`btzEnabled`, `btzHorizonRadius`, `btzOmega`,
 * `btzAngularM`) are optional. When undefined the `setAdsPreset` helper
 * resets them to the default (`btzEnabled: false`, defaults for the rest).
 * That lets the existing 15 bound-state presets stay untouched while the
 * three new BTZ presets opt in explicitly.
 */
export interface AdsPresetDefinition {
  id: Exclude<AdsPresetName, 'custom'>
  label: string
  description: string
  d: number
  n: number
  l: number
  m: number
  mL: number
  branch: AdsQuantizationBranch
  boundaryOverlay: boolean
  btzEnabled?: boolean
  btzHorizonRadius?: number
  btzOmega?: number
  btzAngularM?: number
  // Stage 2B — HKLL sub-block. Optional so legacy presets stay concise.
  hkllEnabled?: boolean
  hkllBoundarySource?: AdsHkllSource
  hkllSourceSigma?: number
  hkllPlaneWaveM?: number
}

/**
 * Full catalogue of AdS presets surfaced in the UI dropdown. Order is UI-stable.
 */
export const ADS_PRESETS: readonly AdsPresetDefinition[] = [
  {
    id: 'adsFourGround',
    label: 'AdS₄ Ground',
    description: 'Massless scalar ground state in AdS₄ (Δ = 3, E = 3).',
    d: 4,
    n: 0,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
  },
  {
    id: 'adsFourConformal',
    label: 'AdS₄ Conformal (Δ = 2)',
    description: 'Near-BF scalar Δ = 2 in AdS₄ (m²L² = −2, inside Klebanov–Witten window).',
    d: 4,
    n: 0,
    l: 0,
    m: 0,
    mL: -Math.sqrt(2),
    branch: 'standard',
    boundaryOverlay: true,
  },
  {
    id: 'adsFourDipole',
    label: 'AdS₄ Dipole (ℓ=1)',
    description: 'ℓ=1, m=0 dipole in AdS₄ (pz-like lobes in the Poincaré ball).',
    d: 4,
    n: 0,
    l: 1,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
  },
  {
    id: 'adsFourQuadrupole',
    label: 'AdS₄ Quadrupole (ℓ=2)',
    description: 'ℓ=2, m=0 d-like quadrupole state.',
    d: 4,
    n: 0,
    l: 2,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
  },
  {
    id: 'adsFourRadialExcited',
    label: 'AdS₄ Radial Excited (n=2)',
    description: 'Radially excited ℓ=0 state with two radial nodes.',
    d: 4,
    n: 2,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
  },
  {
    id: 'adsFourMixed',
    label: 'AdS₄ Mixed (n=1, ℓ=1)',
    description: 'Mixed radial+angular excitation with a ring node.',
    d: 4,
    n: 1,
    l: 1,
    m: 1,
    mL: 0.5,
    branch: 'standard',
    boundaryOverlay: true,
  },
  {
    id: 'adsThreeGround',
    label: 'AdS₃ Ground',
    description: 'Massless scalar ground in AdS₃ / BTZ bulk (Δ = 2).',
    d: 3,
    n: 0,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
  },
  {
    id: 'adsThreeAlternate',
    label: 'AdS₃ Alternate (Δ₋)',
    description: 'Klebanov-Witten window demo — Δ_− quantization in AdS₃.',
    d: 3,
    n: 0,
    l: 0,
    m: 0,
    mL: -Math.sqrt(0.7),
    branch: 'alternate',
    boundaryOverlay: true,
  },
  {
    id: 'adsThreeTachyon',
    label: 'AdS₃ Tachyon',
    description: 'Below-BF state in AdS₃ (m²L² = −1.21 < −1); grows in time.',
    d: 3,
    n: 0,
    l: 0,
    m: 0,
    mL: -1.1,
    branch: 'standard',
    boundaryOverlay: false,
  },
  {
    id: 'adsFiveSUGRA',
    label: 'AdS₅ SUGRA',
    description: 'Type-IIB SUGRA-like massless scalar in AdS₅ (Δ = 4).',
    d: 5,
    n: 0,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: true,
  },
  {
    id: 'adsFiveKKTower',
    label: 'AdS₅ KK Tower (n=1)',
    description: 'First Kaluza-Klein excitation on S⁵ projected into AdS₅.',
    d: 5,
    n: 1,
    l: 1,
    m: 0,
    mL: 1,
    branch: 'standard',
    boundaryOverlay: false,
  },
  {
    id: 'adsSixHigh',
    label: 'AdS₆ High-ℓ',
    description: 'Six-dimensional AdS with ℓ=3, m=2 — rich angular structure.',
    d: 6,
    n: 0,
    l: 3,
    m: 2,
    mL: 0.5,
    branch: 'standard',
    boundaryOverlay: false,
  },
  {
    id: 'adsSevenSUGRA',
    label: 'AdS₇ SUGRA',
    description: 'M5-brane worldvolume SUGRA scalar in AdS₇.',
    d: 7,
    n: 0,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: true,
  },
  {
    id: 'adsFourHeavyPrimary',
    label: 'AdS₄ Heavy Primary',
    description: 'Large-Δ primary (mL = 3, Δ ≈ 4.85) — sharp cosine profile.',
    d: 4,
    n: 0,
    l: 0,
    m: 0,
    mL: 3,
    branch: 'standard',
    boundaryOverlay: true,
  },
  {
    id: 'adsFourCosineNode',
    label: 'AdS₄ Cosine Node',
    description: 'n=3, ℓ=0 state — three radial zeros illustrate Jacobi nodes.',
    d: 4,
    n: 3,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
  },
  {
    id: 'btzHotSmall',
    label: 'BTZ Small Horizon',
    description:
      'd=3 BTZ black hole with small horizon r₊=0.15 — lower Hawking temperature, compact visible horizon, and a sharp regulated near-horizon thermal spike.',
    d: 3,
    n: 0,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
    btzEnabled: true,
    btzHorizonRadius: 0.15,
    btzOmega: 1.0,
    btzAngularM: 0,
  },
  {
    id: 'btzWarmMedium',
    label: 'BTZ Medium Horizon',
    description:
      'd=3 BTZ with r₊=0.6 and angular mode m_A=1 — moderate T and visible azimuthal lobes.',
    d: 3,
    n: 0,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
    btzEnabled: true,
    btzHorizonRadius: 0.6,
    btzOmega: 1.2,
    btzAngularM: 1,
  },
  {
    id: 'btzCoolLarge',
    label: 'BTZ Large Horizon',
    description:
      'd=3 BTZ with r₊=1.5 — higher Hawking temperature and a large visible horizon that dominates the rendered region.',
    d: 3,
    n: 0,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
    btzEnabled: true,
    btzHorizonRadius: 1.5,
    btzOmega: 0.5,
    btzAngularM: 0,
  },
  // ── Stage 2B: HKLL bulk-from-boundary reconstruction ──────────────────
  {
    id: 'hkllEigenstateCheck',
    label: 'HKLL Eigenstate Check (AdS₄)',
    description:
      'AdS₄ dipole (n=0, ℓ=1, m=0) reconstructed from its own boundary asymptotic via the HKLL smearing kernel. Validates reconstruction reproduces the exact bulk.',
    d: 4,
    n: 0,
    l: 1,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
    hkllEnabled: true,
    hkllBoundarySource: 'eigenstate',
    hkllSourceSigma: 0.3,
    hkllPlaneWaveM: 2,
  },
  {
    id: 'hkllBoundarySpot',
    label: 'HKLL Boundary Spot',
    description:
      'Localized Gaussian excitation on the AdS₄ boundary (σ=0.25 rad); HKLL smearing produces a bulk beam emerging from the spot.',
    d: 4,
    n: 0,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
    hkllEnabled: true,
    hkllBoundarySource: 'localized',
    hkllSourceSigma: 0.25,
    hkllPlaneWaveM: 2,
  },
  {
    id: 'hkllBoundaryPlaneWave',
    label: 'HKLL Boundary Plane Wave',
    description:
      'Azimuthal boundary standing wave m_b=3 on AdS₄; HKLL smearing reconstructs the m-dependent bulk pattern.',
    d: 4,
    n: 0,
    l: 0,
    m: 0,
    mL: 0,
    branch: 'standard',
    boundaryOverlay: false,
    hkllEnabled: true,
    hkllBoundarySource: 'planeWave',
    hkllSourceSigma: 0.3,
    hkllPlaneWaveM: 3,
  },
]

/** O(1) lookup from preset id to definition. */
export const ADS_PRESET_MAP: Readonly<
  Record<Exclude<AdsPresetName, 'custom'>, AdsPresetDefinition>
> = Object.freeze(
  Object.fromEntries(ADS_PRESETS.map((p) => [p.id, p])) as Record<
    Exclude<AdsPresetName, 'custom'>,
    AdsPresetDefinition
  >
)
