/**
 * Post-processing pass construction and registration.
 *
 * Creates pass instances from config and registers them with the render graph.
 * Separated from scenePassSetup.ts to keep both files under the line limit.
 *
 * @module rendering/webgpu/scenePassConstruction
 */

import type { WebGPURenderPass } from './core/types'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import { BloomPass } from './passes/BloomPass'
import { BufferPreviewPass } from './passes/BufferPreviewPass'
import { DebugOverlayPass } from './passes/DebugOverlayPass'
import { EnvironmentCompositePass } from './passes/EnvironmentCompositePass'
import { FrameBlendingPass } from './passes/FrameBlendingPass'
import { FXAAPass } from './passes/FXAAPass'
import { LightGizmoPass } from './passes/LightGizmoPass'
import { PaperTexturePass } from './passes/PaperTexturePass'
import { ScenePass } from './passes/ScenePass'
import { SMAAPass } from './passes/SMAAPass'
import { ToneMappingCinematicPass } from './passes/ToneMappingCinematicPass'
import { ToScreenPass } from './passes/ToScreenPass'
import { WebGPUSkyboxRenderer } from './renderers/WebGPUSkyboxRenderer'
import { computeCasSharpnessFromRenderScale, type PassConfig } from './scenePassConfig'
import { parseHexColorToLinearRgb } from './utils/color'

/** Labeled pass for parallel init and ordered registration. */
export interface LabeledPass {
  pass: WebGPURenderPass
  label: string
  /** Resource to register before this pass (null = no resource needed). */
  resource: { name: string; format: GPUTextureFormat; extraUsage?: number } | null
}

/** Construct all PP passes from config, returning them in pipeline order. */
export function constructPPPasses(config: PassConfig): LabeledPass[] {
  const backgroundLinear = parseHexColorToLinearRgb(config.backgroundColor, [0, 0, 0])
  const useTemporalCloud =
    config.objectType === 'schroedinger' && config.temporalReprojectionEnabled

  // HDR buffer chain
  const tonemapInput = config.frameBlendingEnabled
    ? 'frame-blend-output'
    : config.bloomEnabled
      ? 'bloom-output'
      : 'hdr-color'
  const aaInput = config.paperEnabled ? 'paper-output' : 'ldr-color'
  const hasAA = config.antiAliasingMethod === 'fxaa' || config.antiAliasingMethod === 'smaa'
  const toScreenInput = hasAA ? 'final-color' : aaInput

  const passes: LabeledPass[] = []

  // Scene / skybox
  passes.push({
    pass: config.skyboxEnabled
      ? new WebGPUSkyboxRenderer({ mode: config.skyboxMode, sun: false, vignette: false })
      : new ScenePass({
          outputResource: 'scene-render',
          depthResource: 'depth-buffer',
          mode: 'clear',
          clearColor: {
            r: backgroundLinear[0],
            g: backgroundLinear[1],
            b: backgroundLinear[2],
            a: 1,
          },
        }),
    label: config.skyboxEnabled ? 'skybox' : 'scene-pass',
    resource: null,
  })

  // Environment composite
  passes.push({
    pass: new EnvironmentCompositePass({
      lensedEnvironmentInput: 'scene-render',
      mainObjectInput: 'object-color',
      mainObjectDepthInput: 'depth-buffer',
      outputResource: 'hdr-color',
    }),
    label: 'environment-composite',
    resource: null,
  })

  // Bloom (optional)
  if (config.bloomEnabled) {
    passes.push({
      pass: new BloomPass({
        inputResource: 'hdr-color',
        bloomInputResource: 'object-color',
        outputResource: 'bloom-output',
      }),
      label: 'bloom',
      resource: { name: 'bloom-output', format: 'rgba16float' },
    })
  }

  // Frame blending (optional)
  if (config.frameBlendingEnabled) {
    passes.push({
      pass: new FrameBlendingPass({
        colorInput: config.bloomEnabled ? 'bloom-output' : 'hdr-color',
        outputResource: 'frame-blend-output',
        blendFactor: 0.15,
      }),
      label: 'frame-blending',
      resource: {
        name: 'frame-blend-output',
        format: 'rgba16float',
        extraUsage: GPUTextureUsage.COPY_SRC,
      },
    })
  }

  // Tonemapping (always)
  passes.push({
    pass: new ToneMappingCinematicPass({ colorInput: tonemapInput, outputResource: 'ldr-color' }),
    label: 'tonemapping-cinematic',
    resource: null,
  })

  // Paper texture (optional)
  if (config.paperEnabled) {
    passes.push({
      pass: new PaperTexturePass({ colorInput: 'ldr-color', outputResource: 'paper-output' }),
      label: 'paper-texture',
      resource: { name: 'paper-output', format: 'rgba8unorm' },
    })
  }

  // Anti-aliasing (optional, mutually exclusive)
  if (config.antiAliasingMethod === 'fxaa') {
    passes.push({
      pass: new FXAAPass({
        colorInput: aaInput,
        outputResource: 'final-color',
        subpixelQuality: 0.75,
      }),
      label: 'fxaa',
      resource: null,
    })
  } else if (config.antiAliasingMethod === 'smaa') {
    passes.push({
      pass: new SMAAPass({
        colorInput: aaInput,
        outputResource: 'final-color',
        threshold: 0.1,
        maxSearchSteps: 16,
      }),
      label: 'smaa',
      resource: null,
    })
  }

  // To screen (always)
  passes.push({
    pass: new ToScreenPass({
      inputResource: toScreenInput,
      gammaCorrection: true,
      sharpness: computeCasSharpnessFromRenderScale(config.renderResolutionScale ?? 1),
    }),
    label: 'to-screen',
    resource: null,
  })

  // Buffer preview
  const additionalInputs = useTemporalCloud ? ['quarter-position'] : undefined
  passes.push({
    pass: new BufferPreviewPass({
      bufferInput: 'depth-buffer',
      additionalInputs,
      bufferType: 'depth',
      depthMode: 'linear',
    }),
    label: 'buffer-preview',
    resource: null,
  })

  // Light gizmo + debug overlay
  passes.push({
    pass: new LightGizmoPass({ outputResource: 'gizmo-texture' }),
    label: 'light-gizmo',
    resource: { name: 'gizmo-texture', format: 'rgba8unorm' },
  })
  passes.push({
    pass: new DebugOverlayPass({ debugInput: 'gizmo-texture' }),
    label: 'debug-overlay',
    resource: null,
  })

  return passes
}

/** Register pre-initialized passes and their resources in pipeline order. */
export function registerPasses(graph: WebGPURenderGraph, passes: LabeledPass[]): void {
  for (const { pass, resource } of passes) {
    if (resource) {
      graph.addResource(resource.name, {
        type: 'texture',
        format: resource.format,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          (resource.extraUsage ?? 0),
      })
    }
    graph.addInitializedPass(pass)
  }
}
