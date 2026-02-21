import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportPreview } from '@/components/overlays/export/ExportPreview'
import { useExportStore } from '@/stores/exportStore'

vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}))

describe('ExportPreview', () => {
  beforeEach(() => {
    useExportStore.setState((state) => ({
      ...state,
      canvasAspectRatio: 16 / 9,
      previewImage: 'data:image/png;base64,mock',
      settings: {
        ...state.settings,
        crop: { ...state.settings.crop, enabled: false, x: 0, y: 0, width: 1, height: 1 },
        textOverlay: {
          ...state.settings.textOverlay,
          enabled: true,
          text: 'Font parity',
          fontFamily: 'Courier New, monospace',
        },
      },
    }))
  })

  it('uses textOverlay.fontFamily when rendering preview text', () => {
    render(<ExportPreview />)
    expect(screen.getByText('Font parity').getAttribute('style')).toContain('Courier New')
  })
})
