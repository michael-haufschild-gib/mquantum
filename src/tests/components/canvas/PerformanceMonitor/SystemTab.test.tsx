import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SystemTabContent } from '@/components/canvas/PerformanceMonitor/tabs/SystemTab'
import { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore'
import { useRendererStore } from '@/stores/rendererStore'

function seedSystemMetrics(): void {
  usePerformanceMetricsStore.setState({
    gpuName: 'Mock GPU Adapter',
    viewport: { width: 1920, height: 1080, dpr: 2 },
    vram: { geometries: 120, textures: 64, total: 512 },
  })
}

describe('SystemTabContent', () => {
  beforeEach(() => {
    useRendererStore.getState().reset()
    seedSystemMetrics()
  })

  it('shows Hardware renderer mode when adapter mode is explicit', () => {
    useRendererStore.getState().completeDetection({
      supported: true,
      adapterMode: 'hardware',
      adapterModeEstimated: false,
    })

    render(<SystemTabContent />)

    expect(screen.getByText('Renderer')).toBeInTheDocument()
    expect(screen.getByText('Hardware')).toBeInTheDocument()
    expect(screen.queryByText(/estimated/i)).not.toBeInTheDocument()
  })

  it('shows Software renderer mode as estimated when heuristic detection is used', () => {
    useRendererStore.getState().completeDetection({
      supported: true,
      adapterMode: 'software',
      adapterModeEstimated: true,
    })

    render(<SystemTabContent />)

    expect(screen.getByText('Software (estimated)')).toBeInTheDocument()
  })
})
