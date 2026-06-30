/**
 * Mode 3 — The Forced Cell (`forcedCell`).
 *
 * Berry–Keating made literal. The dilation Hamiltonian H = ½(xp + px) generates
 * the semiclassical orbits xp = E — hyperbolae in the (x, p) phase plane. Weyl
 * quantization tiles that plane into rigid Planck cells of area 2πℏ: this is the
 * *only* permitted tiling, the cells the spectrum has no choice but to occupy.
 * The mode renders a 3D "loom": (x, p) span the horizontal plane and the
 * quantized energy levels stack along the vertical axis. At each level z_n we
 * draw the hyperbola x·p = E_n as a glowing arc, where the E_n are the first N
 * Riemann-zero ordinates t_n — the Berry–Keating conjectural spectrum. Beneath
 * the arcs a faint, perfectly regular Planck-cell lattice fills the floor: the
 * forced cells of the phase-space quantization.
 *
 * @module lib/geometry/extended/wdwZeta/forcedCell
 */

import type { WdwZetaScenario } from './shared'

/** Named preset identifiers for the Forced Cell mode. */
export type ForcedCellPresetName =
  | 'berryKeating'
  | 'cellWalls'
  | 'squeezedVacuum'
  | 'denseLoom'
  | 'wideStrip'
  | 'conjugateCell4D'
  | 'custom'

/**
 * Serializable Forced Cell config (stored on `SchroedingerConfig.forcedCell`).
 * Every field is bake-affecting (changes the stacked hyperbolae or the Planck
 * lattice); emission/glow is the shared Advanced control and is NOT here.
 */
export interface ForcedCellConfig {
  /** Number of stacked quantized levels (hyperbolae) N ∈ [4, 40]; E_n = t_n. */
  levelCount: number
  /** Planck-cell grid fineness (cells per axis) ∈ [4, 24] — the forced tiling. */
  cellDensity: number
  /** Half-extent of the rendered (x, p) window in log units ∈ [0.6, 1.6]; spreads the hyperbolae. */
  xExtent: number
  /** TDSE squeeze parameter r ∈ [0, 1.5]: symplectic squeeze (x,p)→(x·e^{−r}, p·e^{r}) deforming the minimum-uncertainty cells into tilted ellipses (xp invariant). */
  squeeze: number
  /** Height ∈ [0, 1] of the 3D Planck-cell wall lattice rising from the floor; 0 = flat floor. */
  wallHeight: number
  /** Preset identifier; `custom` = user-edited. */
  preset: ForcedCellPresetName
}

/** Clamp ranges for every numeric ForcedCellConfig scalar. */
export const FORCED_CELL_RANGES = {
  levelCount: { min: 4, max: 40 },
  cellDensity: { min: 4, max: 24 },
  xExtent: { min: 0.6, max: 1.6 },
  squeeze: { min: 0, max: 1.5 },
  wallHeight: { min: 0, max: 1 },
} as const

/** Default config — matches the `berryKeating` preset. */
export const DEFAULT_FORCED_CELL_CONFIG: ForcedCellConfig = {
  levelCount: 18,
  cellDensity: 12,
  xExtent: 1.1,
  squeeze: 0,
  wallHeight: 0,
  preset: 'berryKeating',
}

/** One Forced Cell scenario (config minus the preset tag). */
export type ForcedCellPresetValues = Omit<ForcedCellConfig, 'preset'>

/** Scenario presets (≥ 2 required). */
export const FORCED_CELL_PRESETS: Readonly<
  Record<Exclude<ForcedCellPresetName, 'custom'>, ForcedCellPresetValues>
