/** Inputs for the harmonic-oscillator Fock Lantern parity-cell scalar. */
export interface FockLanternInput {
  position: readonly [number, number, number]
  rho: number
  peakDensity: number
  phase: number
  gradient: readonly [number, number, number]
  boundingRadius: number
  time: number
  strength: number
  cellScale: number
  parityBias: number
}

/** Emission/opacity modulation returned by the Fock Lantern scalar. */
export interface FockLanternResult {
  emissionGain: number
  opacityScale: number
  lantern: number
}

const PI = Math.PI

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max))

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function length3(v: readonly [number, number, number]): number {
  return Math.hypot(v[0], v[1], v[2])
}

function dot3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize3(v: readonly [number, number, number]): [number, number, number] {
  const len = length3(v)
  if (!(len > 0) || !Number.isFinite(len)) return [1, 0, 0]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

/** Compute the CPU mirror of the WGSL Fock Lantern scalar and render gains. */
export function computeFockLantern(input: FockLanternInput): FockLanternResult {
  const peakDensity = Math.max(finiteOr(input.peakDensity, 0), 1e-8)
  const normalizedRho = clamp(finiteOr(input.rho, 0) / peakDensity, 0, 2)
  const midGate =
    smoothstep(0.015, 0.22, normalizedRho) * (1 - smoothstep(1.12, 1.75, normalizedRho))
  if (midGate <= 1e-5) return { emissionGain: 1, opacityScale: 1, lantern: 0 }

  const strength = clamp(finiteOr(input.strength, 1), 0, 2)
  const cellScale = clamp(finiteOr(input.cellScale, 5), 0.25, 12)
  const parityBias = clamp(finiteOr(input.parityBias, 0.85), 0.2, 4)
  const invRadius = 1 / Math.max(Math.abs(finiteOr(input.boundingRadius, 1)), 1e-4)
  const c = input.position.map((v) => v * cellScale * invRadius) as [number, number, number]
  const parityProduct = Math.cos(PI * c[0]) * Math.cos(PI * c[1]) * Math.cos(PI * c[2])
  const time = finiteOr(input.time, 0)
  const diagonalParity = Math.cos(PI * (c[0] + c[1] + c[2] + 0.17 * Math.sin(0.61 * time)))
  const parityGate = Math.pow(clamp(Math.abs(parityProduct * diagonalParity), 0, 1), parityBias)
  const gradN = normalize3([
    finiteOr(input.gradient[0], 0) + 1e-6,
    finiteOr(input.gradient[1], 0),
    finiteOr(input.gradient[2], 0),
  ])
  const radialN = normalize3([
    finiteOr(input.position[0], 0),
    finiteOr(input.position[1], 0) + 1e-6,
    finiteOr(input.position[2], 0),
  ])
  const alignmentGate = 0.35 + 0.65 * Math.abs(dot3(gradN, radialN))
  const phaseGate =
    0.55 + 0.45 * Math.cos(finiteOr(input.phase, 0) + 1.7 * diagonalParity + 0.31 * time)
  const lantern = clamp(midGate * parityGate * phaseGate * alignmentGate, 0, 1)
  const voidGate = midGate * (1 - parityGate)

  return {
    emissionGain: 1 + strength * lantern * 2.8,
    opacityScale: clamp(1 - voidGate * strength * 0.45, 0.35, 1),
    lantern,
  }
}
