/**
 * CPU-side alpha updates for the Wheeler-DeWitt semiclassical worldline pulse.
 *
 * The baseline WdW density texture carries stable R/G/B data plus static
 * overlay alpha. Animation ticks only need to update A for rows touched by
 * the travelling pulse.
 *
 * @module lib/physics/wheelerDeWitt/worldlinePulseAlpha
 */

import { float32ToFloat16 } from '@/lib/physics/freeScalar/halfFloatPacking'

import type { StreamlineOverlay } from './wkbStreamlines'

const STREAMLINE_MAX_FLOOR = 1e-20
const PULSE_OVERLAY_EPS = 1e-6

/** Scratch buffers for worldline pulse alpha updates. */
export interface WdwPulseAlphaScratch {
  targetMarks?: Uint8Array
  targetIndices?: number[]
  sampleKey?: string
  a0?: Uint16Array
  a1?: Uint16Array
  aw?: Float32Array
  p0?: Uint16Array
  p1?: Uint16Array
  pw?: Float32Array
  dirtyRowMarks?: Uint8Array
  currentRowMarks?: Uint8Array
  dirtyRows?: number[]
  previousPulseRows?: number[]
  currentPulseRows?: number[]
}

interface PulseSampleTables {
  a0: Uint16Array
  a1: Uint16Array
  aw: Float32Array
  p0: Uint16Array
  p1: Uint16Array
  pw: Float32Array
}

function fillPulseAxisTables(
  len: number,
  targetLen: number,
  out0: Uint16Array,
  out1: Uint16Array,
  outW: Float32Array
): void {
  const scale = len > 1 ? len - 1 : 0
  for (let i = 0; i < targetLen; i++) {
    const f = ((i + 0.5) / targetLen) * scale
    const i0 = Math.min(len - 1, Math.max(0, Math.floor(f)))
    out0[i] = i0
    out1[i] = Math.min(len - 1, i0 + 1)
    outW[i] = f - i0
  }
}

function ensurePulseSampleTables(
  solverGridSize: [number, number, number],
  targetGridSize: number,
  scratch: WdwPulseAlphaScratch
): PulseSampleTables {
  const [Na, Nphi] = solverGridSize
  const key = `${Na}x${Nphi}->${targetGridSize}`
  if (
    scratch.sampleKey !== key ||
    !scratch.a0 ||
    !scratch.a1 ||
    !scratch.aw ||
    !scratch.p0 ||
    !scratch.p1 ||
    !scratch.pw
  ) {
    scratch.sampleKey = key
    scratch.a0 = new Uint16Array(targetGridSize)
    scratch.a1 = new Uint16Array(targetGridSize)
    scratch.aw = new Float32Array(targetGridSize)
    scratch.p0 = new Uint16Array(targetGridSize)
    scratch.p1 = new Uint16Array(targetGridSize)
    scratch.pw = new Float32Array(targetGridSize)
    fillPulseAxisTables(Na, targetGridSize, scratch.a0, scratch.a1, scratch.aw)
    fillPulseAxisTables(Nphi, targetGridSize, scratch.p0, scratch.p1, scratch.pw)
  }
  return {
    a0: scratch.a0,
    a1: scratch.a1,
    aw: scratch.aw,
    p0: scratch.p0,
    p1: scratch.p1,
    pw: scratch.pw,
  }
}

function targetRangeForSolverCell(
  solverIndex: number,
  solverLen: number,
  targetLen: number
): [number, number] {
  const solverMax = solverLen - 1
  if (solverMax <= 0) return [0, targetLen - 1]
  const center = (solverIndex / solverMax) * targetLen - 0.5
  const reach = targetLen / solverMax + 1
  return [
    Math.max(0, Math.floor(center - reach)),
    Math.min(targetLen - 1, Math.ceil(center + reach)),
  ]
}

function collectPulseTargetIndices(
  activeSolverIndices: readonly number[],
  solverGridSize: [number, number, number],
  targetGridSize: number,
  scratch: WdwPulseAlphaScratch
): number[] {
  const N = targetGridSize
  const total = N * N * N
  if (!scratch.targetMarks || scratch.targetMarks.length !== total) {
    scratch.targetMarks = new Uint8Array(total)
  }
  if (!scratch.targetIndices) scratch.targetIndices = []
  const marks = scratch.targetMarks
  const targetIndices = scratch.targetIndices
  targetIndices.length = 0

  const [Na, Nphi] = solverGridSize
  const slab = Nphi * Nphi
  const plane = N * N
  for (const solverIdx of activeSolverIndices) {
    const ia = Math.floor(solverIdx / slab)
    const rem = solverIdx - ia * slab
    const i1 = Math.floor(rem / Nphi)
    const i2 = rem - i1 * Nphi

    const [xMin, xMax] = targetRangeForSolverCell(ia, Na, N)
    const [yMin, yMax] = targetRangeForSolverCell(i1, Nphi, N)
    const [zMin, zMax] = targetRangeForSolverCell(i2, Nphi, N)

    for (let z = zMin; z <= zMax; z++) {
      const zBase = z * plane
      for (let y = yMin; y <= yMax; y++) {
        const rowBase = zBase + y * N
        for (let x = xMin; x <= xMax; x++) {
          const pixelIdx = rowBase + x
          if (marks[pixelIdx] !== 0) continue
          marks[pixelIdx] = 1
          targetIndices.push(pixelIdx)
        }
      }
    }
  }

  return targetIndices
}

