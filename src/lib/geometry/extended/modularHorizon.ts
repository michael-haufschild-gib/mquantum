import { INNER_RADIUS, OUTER_RADIUS, REFERENCE_RADIUS } from '@/lib/physics/modularHorizon/exterior'

/** Named launch states and the editable custom state. */
export type HorizonPreset = 'silentReturn' | 'exactBeat' | 'fadingReturn' | 'custom'
/** Nonnegative relative probabilities in ascending spectral order. */
export type HorizonWeights = [number, number, number]

/** Serializable modular horizon state in intrinsic coordinates. */
export interface ModularHorizonConfig {
  preset: HorizonPreset
  weights: HorizonWeights
  raw: boolean
  tessellation: boolean
  /** Intrinsic coordinates in the unfolded disk. */
  pin: [number, number]
  width: number
  probeRadius: number
  cutaway: boolean
}

export const HORIZON_SCENARIOS = [
  {
    id: 'silentReturn',
    label: 'Silent Return',
    description: 'Three equal populations approach their launch state again.',
  },
  {
    id: 'exactBeat',
    label: 'Exact Beat',
    description: 'Two frequencies give a periodic return up to global phase.',
  },
  {
    id: 'fadingReturn',
    label: 'Fading Return',
    description: 'Recover the angular pattern under a decaying gravitational envelope.',
  },
] as const

/** Construct an independent launch state for a scenario. */
export function horizonPreset(preset: Exclude<HorizonPreset, 'custom'>): ModularHorizonConfig {
  return {
    preset,
    weights: [1, 1, preset === 'exactBeat' ? 0 : 1],
    raw: preset === 'fadingReturn',
    tessellation: true,
    pin: [0, 0],
    width: 0,
    probeRadius: REFERENCE_RADIUS,
    cutaway: false,
  }
}

/** Normalize persisted or URL-supplied values before field evaluation. */
export function validHorizon(config: unknown): ModularHorizonConfig {
  const d = horizonPreset('silentReturn')
  if (!config || typeof config !== 'object') return d
  const c = config as Partial<ModularHorizonConfig>
  const w = c.weights
  const p = c.pin
  return {
    preset:
      c.preset === 'custom' || HORIZON_SCENARIOS.some((s) => s.id === c.preset)
        ? c.preset!
        : d.preset,
    weights:
      Array.isArray(w) &&
      w.length === 3 &&
      w.every((v) => Number.isFinite(v) && v >= 0 && v <= 1) &&
      w.some((v) => v > 0)
        ? [...w]
        : d.weights,
    pin:
      Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.hypot(...p) < 1
        ? [...p]
        : d.pin,
    width:
      typeof c.width === 'number' && Number.isFinite(c.width)
        ? Math.max(0, Math.min(1, c.width))
        : d.width,
    probeRadius:
      typeof c.probeRadius === 'number' && Number.isFinite(c.probeRadius)
        ? Math.max(INNER_RADIUS, Math.min(OUTER_RADIUS, c.probeRadius))
        : d.probeRadius,
    cutaway: c.cutaway === true,
    raw: c.raw === true,
    tessellation: c.tessellation !== false,
  }
}
