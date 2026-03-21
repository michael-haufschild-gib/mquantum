/**
 * Classical-quantum correspondence overlay uniform packing.
 *
 * Extracted from uniformPacking.ts to stay within line-count limits.
 * Handles CPU-side trail computation for HO (analytical Lissajous) and
 * TDSE/BEC (Ehrenfest ⟨x⟩(t) from A3 observables), including N-D → 3D
 * projection through basis vectors.
 *
 * @module rendering/webgpu/renderers/uniformPackingClassical
 */

import { MAX_DIM } from '../shaders/schroedinger/uniforms.wgsl'
import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'
import type { ObservablesTrailData, SchroedingerPackParams } from './uniformPacking'

// Field name → float32/int32 index (byte offset / 4)
const I = SCHROEDINGER_LAYOUT.index

/** Number of trail points stored in uniform buffer. */
const TRAIL_POINTS = 6

/**
 * Project an N-D position vector to 3D model space using basis vectors.
 *
 * @param ndPos - Position in N-D HO space (length >= dim)
 * @param dim - Number of active dimensions
 * @param basisX - X basis vector (length >= dim)
 * @param basisY - Y basis vector (length >= dim)
 * @param basisZ - Z basis vector (length >= dim)
 * @returns [x, y, z] in model space
 */
export function projectNDToModelSpace(
  ndPos: number[],
  dim: number,
  basisX: Float32Array,
  basisY: Float32Array,
  basisZ: Float32Array
): [number, number, number] {
  let x = 0,
    y = 0,
    z = 0
  for (let d = 0; d < dim; d++) {
    const v = ndPos[d]!
    x += v * (basisX[d] ?? 0)
    y += v * (basisY[d] ?? 0)
    z += v * (basisZ[d] ?? 0)
  }
  return [x, y, z]
}

/**
 * Pack classical overlay uniforms and trail points.
 * Called from packVisualFields in uniformPacking.ts.
 *
 * @param floatView - Float32 view of the uniform buffer
 * @param intView - Int32 view of the uniform buffer
 * @param p - Pack parameters
 * @param parseColor - Hex color parser function
 */
export function packClassicalOverlay(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  parseColor: (hex: string) => [number, number, number]
): void {
  const schroedinger = p.schroedinger

  const classicalEnabled = schroedinger?.classicalOverlayEnabled ?? false
  intView[I.classicalOverlayEnabled] = classicalEnabled ? 1 : 0
  floatView[I.classicalOverlayTrailFraction] = schroedinger?.classicalOverlayTrailFraction ?? 0.15
  const trailColor = parseColor(schroedinger?.classicalOverlayColor ?? '#fff2cc')
  floatView[I.classicalOverlayColor] = trailColor[0]
  floatView[I.classicalOverlayColor + 1] = trailColor[1]
  floatView[I.classicalOverlayColor + 2] = trailColor[2]
  const classicalHbar = schroedinger?.classicalOverlayHbar ?? 1.0
  floatView[I.classicalOverlayHbar] = classicalHbar

  // Apply hbar-based fieldScale scaling (HO only): narrower cloud at smaller hbar
  if (
    classicalEnabled &&
    classicalHbar > 0 &&
    classicalHbar !== 1.0 &&
    p.quantumModeStr === 'harmonicOscillator'
  ) {
    floatView[I.fieldScale] = (schroedinger?.fieldScale ?? 1.0) / Math.sqrt(classicalHbar)
  }

  // CPU-precomputed classical trail points
  intView[I.classicalTrailCount] = 0
  if (classicalEnabled) {
    if (p.quantumModeStr === 'harmonicOscillator' && p.presetData) {
      packHOClassicalTrailPoints(floatView, intView, p, schroedinger)
    } else if (
      (p.quantumModeStr === 'tdseDynamics' || p.quantumModeStr === 'becDynamics') &&
      p.observablesTrailData
    ) {
      packObservablesTrailPoints(floatView, intView, p, schroedinger)
    }
  }
}

