import type { HorizonWeights } from '@/lib/geometry/extended/modularHorizon'

import modes from './modes.json'

export const frequencies = modes.map((mode) => mode.frequency)
/** Normalize relative mode weights into probabilities. */
export function populations(weights: HorizonWeights): number[] {
  const total = weights[0] + weights[1] + weights[2]
  return weights.map((w) => w / total)
}
/** Angular phases relative to the first occupied mode. */
export function horizonPhases(weights: HorizonWeights, t: number, radialDelay = 0): number[] {
  const ref = frequencies[weights.findIndex((w) => w > 0)]!
  return frequencies.map((f) => -(f - ref) * (Math.max(0, t) + radialDelay))
}
/** Squared overlap with the launch state. */
export function fidelity(weights: HorizonWeights, t: number): number {
  const p = populations(weights),
    phases = horizonPhases(weights, t)
  let re = 0,
    im = 0
  phases.forEach((v, i) => {
    re += p[i]! * Math.cos(v)
    im += p[i]! * Math.sin(v)
  })
  return Math.min(1, re * re + im * im)
}
/** Translate/invert into the modular fundamental domain, retaining the chart
 * change so the horocycle through the selected lift can be drawn on screen. */
export function detectorChart([u, v]: [number, number]): {
  x: number
  y: number
  matrix: number[]
} {
  const den = (1 - u) ** 2 + v * v
  let x = 0.17 - (2.6 * v) / den,
    y = (1.3 * (1 - u * u - v * v)) / den
  let a = 1,
    b = 0,
    c = 0,
    d = 1
  for (let i = 0; i < 48; i++) {
    const n = Math.floor(x + 0.5)
    x -= n
    a -= n * c
    b -= n * d
    const r = x * x + y * y
    if (r >= 1 - 1e-13) break
    x = -x / r
    y /= r
    ;[a, b, c, d] = [-c, -d, a, b]
  }
  return { x, y, matrix: [a, b, c, d] }
}

/** Fourier–Bessel horocycle mean. Cache when the detector changes. */
export function detectorBasis(pin: [number, number], width: number): number[] {
  if (width === 1) return [0, 0, 0]
  const { x, y } = detectorChart(pin)
  return modes.map(({ frequency: r, norm, odd, coefficients }) => {
    let total = 0
    coefficients.forEach((coef, i) => {
      const k = (i + 1) * 2 * Math.PI
      const arg = k * y
      if (arg > 66) return
      let integral = 0.5 * Math.exp(-arg)
      for (let j = 1; j <= 160; j++) {
        const u = j / 32
        integral += Math.exp(-arg * Math.cosh(u)) * Math.cos(r * u)
      }
      const q = (k * width) / 2
      total +=
        coef *
        (odd ? Math.sin(k * x) : Math.cos(k * x)) *
        integral *
        (q === 0 ? 1 : Math.sin(q) / q)
    })
    return (total * Math.sqrt(y) * Math.exp((Math.PI * r) / 2)) / (32 * norm)
  })
}