> = {
  /** The canonical loom: 18 levels = the first 18 ζ-zero heights, mid lattice. */
  berryKeating: {
    levelCount: 18,
    cellDensity: 12,
    xExtent: 1.1,
    squeeze: 0,
    wallHeight: 0,
  },
  /** The forced cells raised into a 3D Planck-cell wall lattice beneath the loom. */
  cellWalls: {
    levelCount: 14,
    cellDensity: 10,
    xExtent: 1.1,
    squeeze: 0,
    wallHeight: 0.7,
  },
  /** A squeezed vacuum: the symplectic squeeze tilts and stretches the hyperbola tubes. */
  squeezedVacuum: {
    levelCount: 16,
    cellDensity: 12,
    xExtent: 1.2,
    squeeze: 1.1,
    wallHeight: 0,
  },
  /** A tall, fine loom: many levels with a dense Planck floor. */
  denseLoom: {
    levelCount: 32,
    cellDensity: 20,
    xExtent: 1.0,
    squeeze: 0,
    wallHeight: 0,
  },
  /** A wide-window loom: fewer levels, broad hyperbolae filling the box. */
  wideStrip: {
    levelCount: 10,
    cellDensity: 8,
    xExtent: 1.5,
    squeeze: 0,
    wallHeight: 0,
  },
  /** 4D conjugate loom (dimension 4): the canonical loom, opened to its second phase pair. */
  conjugateCell4D: {
    levelCount: 16,
    cellDensity: 12,
    xExtent: 1.1,
    squeeze: 0,
    wallHeight: 0,
  },
}

/** Ordered scenario list for the shared ScenarioSelector. */
export const FORCED_CELL_SCENARIOS: readonly WdwZetaScenario<
  Exclude<ForcedCellPresetName, 'custom'>
>[] = [
  {
    id: 'berryKeating',
    label: 'Berry–Keating',
    description:
      'The dilation loom. The (x, p) plane lies flat; the quantized energy levels E_n = t_n (the first 18 Riemann-zero ordinates) stack up the vertical axis as glowing hyperbolae x·p = E_n. The phase plane is tiled into rigid Planck cells of area 2πℏ — the only permitted tiling. A fanned stack of hyperbolic arcs receding in depth, gridded by the forced cells.',
  },
  {
    id: 'cellWalls',
    label: 'Cell Walls',
    description:
      'The "forced cells" lifted off the floor into a literal 3D Planck-cell wall lattice — a square grid of luminous partitions of area 2πℏ rising under the stacked hyperbolae. Weyl quantization tiles the (x, p) plane into exactly these cells and no finer; here you see them as the chambered scaffold the dilation spectrum is forced to inhabit.',
  },
  {
    id: 'squeezedVacuum',
    label: 'Squeezed Vacuum',
    description:
      'A TDSE squeezed coherent state laid over the loom: the symplectic squeeze (x, p) → (x·e^{−r}, p·e^{r}) stretches one phase-axis and compresses the other, tilting and elongating every hyperbola tube. The product x·p — and the cell area — are invariant, so the spectrum is untouched; only the minimum-uncertainty cell is deformed into a tilted ellipse. The constraint bends without breaking.',
  },
  {
    id: 'denseLoom',
    label: 'Dense Loom',
    description:
      'A tall, finely-woven loom: 32 stacked levels climbing far up the spectrum, over a dense Planck-cell floor. The hyperbolae crowd together toward high energy exactly as the Riemann zeros do — the rigid ladder has no spacing freedom.',
  },
  {
    id: 'wideStrip',
    label: 'Wide Strip',
    description:
      'A broad-window loom: only the first 10 levels, but a wide (x, p) extent so each hyperbola sweeps the full box. The Planck lattice is coarse, every cell plainly visible — the quantization grain you cannot subdivide below 2πℏ.',
  },
  {
    id: 'conjugateCell4D',
    label: '4D Conjugate Loom',
    description:
      'The forced cell in four dimensions. Quantizing a 4D phase space needs TWO area quanta of 2πℏ — the Planck 4-cell — so the dilation loom acquires a second family of hyperbolae x·p₂ = Eₙ in the conjugate (x, W) plane, the same ζ-zero spectrum woven a second time. At rest the original loom is unchanged; rotating the X–W plane materializes the cool conjugate loom, the two families crossing into the rigid 4-cell tiling the spectrum has no freedom to refuse. Opens at dimension 4.',
    dimension: 4,
    rotation: { XW: 0.6 },
  },
]
