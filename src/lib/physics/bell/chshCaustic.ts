/**
 * CPU reference math for the Bell-pair CHSH caustic cosmograph.
 *
 * The WebGPU apparatus shader uses the same scalar ingredients: Werner
 * CHSH slack, a two-analyzer eikonal, a fold-controlled ridge term, and a
 * sub-threshold cusp/shadow term. These functions stay deterministic and
 * finite so presets and shader packing can be tested without a GPU.
 *
 * @module lib/physics/bell/chshCaustic
 */

import type { BellPairAxis } from '@/lib/geometry/extended/bellPair'
import { CLASSICAL_BOUND, TSIRELSON_BOUND } from '@/lib/physics/bell/chsh'

/** Normalized 3D point/vector used by the Bell apparatus density grid. */
export type Vec3 = readonly [x: number, y: number, z: number]

/** Optional user-facing controls for CHSH caustic rendering. */
export interface ChshCausticControls {
  chshCausticEnabled?: boolean
  chshCausticStrength?: number
  chshCausticFoldScale?: number
  chshCausticPhase?: number
}

/** Finite clamped CHSH caustic controls shared by CPU and WGSL paths. */
export interface SanitizedChshCausticControls {
  chshCausticEnabled: boolean
  chshCausticStrength: number
  chshCausticFoldScale: number
  chshCausticPhase: number
}

/** Four measurement axes plus Werner visibility for a CHSH evaluation. */
export interface WernerChshInput {
  aliceAxis: BellPairAxis
  aliceAxisPrime: BellPairAxis
  bobAxis: BellPairAxis
  bobAxisPrime: BellPairAxis
  visibility: number
}

/** Signed CHSH value, absolute value, normalized slack, and correlations. */
export interface WernerChshResult {
  signedS: number
  absS: number
  positiveSlack: number
  correlations: {
    ab: number
    abPrime: number
    aPrimeB: number
    aPrimeBPrime: number
  }
}

/** Inputs required to sample the caustic eikonal at one density-grid point. */
export interface ChshCausticSampleInput extends WernerChshInput, ChshCausticControls {
  point: Vec3
  armOffset?: number
}

/** Full scalar decomposition of one caustic sample. */
export interface ChshCausticSample {
  controls: SanitizedChshCausticControls
  chsh: WernerChshResult
  eikonal: number
  ridge: number
  cusp: number
  lens: number
  shadow: number
  densityGain: number
}

/** RGBA density payload matching the Bell apparatus storage texture channels. */
export interface DensityRgba {
  r: number
  g: number
  b: number
  a: number
}

export const CHSH_CAUSTIC_LIMITS = Object.freeze({
  strengthMin: 0,
  strengthMax: 4,
  foldScaleMin: 0.25,
  foldScaleMax: 24,
  phaseMin: -2 * Math.PI,
  phaseMax: 2 * Math.PI,
  armOffsetMin: 0.05,
  armOffsetMax: 2,
})

export const DEFAULT_CHSH_CAUSTIC_CONTROLS: SanitizedChshCausticControls = Object.freeze({
  chshCausticEnabled: false,
  chshCausticStrength: 1,
  chshCausticFoldScale: 7,
  chshCausticPhase: 0,
})

const CHSH_SLACK_DENOMINATOR = TSIRELSON_BOUND - CLASSICAL_BOUND
const POINT_LIMIT = 4

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  return clamp(finiteNumber(value, fallback), min, max)
}

function clampUnit(value: unknown): number {
  return clampFinite(value, 0, 1, 1)
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function sanitizePoint(point: Vec3): [number, number, number] {
  return [
    clampFinite(point[0], -POINT_LIMIT, POINT_LIMIT, 0),
    clampFinite(point[1], -POINT_LIMIT, POINT_LIMIT, 0),
    clampFinite(point[2], -POINT_LIMIT, POINT_LIMIT, 0),
  ]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function sub(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function length3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2])
}

function gaussianSquared(distanceSquared: number, sigma: number): number {
  const safeSigma = Math.max(1e-6, sigma)
  return Math.exp(-distanceSquared / (2 * safeSigma * safeSigma))
}

/** Convert a finite Bloch-sphere axis to a unit 3-vector. */
export function bellAxisToVec3(axis: BellPairAxis): [number, number, number] {
  const theta = clampFinite(axis[0], 0, Math.PI, Math.PI / 2)
  const phi = finiteNumber(axis[1], 0)
  const sinTheta = Math.sin(theta)
  return [sinTheta * Math.cos(phi), sinTheta * Math.sin(phi), Math.cos(theta)]
}

/** Clamp caustic controls to the finite domain shared with the WGSL shader. */
export function sanitizeChshCausticControls(
  controls: ChshCausticControls
): SanitizedChshCausticControls {
  return {
    chshCausticEnabled:
      typeof controls.chshCausticEnabled === 'boolean'
        ? controls.chshCausticEnabled
        : DEFAULT_CHSH_CAUSTIC_CONTROLS.chshCausticEnabled,
    chshCausticStrength: clampFinite(
      controls.chshCausticStrength,
      CHSH_CAUSTIC_LIMITS.strengthMin,
      CHSH_CAUSTIC_LIMITS.strengthMax,
      DEFAULT_CHSH_CAUSTIC_CONTROLS.chshCausticStrength
    ),
    chshCausticFoldScale: clampFinite(
      controls.chshCausticFoldScale,
      CHSH_CAUSTIC_LIMITS.foldScaleMin,
      CHSH_CAUSTIC_LIMITS.foldScaleMax,
      DEFAULT_CHSH_CAUSTIC_CONTROLS.chshCausticFoldScale
    ),
    chshCausticPhase: clampFinite(
      controls.chshCausticPhase,
      CHSH_CAUSTIC_LIMITS.phaseMin,
      CHSH_CAUSTIC_LIMITS.phaseMax,
      DEFAULT_CHSH_CAUSTIC_CONTROLS.chshCausticPhase
    ),
  }
}

