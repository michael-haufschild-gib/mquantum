/**
 * Regression test for the frozen density grid.
 *
 * Background: the pass re-dispatches every 1/60 s of animation time for
 * multi-term HO superpositions (|ψ(x,t)|² has evolving interference
 * fringes), but its private copy of SchroedingerUniforms was only
 * re-uploaded on a store-version bump. Every time-bucket recompute therefore
 * re-evaluated the stale time + host-precomputed terms and the grid-path
 * render (default Volumetric Cloud with non-phase colors) froze in time.
 */

import { describe, expect, it } from 'vitest'

import { DensityGridComputePass } from '@/rendering/webgpu/passes/DensityGridComputePass'
import {
  SCHROEDINGER_LAYOUT,
  SCHROEDINGER_UNIFORM_SIZE,
} from '@/rendering/webgpu/renderers/schroedingerLayout'

type WriteCall = { bufferOffset: number; dataOffset: number; size: number }

function makePass(
  quantumMode: 'harmonicOscillator' | 'hydrogenND',
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
  useDensityMatrix = false
): DensityGridComputePass {
  const pass = new DensityGridComputePass({
    dimension: 3,
    quantumMode,
    termCount,
    gridSize: 8,
    useDensityMatrix,
  })
  ;(pass as unknown as { schroedingerBuffer: GPUBuffer }).schroedingerBuffer = {} as GPUBuffer
  return pass
}

function makeDevice(calls: WriteCall[]): GPUDevice {
  return {
    queue: {
      writeBuffer: (
        _buffer: GPUBuffer,
        bufferOffset: number,
        data: ArrayBuffer,
        dataOffset?: number,
        size?: number
      ) => {
        calls.push({
          bufferOffset,
          dataOffset: dataOffset ?? 0,
          size: size ?? data.byteLength,
        })
      },
    },
  } as unknown as GPUDevice
}

describe('DensityGridComputePass time-dependent uniform refresh', () => {
  const data = new ArrayBuffer(SCHROEDINGER_UNIFORM_SIZE)
  const timeOffset = SCHROEDINGER_LAYOUT.byteOffset.time
  const termOffset = SCHROEDINGER_LAYOUT.byteOffset.precomputedTerm
  const termSize = SCHROEDINGER_LAYOUT.byteSize.precomputedTerm

  it('uploads time and precomputed HO terms between version bumps for superpositions', () => {
    const calls: WriteCall[] = []
    const device = makeDevice(calls)
    const pass = makePass('harmonicOscillator', 4)

    pass.updateSchroedingerUniforms(device, data, 7)
    expect(calls).toEqual([{ bufferOffset: 0, dataOffset: 0, size: SCHROEDINGER_UNIFORM_SIZE }])

    calls.length = 0
    pass.updateSchroedingerUniforms(device, data, 7)
    expect(calls).toEqual([
      { bufferOffset: timeOffset, dataOffset: timeOffset, size: 4 },
      { bufferOffset: termOffset, dataOffset: termOffset, size: termSize },
    ])
  })

  it('skips per-frame uploads for stationary states', () => {
    for (const pass of [
      makePass('harmonicOscillator', 1),
      makePass('hydrogenND', 4), // hydrogen config inherits the HO store termCount
      makePass('harmonicOscillator', 4, true), // density matrix evolves on the CPU
    ]) {
      const calls: WriteCall[] = []
      const device = makeDevice(calls)
      pass.updateSchroedingerUniforms(device, data, 3)
      calls.length = 0
      pass.updateSchroedingerUniforms(device, data, 3)
      expect(calls).toEqual([])
    }
  })

  it('does not schedule time-bucket recomputes for a stationary hydrogen orbital', () => {
    const hydrogen = makePass('hydrogenND', 4)
    const ho = makePass('harmonicOscillator', 4)
    for (const pass of [hydrogen, ho]) {
      const state = pass as unknown as {
        needsRecompute: boolean
        lastDimension: number
        lastQuantumMode: string | undefined
        lastTimeBucket: number
      }
      state.needsRecompute = false
      state.lastDimension = 3
      state.lastQuantumMode = pass === hydrogen ? 'hydrogenND' : 'harmonicOscillator'
      state.lastTimeBucket = 0
    }
    expect(hydrogen.needsUpdate(1.0, 3, 'hydrogenND')).toBe(false)
    expect(ho.needsUpdate(1.0, 3, 'harmonicOscillator')).toBe(true)
  })
})
