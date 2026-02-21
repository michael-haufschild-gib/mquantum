import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportPresets } from '@/components/overlays/export/ExportPresets'
import { useExportStore } from '@/stores/exportStore'
import { usePerformanceStore } from '@/stores/performanceStore'

vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}))

vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playHover: vi.fn(),
  },
}))

describe('ExportPresets', () => {
  beforeEach(() => {
    usePerformanceStore.setState({ isMobileGPU: false })
    useExportStore.setState((state) => ({
      settings: {
        ...state.settings,
        format: 'mp4',
        codec: 'avc',
        resolution: '1080p',
        fps: 60,
        duration: 30,
        bitrate: 12,
        crop: { ...state.settings.crop, enabled: false, x: 0, y: 0, width: 1, height: 1 },
      },
    }))
  })

  it('shows one active preset indicator for matching current settings', () => {
    render(<ExportPresets />)
    expect(screen.queryAllByTestId('icon-check')).toHaveLength(1)
  })
})

