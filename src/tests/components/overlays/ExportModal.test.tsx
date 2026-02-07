import { render, screen } from '@testing-library/react'
import { ExportModal } from '@/components/overlays/ExportModal'
import { useExportStore } from '@/stores/exportStore'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock dependencies
vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}))

vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playSuccess: vi.fn(),
    playHover: vi.fn(),
    playSwish: vi.fn(),
  },
}))

vi.mock('@/components/overlays/export/ExportPreview', () => ({
  ExportPreview: () => <div data-testid="export-preview">Preview</div>,
}))

vi.mock('@/components/overlays/export/ExportPresets', () => ({
  ExportPresets: () => <div data-testid="export-presets">Presets</div>,
}))

vi.mock('@/components/overlays/export/ExportGeneralTab', () => ({
  ExportGeneralTab: () => <div data-testid="export-general">General</div>,
}))

vi.mock('@/components/overlays/export/ExportTextTab', () => ({
  ExportTextTab: () => <div data-testid="export-text">Text</div>,
}))

vi.mock('@/components/overlays/export/ExportAdvancedTab', () => ({
  ExportAdvancedTab: () => <div data-testid="export-advanced">Advanced</div>,
}))

describe('ExportModal', () => {
  beforeEach(() => {
    // Reset store state with valid ExportMode and complete settings
    useExportStore.setState({
      isModalOpen: true,
      status: 'idle',
      exportMode: 'in-memory',
      estimatedSizeMB: 10,
      settings: {
        format: 'mp4',
        codec: 'avc',
        resolution: '1080p',
        customWidth: 1920,
        customHeight: 1080,
        fps: 60,
        duration: 10,
        bitrate: 10,
        bitrateMode: 'constant',
        hardwareAcceleration: 'prefer-software',
        warmupFrames: 5,
        rotation: 0,
        textOverlay: {
          enabled: false,
          text: 'mdimension',
          fontFamily: 'Inter, sans-serif',
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: 0,
          color: '#ffffff',
          opacity: 1,
          shadowColor: 'rgba(0,0,0,0.5)',
          shadowBlur: 10,
          verticalPlacement: 'bottom',
          horizontalPlacement: 'center',
          padding: 20,
        },
        crop: {
          enabled: false,
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
      },
    })
  })

  it('renders presets tab content by default', () => {
    render(<ExportModal />)
    // Default tab is 'presets'
    expect(screen.getByTestId('export-presets')).toBeInTheDocument()
  })
})
