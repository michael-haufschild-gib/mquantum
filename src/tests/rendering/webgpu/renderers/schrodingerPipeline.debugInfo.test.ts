import { beforeEach, describe, expect, it } from 'vitest'

import { buildShaderConfig } from '@/rendering/webgpu/renderers/rendererConfigUtils'
import {
  clearSchrodingerPipelineCache,
  createSchrodingerPipeline,
} from '@/rendering/webgpu/renderers/schrodingerPipeline'
import type { SchrodingerRendererConfig } from '@/rendering/webgpu/renderers/schrodingerRendererTypes'
import type { ModeSetupResult } from '@/rendering/webgpu/renderers/strategies/types'
import { installWebGPUMock, mockWebGPU } from '@/tests/__mocks__/webgpu'

const emptyModeSetup: ModeSetupResult = {
  initPromises: [],
  additionalLayoutEntries: [],
  getBindGroupEntries: () => [],
}

const deps = {
  createShaderModule: (device: GPUDevice, code: string, label: string) =>
    device.createShaderModule({ label, code }),
  createUniformBuffer: (device: GPUDevice, size: number, label: string) =>
    device.createBuffer({
      label,
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
}

describe('createSchrodingerPipeline shader debug info', () => {
  beforeEach(() => {
    installWebGPUMock()
    clearSchrodingerPipelineCache()
  })

  it('returns authoritative shader lengths, modules, and features for the performance monitor', async () => {
    const rendererConfig = {
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      isosurface: false,
      temporal: false,
      colorAlgorithm: 4,
    } satisfies SchrodingerRendererConfig
    const shaderConfig = buildShaderConfig(rendererConfig)

    const resources = await createSchrodingerPipeline(
      mockWebGPU.device,
      rendererConfig,
      shaderConfig,
      emptyModeSetup,
      2,
      deps
    )

    expect(resources.shaderDebugInfo).toMatchObject({ name: 'object' })
    expect(resources.shaderDebugInfo.vertexShaderLength).toBeGreaterThan(0)
    expect(resources.shaderDebugInfo.fragmentShaderLength).toBeGreaterThan(0)
    expect(resources.shaderDebugInfo.activeModules.length).toBeGreaterThan(0)
    expect(resources.shaderDebugInfo.features).toContain('Volumetric Mode')
  })
})
