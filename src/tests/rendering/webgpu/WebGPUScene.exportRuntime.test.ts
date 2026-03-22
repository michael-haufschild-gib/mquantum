import { describe, expect, it } from 'vitest'

import { isExportRuntimeActive } from '@/rendering/webgpu/sceneExportRuntime'

describe('WebGPUScene export runtime state', () => {
  it('treats fully idle runtime state as inactive', () => {
    expect(
      isExportRuntimeActive({
        starting: false,
        started: false,
        processing: false,
        finishing: false,
        canceling: false,
      })
    ).toBe(false)
  })

  it('treats each individual active phase as active', () => {
    const phases = ['starting', 'started', 'processing', 'finishing', 'canceling'] as const

    for (const phase of phases) {
      const runtime = {
        starting: false,
        started: false,
        processing: false,
        finishing: false,
        canceling: false,
      }
      runtime[phase] = true

      expect(isExportRuntimeActive(runtime), `${phase}=true should be active`).toBe(true)
    }
  })

  it('treats multiple simultaneous active phases as active', () => {
    expect(
      isExportRuntimeActive({
        starting: true,
        started: true,
        processing: true,
        finishing: false,
        canceling: false,
      })
    ).toBe(true)
  })
})