function writePulseAlphaAtTarget(
  pixelIdx: number,
  N: number,
  solverGridSize: [number, number, number],
  intensity: Float32Array,
  invMax: number,
  baselineAlpha: Float32Array,
  out: Uint16Array
): boolean {
  const [Na, Nphi] = solverGridSize
  const slab = Nphi * Nphi
  const iaScale = Na > 1 ? Na - 1 : 0
  const iPhiScale = Nphi > 1 ? Nphi - 1 : 0

  const plane = N * N
  const z = Math.floor(pixelIdx / plane)
  const rem = pixelIdx - z * plane
  const y = Math.floor(rem / N)
  const x = rem - y * N

  const fx = ((x + 0.5) / N) * iaScale
  const ia0 = Math.min(Na - 1, Math.max(0, Math.floor(fx)))
  const ia1 = Math.min(Na - 1, ia0 + 1)
  const wa = fx - ia0

  const fy = ((y + 0.5) / N) * iPhiScale
  const i10 = Math.min(Nphi - 1, Math.max(0, Math.floor(fy)))
  const i11 = Math.min(Nphi - 1, i10 + 1)
  const w1 = fy - i10

  const fz = ((z + 0.5) / N) * iPhiScale
  const i20 = Math.min(Nphi - 1, Math.max(0, Math.floor(fz)))
  const i21 = Math.min(Nphi - 1, i20 + 1)
  const w2 = fz - i20

  return writePulseAlphaFromCorners(
    pixelIdx,
    slab,
    Nphi,
    ia0,
    ia1,
    i10,
    i11,
    i20,
    i21,
    wa,
    w1,
    w2,
    intensity,
    invMax,
    baselineAlpha,
    out
  )
}

function writePulseAlphaFromCorners(
  pixelIdx: number,
  slab: number,
  Nphi: number,
  ia0: number,
  ia1: number,
  i10: number,
  i11: number,
  i20: number,
  i21: number,
  wa: number,
  w1: number,
  w2: number,
  intensity: Float32Array,
  invMax: number,
  baselineAlpha: Float32Array,
  out: Uint16Array
): boolean {
  const b000 = ia0 * slab + i10 * Nphi + i20
  const b100 = ia1 * slab + i10 * Nphi + i20
  const b010 = ia0 * slab + i11 * Nphi + i20
  const b110 = ia1 * slab + i11 * Nphi + i20
  const b001 = ia0 * slab + i10 * Nphi + i21
  const b101 = ia1 * slab + i10 * Nphi + i21
  const b011 = ia0 * slab + i11 * Nphi + i21
  const b111 = ia1 * slab + i11 * Nphi + i21
  const s000 = intensity[b000] ?? 0
  const s100 = intensity[b100] ?? 0
  const s010 = intensity[b010] ?? 0
  const s110 = intensity[b110] ?? 0
  const s001 = intensity[b001] ?? 0
  const s101 = intensity[b101] ?? 0
  const s011 = intensity[b011] ?? 0
  const s111 = intensity[b111] ?? 0
  const maxCorner = s000 > s100 ? s000 : s100
  const m0 = s010 > s110 ? s010 : s110
  const m1 = s001 > s101 ? s001 : s101
  const m2 = s011 > s111 ? s011 : s111
  const m01 = maxCorner > m0 ? maxCorner : m0
  const m12 = m1 > m2 ? m1 : m2
  const maxAll = m01 > m12 ? m01 : m12
  if (maxAll < PULSE_OVERLAY_EPS) return false

  const s00 = s000 + (s100 - s000) * wa
  const s10 = s010 + (s110 - s010) * wa
  const s01 = s001 + (s101 - s001) * wa
  const s11 = s011 + (s111 - s011) * wa
  const sInter0 = s00 + (s10 - s00) * w1
  const sInter1 = s01 + (s11 - s01) * w1
  const overlayRaw = sInter0 + (sInter1 - sInter0) * w2
  const overlayVal = overlayRaw * invMax

  const prev = baselineAlpha[pixelIdx] ?? 0
  const newA = overlayVal > prev ? (overlayVal > 1 ? 1 : overlayVal) : prev
  out[pixelIdx * 4 + 3] = float32ToFloat16(newA)
  return true
}

function markPulseRow(row: number, marks: Uint8Array, rows: number[]): void {
  if (marks[row] !== 0) return
  marks[row] = 1
  rows.push(row)
}

