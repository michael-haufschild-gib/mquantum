import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportPresets } from '@/components/overlays/export/ExportPresets'
import { useExportStore } from '@/stores/runtime/exportStore'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'

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
      canvasAspectRatio: 16 / 9,
      lastAppliedPreset: null,
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

  it('keeps the clicked preset active when two presets share identical settings', async () => {
    const user = userEvent.setup()

    render(<ExportPresets />)

    const twitterButton = screen.getByRole('button', { name: /Twitter \/ X/ })
    const landscape720Button = screen.getByRole('button', { name: /Landscape 720p/ })

    await user.click(twitterButton)

    expect(within(twitterButton).getByTestId('icon-check')).toBeInTheDocument()
    expect(within(landscape720Button).queryByTestId('icon-check')).not.toBeInTheDocument()
  })

  it('does not mark a platform preset active when encoding has drifted', () => {
    useExportStore.setState((state) => ({
      lastAppliedPreset: 'twitter-video',
      settings: {
        ...state.settings,
        format: 'webm',
        codec: 'vp9',
        resolution: '720p',
        fps: 30,
        duration: 30,
        bitrate: 8,
        crop: { ...state.settings.crop, enabled: false },
      },
    }))

    render(<ExportPresets />)

    const twitterButton = screen.getByRole('button', { name: /Twitter \/ X/ })
    expect(within(twitterButton).queryByTestId('icon-check')).not.toBeInTheDocument()
  })

  it('marks a crop preset active only when the crop rectangle still matches', () => {
    useExportStore.getState().setCanvasAspectRatio(16 / 9)
    useExportStore.getState().applyPreset('instagram')

    render(<ExportPresets />)

    const instagramButton = screen.getByRole('button', { name: /Instagram/ })
    expect(within(instagramButton).getByTestId('icon-check')).toBeInTheDocument()
  })

  it('does not mark a crop preset active when crop geometry has drifted', () => {
    useExportStore.setState((state) => ({
      canvasAspectRatio: 16 / 9,
      lastAppliedPreset: 'instagram',
      settings: {
        ...state.settings,
        format: 'mp4',
        codec: 'avc',
        resolution: 'custom',
        customWidth: 1080,
        customHeight: 1080,
        fps: 30,
        duration: 60,
        bitrate: 10,
        crop: { ...state.settings.crop, enabled: true, x: 0, y: 0, width: 1, height: 1 },
      },
    }))

    render(<ExportPresets />)

    const instagramButton = screen.getByRole('button', { name: /Instagram/ })
    expect(within(instagramButton).queryByTestId('icon-check')).not.toBeInTheDocument()
  })
})