/** Normalized positive CHSH slack: 0 at or below 2, 1 at Tsirelson. */
export function normalizedPositiveChshSlack(absS: number): number {
  const safeAbs = finiteNumber(absS, 0)
  return clamp((safeAbs - CLASSICAL_BOUND) / CHSH_SLACK_DENOMINATOR, 0, 1)
}

/** Compute the signed and absolute Werner-state CHSH value for four axes. */
export function computeWernerChsh(input: WernerChshInput): WernerChshResult {
  const visibility = clampUnit(input.visibility)
  const alice = bellAxisToVec3(input.aliceAxis)
  const alicePrime = bellAxisToVec3(input.aliceAxisPrime)
  const bob = bellAxisToVec3(input.bobAxis)
  const bobPrime = bellAxisToVec3(input.bobAxisPrime)
  const correlation = (a: Vec3, b: Vec3): number => -visibility * clamp(dot(a, b), -1, 1)

  const ab = correlation(alice, bob)
  const abPrime = correlation(alice, bobPrime)
  const aPrimeB = correlation(alicePrime, bob)
  const aPrimeBPrime = correlation(alicePrime, bobPrime)
  const signedS = ab - abPrime + aPrimeB + aPrimeBPrime
  const absS = Math.abs(signedS)

  return {
    signedS: finiteNumber(signedS, 0),
    absS: finiteNumber(absS, 0),
    positiveSlack: normalizedPositiveChshSlack(absS),
    correlations: {
      ab: finiteNumber(ab, 0),
      abPrime: finiteNumber(abPrime, 0),
      aPrimeB: finiteNumber(aPrimeB, 0),
      aPrimeBPrime: finiteNumber(aPrimeBPrime, 0),
    },
  }
}

/** Evaluate the caustic ridge/eikonal terms at one normalized density-grid point. */
export function evaluateChshCaustic(input: ChshCausticSampleInput): ChshCausticSample {
  const controls = sanitizeChshCausticControls(input)
  const chsh = computeWernerChsh(input)
  const point = sanitizePoint(input.point)
  const armOffset = clampFinite(
    input.armOffset,
    CHSH_CAUSTIC_LIMITS.armOffsetMin,
    CHSH_CAUSTIC_LIMITS.armOffsetMax,
    0.6
  )
  const aliceCenter: Vec3 = [-armOffset, 0, 0]
  const bobCenter: Vec3 = [armOffset, 0, 0]
  const pa = sub(point, aliceCenter)
  const pb = sub(point, bobCenter)
  const da = length3(pa)
  const db = length3(pb)
  const alice = bellAxisToVec3(input.aliceAxis)
  const alicePrime = bellAxisToVec3(input.aliceAxisPrime)
  const bob = bellAxisToVec3(input.bobAxis)
  const bobPrime = bellAxisToVec3(input.bobAxisPrime)
  const aliceFold = dot(pa, alice) - dot(pa, alicePrime)
  const bobFold = dot(pb, bob) - dot(pb, bobPrime)
  const eikonal = finiteNumber(da + db + 0.22 * (aliceFold - bobFold), 0)
  const foldPhase = controls.chshCausticFoldScale * eikonal + controls.chshCausticPhase
  const balanceDelta = da - db
  const balance = gaussianSquared(balanceDelta * balanceDelta, 0.42)
  const envelope = gaussianSquared(dot(point, point), 0.9)
  const ridgeCore = Math.exp(-Math.abs(Math.cos(foldPhase)) * (1.2 + 2 * chsh.positiveSlack))
  const ridge = (0.18 + 0.82 * ridgeCore) * balance * envelope
  const cuspSigma = 0.14 + 0.22 / Math.sqrt(controls.chshCausticFoldScale)
  const cusp = gaussianSquared(dot(point, point), cuspSigma) * (1 - chsh.positiveSlack)
  const lens =
    controls.chshCausticEnabled && controls.chshCausticStrength > 0
      ? controls.chshCausticStrength * (0.18 + 0.82 * chsh.positiveSlack) * ridge
      : 0
  const shadow =
    controls.chshCausticEnabled && controls.chshCausticStrength > 0
      ? controls.chshCausticStrength * cusp
      : 0

  return {
    controls,
    chsh,
    eikonal: finiteNumber(eikonal, 0),
    ridge: finiteNonNegative(ridge),
    cusp: finiteNonNegative(cusp),
    lens: finiteNonNegative(lens),
    shadow: finiteNonNegative(shadow),
    densityGain: finiteNonNegative(1 + 0.75 * lens + 0.25 * shadow),
  }
}

/** Apply the caustic color/density transform used by the WGSL apparatus shader. */
export function applyChshCausticToDensity(
  base: DensityRgba,
  input: ChshCausticSampleInput
): DensityRgba {
  const controls = sanitizeChshCausticControls(input)
  if (!controls.chshCausticEnabled || controls.chshCausticStrength <= 0) {
    return { ...base }
  }

  const sample = evaluateChshCaustic(input)
  const slack = sample.chsh.positiveSlack
  const lens = sample.lens
  const shadow = sample.shadow

  return {
    r: finiteNonNegative(base.r + lens * (0.45 + 0.35 * slack) - shadow * 0.08),
    g: finiteNonNegative(base.g + lens * (0.25 + 1.15 * slack) - shadow * 0.18),
    b: finiteNonNegative(base.b + lens * (0.95 - 0.4 * slack) + shadow * 0.45),
    a: finiteNonNegative(base.a + lens * 0.75 + shadow * 0.25),
  }
}
