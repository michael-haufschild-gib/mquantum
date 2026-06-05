/**
 * CPU reference for the quantum-walk Floquet CTC fractal-carpet field.
 *
 * Mirrors the write-grid shader's bounded folded return map so unit tests can
 * validate the scalar without WebGPU readback.
 *
 * @module lib/physics/quantumWalk/ctcFractalCarpet
 */

const TAU = Math.PI * 2
const INV_TAU = 1 / TAU
const EPS = 1e-20
const CTC_PERIOD = 512
const CTC_ITERATIONS = 6

/** Inputs required to evaluate one renderer-local CTC carpet sample. */
export interface CtcFractalCarpetInput {
  probability: number
  maxDensity: number
  phase: number
  chirality: number
  walkSteps: number
  latticeDim: number
  gridSize: readonly number[]
  coords: readonly number[]
  perpendicularFalloff?: number
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function fract(value: number): number {
  return value - Math.floor(value)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function fold01(value: number): number {
  return Math.abs(fract(value) * 2 - 1)
}

function loopDistance01(value: number): number {
  const f = fract(value)
  return Math.min(f, 1 - f)
}

function normalizedVisibleCoord(input: CtcFractalCarpetInput, axis: number): number {
  if (axis >= input.latticeDim) return 0
  const grid = Math.max(2, Math.floor(input.gridSize[axis] ?? 2))
  const coord = Math.max(0, Math.min(grid - 1, Math.round(input.coords[axis] ?? 0)))
  return (coord / (grid - 1)) * 2 - 1
}

/**
 * Compute the bounded CTC fractal-carpet scalar used by the QW write-grid pass.
 */
export function ctcFractalCarpetScalar(input: CtcFractalCarpetInput): number {
  if (!Number.isFinite(input.probability) || input.probability <= 0) return 0

  const maxDensity = Math.max(Number.isFinite(input.maxDensity) ? input.maxDensity : 0, EPS)
  const falloff = clamp01(input.perpendicularFalloff ?? 1)
  const rho = clamp01((input.probability / maxDensity) * falloff)
  if (rho <= 0) return 0

  const phase01 = fract((Number.isFinite(input.phase) ? input.phase : 0) * INV_TAU)
  const chirality = Math.max(
    -1,
    Math.min(1, Number.isFinite(input.chirality) ? input.chirality : 0)
  )
  const safeSteps = Number.isFinite(input.walkSteps) ? Math.max(0, Math.floor(input.walkSteps)) : 0
  const stepPhase = (safeSteps % CTC_PERIOD) / CTC_PERIOD
  const phaseStep = phase01 * 0.35 + stepPhase * 0.18

  let qx = normalizedVisibleCoord(input, 0)
  let qy = normalizedVisibleCoord(input, 1)
  let qz = normalizedVisibleCoord(input, 2)
  let closure = 0

  for (let i = 0; i < CTC_ITERATIONS; i++) {
    const iter = i + 1
    qx = fold01(qx * (1.72 + 0.11 * iter) + 0.137 * iter + phaseStep + chirality * 0.083)
    qy = fold01(qy * (2.03 + 0.09 * iter) + 0.311 * iter + phaseStep - chirality * 0.047)
    qz = fold01(qz * (2.37 + 0.07 * iter) + 0.571 * iter + phaseStep + chirality * 0.061)

    const dx = qx - 0.5
    const dy = qy - 0.5
    const dz = qz - 0.5
    const radial = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const shell = 0.48 + 0.14 * Math.cos(TAU * (phaseStep * 0.5 + iter * 0.137))
    const shellScore = 1 - smoothstep(0.014, 0.065, Math.abs(radial - shell))

    const winding = qx - qy + 0.5 * qz
    const phaseScore = 1 - smoothstep(0.02, 0.18, loopDistance01(winding + phaseStep))
    const chiralityScore =
      1 - smoothstep(0.08, 0.65, Math.abs(chirality - Math.max(-1, Math.min(1, winding))))
    const threadScore = 1 - smoothstep(0.008, 0.055, Math.min(Math.abs(qx - qy), Math.abs(qy - qz)))

    closure = Math.max(
      closure,
      shellScore * (0.18 + 0.82 * phaseScore) * (0.35 + 0.65 * chiralityScore),
      threadScore * phaseScore * (0.28 + 0.72 * chiralityScore)
    )
  }

  const densityEnvelope = Math.pow(rho, 0.72) * smoothstep(0.018, 0.16, rho)
  return clamp01(densityEnvelope * closure * 7)
}
