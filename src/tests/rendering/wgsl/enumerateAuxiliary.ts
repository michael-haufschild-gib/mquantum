/**
 * Phase 1d (partial): skybox + AdS density + Wigner cache/spatial/reconstruct
 * + eigencache + density-grid compute composers.
 *
 * Pass-level shaders with inline-concat setup (class C per Phase 2a audit)
 * are NOT covered here — they require the Phase 2b refactor first.
 *
 * @module tests/rendering/wgsl/enumerateAuxiliary
 */

import { createHash } from 'node:crypto'

import {
  composeDensityGridComputeShader,
  type ComputeQuantumMode,
  type DensityGridComputeConfig,
} from '@/rendering/webgpu/shaders/schroedinger/compute/compose'
import { composeAdsDensityComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeAds'
import { composeEigenfunctionCacheComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeEigenCache'
import { composeWignerCacheComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeWignerCache'
import { composeWignerReconstructComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeWignerReconstruct'
import { composeWignerSpatialComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeWignerSpatial'
import {
  composeSkyboxFragmentShader,
  composeSkyboxVertexShader,
} from '@/rendering/webgpu/shaders/skybox/compose'
import type { SkyboxMode } from '@/rendering/webgpu/shaders/skybox/types'

import type { ShaderRecord } from './enumerateSchroedingerAnalytic'

function record(
  label: string,
  wgsl: string,
  cacheKey: string,
  surface: ShaderRecord['surface']
): ShaderRecord {
  return {
    label,
    wgsl,
    sha256: createHash('sha256').update(wgsl).digest('hex'),
    cacheKey,
    surface,
  }
}

const SKYBOX_MODES: readonly SkyboxMode[] = [
  'classic',
  'aurora',
  'nebula',
  'crystalline',
  'horizon',
  'ocean',
  'twilight',
]

/**
 *
 */
export function* enumerateSkybox(): Generator<ShaderRecord> {
  // Vertex shader varies with effects (varying layout changes).
  for (const sun of [false, true]) {
    for (const vignette of [false, true]) {
      const vertex = composeSkyboxVertexShader({ sun, vignette })
      yield record(
        `skybox-vertex_sun${Number(sun)}_vignette${Number(vignette)}`,
        vertex,
        `skybox-vertex:${Number(sun)}:${Number(vignette)}`,
        'skybox'
      )
    }
  }

  for (const mode of SKYBOX_MODES) {
    for (const sun of [false, true]) {
      for (const vignette of [false, true]) {
        for (const mrt of [false, true]) {
          const { wgsl } = composeSkyboxFragmentShader({
            mode,
            effects: { sun, vignette },
            mrt,
          })
          yield record(
            `skybox_${mode}_sun${Number(sun)}_vignette${Number(vignette)}_mrt${Number(mrt)}`,
            wgsl,
            `skybox:${mode}:${Number(sun)}:${Number(vignette)}:${Number(mrt)}`,
            'skybox'
          )
        }
      }
    }
  }
}

/**
 *
 */
export function* enumerateAds(): Generator<ShaderRecord> {
  const { wgsl } = composeAdsDensityComputeShader()
  yield record('ads-density-compute', wgsl, 'ads-density', 'ads')
}

const COMPUTE_MODES: readonly ComputeQuantumMode[] = [
  'harmonicOscillator',
  'hydrogenND',
  'hydrogenNDCoupled',
]
const TERM_COUNTS = [undefined, 1, 2, 3, 4, 5, 6, 7, 8] as const
const WIGNER_DIMS = Array.from({ length: 9 }, (_, i) => i + 3) // 3..11

/**
 *
 */
export function* enumerateWigner(): Generator<ShaderRecord> {
  for (const mode of COMPUTE_MODES) {
    for (const dimension of WIGNER_DIMS) {
      for (const termCount of TERM_COUNTS) {
        if (mode !== 'harmonicOscillator' && termCount !== undefined) continue
        const { wgsl: cache } = composeWignerCacheComputeShader({
          dimension,
          quantumMode: mode,
          ...(termCount !== undefined ? { termCount } : {}),
        })
        yield record(
          `wigner-cache_${mode}_d${dimension}_tc${termCount ?? 'any'}`,
          cache,
          `wigner-cache:${mode}:${dimension}:${termCount ?? 'any'}`,
          'wigner'
        )

        const { wgsl: spatial } = composeWignerSpatialComputeShader({
          dimension,
          quantumMode: mode,
          ...(termCount !== undefined ? { termCount } : {}),
        })
        yield record(
          `wigner-spatial_${mode}_d${dimension}_tc${termCount ?? 'any'}`,
          spatial,
          `wigner-spatial:${mode}:${dimension}:${termCount ?? 'any'}`,
          'wigner'
        )
      }
    }
  }

  const { wgsl: reconstruct } = composeWignerReconstructComputeShader()
  yield record('wigner-reconstruct', reconstruct, 'wigner-reconstruct', 'wigner')
}

/**
 *
 */
export function* enumerateDensityGridEigenCache(): Generator<ShaderRecord> {
  const { wgsl: eig } = composeEigenfunctionCacheComputeShader()
  yield record('eigenfunction-cache-compute', eig, 'eigenfunction-cache', 'passes')

  const formats: DensityGridComputeConfig['storageFormat'][] = ['r16float', 'rgba16float']
  for (const mode of COMPUTE_MODES) {
    for (const dimension of WIGNER_DIMS) {
      for (const termCount of TERM_COUNTS) {
        if (mode !== 'harmonicOscillator' && termCount !== undefined) continue
        for (const storageFormat of formats) {
          for (const useDensityMatrix of [false, true]) {
            const { wgsl } = composeDensityGridComputeShader({
              dimension,
              quantumMode: mode,
              ...(termCount !== undefined ? { termCount } : {}),
              ...(storageFormat !== undefined ? { storageFormat } : {}),
              useDensityMatrix,
            })
            yield record(
              `density-grid_${mode}_d${dimension}_tc${termCount ?? 'any'}_${storageFormat}_${useDensityMatrix ? 'dm' : 'pure'}`,
              wgsl,
              `density-grid:${mode}:${dimension}:${termCount ?? 'any'}:${storageFormat}:${Number(useDensityMatrix)}`,
              'passes'
            )
          }
        }
      }
    }
  }
}
