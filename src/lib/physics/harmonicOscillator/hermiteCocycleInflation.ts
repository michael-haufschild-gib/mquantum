/** Inputs for the harmonic-oscillator Hermite triple-cocycle phase obstruction. */
export interface HermiteCocycleInflationInput {
  xND: readonly number[]
  dimension: number
  quantumNumbers: readonly number[]
  termIndex?: number
  enabled: boolean
  strength: number
  shellRadius: number
  twist: number
}

/** CPU reference result for the Hermite triple-cocycle phase obstruction. */
export interface HermiteCocycleInflationResult {
  shellGate: number
  obstruction: number
  phase: number
}

const MAX_DIMENSION = 11
const MIN_RADIUS = 0.1
const MAX_RADIUS = 2.0

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max))

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback
}

function safeDimension(value: number): number {
  return clamp(Math.trunc(finiteOr(value, 3)), 1, MAX_DIMENSION)
}

function safeCoord(input: HermiteCocycleInflationInput, dim: number, index: number): number {
  if (index >= dim) return 0
  return finiteOr(input.xND[index], 0)
}

function safeQuantumNumber(input: HermiteCocycleInflationInput, index: number): number {
  return clamp(Math.trunc(finiteOr(input.quantumNumbers[index], 0)), 0, 64)
}

function computeShellGate(r: number, radius: number): number {
  const width = Math.max(0.18 * radius, 0.075)
  const shell = Math.exp(-Math.pow((r - radius) / width, 2))
  const originFade = smoothstep(0.12 * radius, 0.55 * radius, r)
  const farFade = 1 - smoothstep(radius + 2 * width, radius + 4 * width, r)
  return clamp(shell * originFade * farFade, 0, 1)
}

/** Compute the CPU mirror of the WGSL Hermite triple-cocycle inflation phase. */
export function computeHermiteCocycleInflation(
  input: HermiteCocycleInflationInput
): HermiteCocycleInflationResult {
  const strength = clamp(finiteOr(input.strength, 0), 0, 2)
  if (!input.enabled || strength <= 0) {
    return { shellGate: 0, obstruction: 0, phase: 0 }
  }

  const dim = safeDimension(input.dimension)
  const radius = clamp(finiteOr(input.shellRadius, 1), MIN_RADIUS, MAX_RADIUS)
  const invRadius = 1 / radius
  const x = safeCoord(input, dim, 0)
  const y = safeCoord(input, dim, 1)
  const z = safeCoord(input, dim, 2)
  const w = dim >= 4 ? safeCoord(input, dim, 3) : 0
  const px = x * invRadius
  const py = y * invRadius
  const pz = z * invRadius
  const pw = w * invRadius
  const r = Math.hypot(x, y, z)
  const shellGate = computeShellGate(r, radius)

  if (shellGate <= 1e-8) {
    return { shellGate, obstruction: 0, phase: 0 }
  }

  const n0 = safeQuantumNumber(input, 0) + 1
  const n1 = safeQuantumNumber(input, 1) + 1
  const n2 = safeQuantumNumber(input, 2) + 1
  const n3 = safeQuantumNumber(input, 3) + 1
  const term = finiteOr(input.termIndex, 0)
  const branch = 0.173 * (Math.trunc(term) + 1)
  const twist = clamp(finiteOr(input.twist, 0), 0, 8)

  const a = Math.sin(n0 * px + twist * (py - pz) + branch)
  const b = Math.sin(n1 * py + twist * (pz - px) + 0.37 * branch)
  const c = Math.sin(n2 * pz + twist * (px - py) + 0.61 * branch)
  const projectedCocycle = a * b * c
  const cyclicParity =
    0.5 * Math.sin(n0 * py * pz + n1 * pz * px + n2 * px * py + twist * (px + 0.5 * py - 0.25 * pz))
  const bulkCocycle = dim >= 4 ? 0.6 * Math.sin(n3 * pw + twist * (px + py - pz) + 0.5 * branch) : 0
  const obstruction = clamp(
    Math.tanh(1.45 * (projectedCocycle + cyclicParity + bulkCocycle)),
    -1,
    1
  )
  const phase = clamp(strength * shellGate * obstruction, -strength, strength)

  return { shellGate, obstruction, phase }
}
