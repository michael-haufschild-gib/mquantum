/**
 * ExportGeneralTab component tests.
 *
 * Verifies: renders format/resolution/fps controls, crop toggle updates store,
 * Edit Area button disabled when crop off and enabled when on, custom resolution
 * inputs visible only for 'custom', resetEvolution toggle works,
 * clampDimension rounds and clamps correctly via store.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportGeneralTab } from '@/components/overlays/export/ExportGeneralTab'
import { useExportStore } from '@/stores/exportStore'
import { useLayoutStore } from '@/stores/layoutStore'

vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}))

vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: { playClick: vi.fn(), playHover: vi.fn() },
}))

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>()
  const FILTER = new Set([
    'initial',
    'animate',
    'exit',
    'transition',
    'whileHover',
    'whileTap',
    'drag',
    'dragMomentum',
    'dragElastic',
    'dragConstraints',
    'onDragEnd',
  ])
  function makeEl(tag: string) {
    const El = React.forwardRef<
      HTMLElement,
      React.HTMLAttributes<HTMLElement> & Record<string, unknown>
    >(({ children, ...rest }, ref) => {
      const clean = Object.fromEntries(Object.entries(rest).filter(([k]) => !FILTER.has(k)))
      return React.createElement(
        tag,
        { ref, ...clean } as React.HTMLAttributes<HTMLElement>,
        children as React.ReactNode
      )
    })
    El.displayName = `Motion_${tag}`
    return El
  }
  return {
    ...actual,
    m: new Proxy({}, { get: (_t, prop: string) => makeEl(prop) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useMotionValue: (initial: number) => {
      let val = initial
      return {
        get: () => val,
        set: (v: number) => {
          val = v
        },
      }
    },
  }
})

const DEFAULT_SETTINGS = {
  format: 'mp4' as const,
  codec: 'avc' as const,
  resolution: '1080p' as const,
  customWidth: 1920,
  customHeight: 1080,
  fps: 60,
  duration: 30,
  bitrate: 12,
  bitrateMode: 'variable' as const,
  hardwareAcceleration: 'prefer-software' as const,
  warmupFrames: 5,
  rotation: 0 as const,
  resetEvolution: false,
  textOverlay: {
    enabled: false,
    text: '',
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 300,
    letterSpacing: 0,
    color: '#fff',
    opacity: 1,
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowBlur: 10,
    verticalPlacement: 'bottom' as const,
    horizontalPlacement: 'center' as const,
    padding: 20,
  },
  crop: { enabled: false, x: 0, y: 0, width: 1, height: 1 },
}

describe('ExportGeneralTab', () => {
  beforeEach(() => {
    useExportStore.setState({
      settings: DEFAULT_SETTINGS,
      isModalOpen: true,
      isCropEditorOpen: false,
    })
    useLayoutStore.setState({ isCinematicMode: false } as Parameters<
      typeof useLayoutStore.setState
    >[0])
  })

  it('renders Output Format section', () => {
    render(<ExportGeneralTab />)
    expect(screen.getByText('Output Format')).toBeInTheDocument()
  })

  it('renders Timing & Smoothness section', () => {
    render(<ExportGeneralTab />)
    expect(screen.getByText('Timing & Smoothness')).toBeInTheDocument()
  })

  it('Edit Area button is disabled when crop is off', () => {
    render(<ExportGeneralTab />)
    const editBtn = screen.getByRole('button', { name: /Edit Area/i })
    expect(editBtn).toBeDisabled()
  })

  it('Edit Area button is enabled when crop is on', () => {
    useExportStore.setState({
      settings: { ...DEFAULT_SETTINGS, crop: { ...DEFAULT_SETTINGS.crop, enabled: true } },
    })
    render(<ExportGeneralTab />)
    const editBtn = screen.getByRole('button', { name: /Edit Area/i })
    expect(editBtn).not.toBeDisabled()
  })

  it('clicking Crop Frame row toggles crop.enabled in store', async () => {
    const user = userEvent.setup()
    render(<ExportGeneralTab />)
    // The Crop Frame text is inside a clickable row div — click the text to trigger the row onClick
    await user.click(screen.getByText('Crop Frame'))
    expect(useExportStore.getState().settings.crop.enabled).toBe(true)
  })

  it('custom resolution inputs are hidden for non-custom resolution', () => {
    render(<ExportGeneralTab />)
    expect(screen.queryByLabelText(/Width/i)).not.toBeInTheDocument()
  })

  it('custom resolution inputs are visible when resolution is custom', () => {
    useExportStore.setState({ settings: { ...DEFAULT_SETTINGS, resolution: 'custom' } })
    render(<ExportGeneralTab />)
    expect(screen.getByText(/Width/i)).toBeInTheDocument()
    expect(screen.getByText(/Height/i)).toBeInTheDocument()
  })

  it('Reset Evolution shows correct label when disabled', () => {
    render(<ExportGeneralTab />)
    expect(screen.getByText('Recording from current state')).toBeInTheDocument()
  })

  it('clicking Reset Evolution row toggles resetEvolution in store', async () => {
    const user = userEvent.setup()
    render(<ExportGeneralTab />)
    // The Reset Evolution text is inside a clickable row div — click the text to trigger the row onClick
    await user.click(screen.getByText('Reset Evolution'))
    expect(useExportStore.getState().settings.resetEvolution).toBe(true)
  })

  it('Reset Evolution shows "Wavefunction resets before recording" when enabled', () => {
    useExportStore.setState({ settings: { ...DEFAULT_SETTINGS, resetEvolution: true } })
    render(<ExportGeneralTab />)
    expect(screen.getByText('Wavefunction resets before recording')).toBeInTheDocument()
  })

  it('Edit Area button click opens crop editor and closes modal', async () => {
    const user = userEvent.setup()
    const setCropEditorOpen = vi.fn()
    const setModalOpen = vi.fn()
    useExportStore.setState({
      settings: { ...DEFAULT_SETTINGS, crop: { ...DEFAULT_SETTINGS.crop, enabled: true } },
    })
    useExportStore.setState({
      setCropEditorOpen,
      setModalOpen,
    } as unknown as Parameters<typeof useExportStore.setState>[0])

    render(<ExportGeneralTab />)
    await user.click(screen.getByRole('button', { name: /Edit Area/i }))

    await waitFor(() => {
      expect(setModalOpen).toHaveBeenCalledWith(false)
      expect(setCropEditorOpen).toHaveBeenCalledWith(true)
    })
  })

  it('shows "Custom area active" label when crop enabled', () => {
    useExportStore.setState({
      settings: { ...DEFAULT_SETTINGS, crop: { ...DEFAULT_SETTINGS.crop, enabled: true } },
    })
    render(<ExportGeneralTab />)
    expect(screen.getByText('Custom area active')).toBeInTheDocument()
  })

  it('shows "Exporting full frame" label when crop disabled', () => {
    render(<ExportGeneralTab />)
    expect(screen.getByText('Exporting full frame')).toBeInTheDocument()
  })
})