/** Compute and pack HO Lissajous trail points (N-D projected) into uniform buffer. */
function packHOClassicalTrailPoints(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  schroedinger: SchroedingerPackParams['schroedinger']
): void {
  const fieldScale = schroedinger?.fieldScale ?? 1.0
  const invFS = 1.0 / Math.max(fieldScale, 0.01)
  const animTime = p.animationTime * (schroedinger?.timeScale ?? 0.8)
  const dim = p.dimension
  const preset = p.presetData!
  const tc = p.presetTermCount
  const trailFrac = schroedinger?.classicalOverlayTrailFraction ?? 0.15

  // Retrieve basis vectors for N-D projection
  const basisX = schroedinger?.basisX as Float32Array | undefined
  const basisY = schroedinger?.basisY as Float32Array | undefined
  const basisZ = schroedinger?.basisZ as Float32Array | undefined
  if (!basisX || !basisY || !basisZ) return

  // Precompute per-dimension amplitudes and omegas (all D dimensions)
  const amps: number[] = []
  const omegas: number[] = []
  let minOmega = 100.0
  for (let d = 0; d < dim; d++) {
    const omega = preset.omega[d] ?? 1.0
    omegas.push(omega)
    minOmega = Math.min(minOmega, Math.max(omega, 0.01))
    let avgNHalf = 0
    let totalW = 0
    for (let k = 0; k < tc; k++) {
      const re = preset.coeff[k * 2] ?? 0
      const im = preset.coeff[k * 2 + 1] ?? 0
      const w = re * re + im * im
      const n = preset.quantum[k * MAX_DIM + d] ?? 0
      avgNHalf += w * (n + 0.5)
      totalW += w
    }
    if (totalW > 0) avgNHalf /= totalW
    amps.push(Math.sqrt(Math.max((2.0 * avgNHalf) / Math.max(omega, 0.01), 0)) * invFS)
  }

  // Compute trail points spaced over trailFrac of the Lissajous period
  const fullPeriod = (2 * Math.PI) / minOmega
  const trailDuration = fullPeriod * trailFrac
  const dt = trailDuration / (TRAIL_POINTS - 1)

  intView[I.classicalTrailCount] = TRAIL_POINTS
  for (let i = 0; i < TRAIL_POINTS; i++) {
    const t = animTime - i * dt
    const fade = 1.0 - i / (TRAIL_POINTS - 1)

    // Compute N-D Lissajous position
    const ndPos: number[] = []
    for (let d = 0; d < dim; d++) {
      ndPos.push(amps[d]! * Math.cos(omegas[d]! * t))
    }

    // Project to 3D model space using basis vectors
    const [mx, my, mz] = projectNDToModelSpace(ndPos, dim, basisX, basisY, basisZ)

    const base = I.classicalTrail + i * 4
    floatView[base] = mx
    floatView[base + 1] = my
    floatView[base + 2] = mz
    floatView[base + 3] = fade
  }
}

/**
 * Pack TDSE/BEC Ehrenfest trail points from observables position mean history.
 * Samples the ring buffer at evenly-spaced intervals to build 6 trail points.
 */
function packObservablesTrailPoints(
  floatView: Float32Array,
  intView: Int32Array,
  p: SchroedingerPackParams,
  schroedinger: SchroedingerPackParams['schroedinger']
): void {
  const obs = p.observablesTrailData as ObservablesTrailData
  if (obs.historyCount < 2) return

  const basisX = schroedinger?.basisX as Float32Array | undefined
  const basisY = schroedinger?.basisY as Float32Array | undefined
  const basisZ = schroedinger?.basisZ as Float32Array | undefined
  if (!basisX || !basisY || !basisZ) return

  const dim = Math.min(obs.activeDims, p.dimension)
  const fieldScale = schroedinger?.fieldScale ?? 1.0
  const invFS = 1.0 / Math.max(fieldScale, 0.01)

  // Sample TRAIL_POINTS evenly from the most recent historyCount entries
  const available = Math.min(obs.historyCount, TRAIL_POINTS * 3)
  const stride = Math.max(1, Math.floor((available - 1) / (TRAIL_POINTS - 1)))
  const pointCount = Math.min(TRAIL_POINTS, Math.floor((available - 1) / stride) + 1)

  if (pointCount < 2) return

  const bufLen = obs.historyPositionMean[0]!.length

  intView[I.classicalTrailCount] = pointCount
  for (let i = 0; i < pointCount; i++) {
    // Index into ring buffer: head-1 is most recent, going backwards
    const age = i * stride
    const bufIdx = (((obs.historyHead - 1 - age) % bufLen) + bufLen) % bufLen
    const fade = 1.0 - i / (pointCount - 1)

    // Read N-D position from history and scale by inverse fieldScale
    const ndPos: number[] = []
    for (let d = 0; d < dim; d++) {
      ndPos.push((obs.historyPositionMean[d]![bufIdx] ?? 0) * invFS)
    }

    // Project to 3D model space
    const [mx, my, mz] = projectNDToModelSpace(ndPos, dim, basisX, basisY, basisZ)

    const base = I.classicalTrail + i * 4
    floatView[base] = mx
    floatView[base + 1] = my
    floatView[base + 2] = mz
    floatView[base + 3] = fade
  }
}