/** Clear remembered pulse rows when a full baseline upload supersedes them. */
export function resetWdwPulseAlphaRows(scratch: WdwPulseAlphaScratch): void {
  scratch.previousPulseRows?.splice(0)
  scratch.currentPulseRows?.splice(0)
  scratch.dirtyRows?.splice(0)
  scratch.dirtyRowMarks?.fill(0)
  scratch.currentRowMarks?.fill(0)
}

/**
 * Restore previous pulse rows, apply current pulse rows, and return
 * `z * N + y` row indices that need 3D texture row uploads.
 */
export function applyWdwPulseAlphaRows(
  baselineDensity: Uint16Array,
  baselineAlpha: Float32Array,
  pulseOverlay: StreamlineOverlay | null,
  solverGridSize: [number, number, number],
  targetGridSize: number,
  out: Uint16Array,
  scratch: WdwPulseAlphaScratch
): readonly number[] {
  const N = Math.max(1, Math.round(targetGridSize))
  const totalRows = N * N
  if (!scratch.dirtyRowMarks || scratch.dirtyRowMarks.length !== totalRows) {
    scratch.dirtyRowMarks = new Uint8Array(totalRows)
  }
  if (!scratch.currentRowMarks || scratch.currentRowMarks.length !== totalRows) {
    scratch.currentRowMarks = new Uint8Array(totalRows)
  }
  if (!scratch.dirtyRows) scratch.dirtyRows = []
  if (!scratch.previousPulseRows) scratch.previousPulseRows = []
  if (!scratch.currentPulseRows) scratch.currentPulseRows = []

  const dirtyRows = scratch.dirtyRows
  const previousRows = scratch.previousPulseRows
  const currentRows = scratch.currentPulseRows
  const dirtyMarks = scratch.dirtyRowMarks
  const currentMarks = scratch.currentRowMarks
  dirtyRows.length = 0
  currentRows.length = 0

  const rowLength = N * 4
  for (const row of previousRows) {
    const start = row * rowLength
    out.set(baselineDensity.subarray(start, start + rowLength), start)
    markPulseRow(row, dirtyMarks, dirtyRows)
  }

  if (pulseOverlay) {
    const [, Nphi] = solverGridSize
    const slab = Nphi * Nphi
    const intensity = pulseOverlay.intensity
    const maxStreamline = Math.max(pulseOverlay.maxIntensity, STREAMLINE_MAX_FLOOR)
    const invMax = 1 / maxStreamline
    const tables = ensurePulseSampleTables(solverGridSize, N, scratch)

    if (pulseOverlay.activeIndices && pulseOverlay.activeIndices.length * 128 < N * N * N) {
      const targetIndices = collectPulseTargetIndices(
        pulseOverlay.activeIndices,
        solverGridSize,
        N,
        scratch
      )
      const marks = scratch.targetMarks!
      for (const pixelIdx of targetIndices) {
        if (
          writePulseAlphaAtTarget(
            pixelIdx,
            N,
            solverGridSize,
            intensity,
            invMax,
            baselineAlpha,
            out
          )
        ) {
          const row = Math.floor(pixelIdx / N)
          markPulseRow(row, dirtyMarks, dirtyRows)
          markPulseRow(row, currentMarks, currentRows)
        }
        marks[pixelIdx] = 0
      }
    } else {
      for (let z = 0; z < N; z++) {
        const i20 = tables.p0[z]!
        const i21 = tables.p1[z]!
        const w2 = tables.pw[z]!
        const zBase = z * N * N
        for (let y = 0; y < N; y++) {
          const i10 = tables.p0[y]!
          const i11 = tables.p1[y]!
          const w1 = tables.pw[y]!
          const row = z * N + y
          const rowBase = zBase + y * N
          for (let x = 0; x < N; x++) {
            if (
              writePulseAlphaFromCorners(
                rowBase + x,
                slab,
                Nphi,
                tables.a0[x]!,
                tables.a1[x]!,
                i10,
                i11,
                i20,
                i21,
                tables.aw[x]!,
                w1,
                w2,
                intensity,
                invMax,
                baselineAlpha,
                out
              )
            ) {
              markPulseRow(row, dirtyMarks, dirtyRows)
              markPulseRow(row, currentMarks, currentRows)
            }
          }
        }
      }
    }
  }

  for (const row of dirtyRows) dirtyMarks[row] = 0
  for (const row of currentRows) currentMarks[row] = 0

  scratch.previousPulseRows = currentRows
  scratch.currentPulseRows = previousRows
  scratch.currentPulseRows.length = 0

  return dirtyRows
}

/** Full-buffer compatibility wrapper used by tests and non-hot paths. */
export function applyWdwPulseAlpha(
  baselineDensity: Uint16Array,
  baselineAlpha: Float32Array,
  pulseOverlay: StreamlineOverlay | null,
  solverGridSize: [number, number, number],
  targetGridSize: number,
  out: Uint16Array
): void {
  if (out !== baselineDensity) out.set(baselineDensity)
  if (!pulseOverlay) return
  applyWdwPulseAlphaRows(
    baselineDensity,
    baselineAlpha,
    pulseOverlay,
    solverGridSize,
    targetGridSize,
    out,
    {}
  )
}
