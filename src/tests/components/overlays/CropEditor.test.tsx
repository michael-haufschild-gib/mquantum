/**
 * CropEditor component tests.
 *
 * Verifies: hidden when store closed, renders toolbar/buttons when open,
 * aspect ratio presets set correct crop dimensions, confirm/cancel call
 * store actions, crop label shows percentage dimensions.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CropEditor } from '@/components/overlays/CropEditor'
import { useExportStore } from '@/stores/runtime/exportStore'
import { useLayoutStore } from '@/stores/ui/layoutStore'

const MOTION_FILTER_KEYS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'drag',
  'dragMomentum',
  'dragElastic',
  'dragConstraints',
  'onDragEnd',
  'whileHover',
  'whileTap',
])

function makeMotionEl(tag: string) {
  const El = React.forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement> & Record<string, unknown>
  >(({ children, ...rest }, ref) => {
    const clean = Object.fromEntries(
      Object.entries(rest).filter(([k]) => !MOTION_FILTER_KEYS.has(k))
    )
    return React.createElement(
      tag,
      { ref, ...clean } as React.HTMLAttributes<HTMLElement>,
      children as React.ReactNode
    )
  })
  El.displayName = `Motion_${tag}`
  return El
}

// Mock motion/react — provide all HTML element proxies used by CropEditor + Button
vi.mock('motion/react', () => ({
  m: new Proxy({}, { get: (_t, prop: string) => makeMotionEl(prop) }),
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
}))

// Mock CropBox — it has its own test suite
vi.mock('@/components/overlays/CropBox', () => ({
  CropBox: ({ onCropChange, crop }: { onCropChange: (c: unknown) => void; crop: unknown }) => (
    <div
      data-testid="crop-box-mock"
      data-crop={JSON.stringify(crop)}
      onClick={() => onCropChange({ x: 0.2, y: 0.2, width: 0.6, height: 0.6 })}
    />
  ),
}))

// Mock captureScreenshotAsync
vi.mock('@/hooks/useScreenshotCapture', () => ({
  captureScreenshotAsync: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
}))

vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}))

vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: { playClick: vi.fn(), playHover: vi.fn() },
}))

function renderWithToast(ui: React.ReactElement) {
  // CropEditor uses useToast — wrap with a minimal context or mock
  return render(ui)
}

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

describe('CropEditor', () => {
  beforeEach(() => {
    useExportStore.setState({
      isCropEditorOpen: false,
      settings: {
        format: 'mp4',
        codec: 'avc',
        resolution: '1080p',
        customWidth: 1920,
        customHeight: 1080,
        fps: 60,
        duration: 30,
        bitrate: 12,
        bitrateMode: 'variable',
        hardwareAcceleration: 'prefer-software',
        warmupFrames: 5,
        rotation: 0,
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
          verticalPlacement: 'bottom',
          horizontalPlacement: 'center',
          padding: 20,
        },
        crop: { enabled: false, x: 0, y: 0, width: 1, height: 1 },
      },
    })
    useLayoutStore.setState({ isCinematicMode: false } as Parameters<
      typeof useLayoutStore.setState
    >[0])
  })

  it('renders nothing when isCropEditorOpen is false', () => {
    renderWithToast(<CropEditor />)
    expect(screen.queryByText('Crop Selection')).not.toBeInTheDocument()
  })

  it('renders toolbar when isCropEditorOpen is true', () => {
    useExportStore.setState({ isCropEditorOpen: true })
    renderWithToast(<CropEditor />)
    expect(screen.getByText('Crop Selection')).toBeInTheDocument()
    expect(screen.getByText('Confirm Area')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('shows aspect ratio preset buttons', () => {
    useExportStore.setState({ isCropEditorOpen: true })
    renderWithToast(<CropEditor />)
    expect(screen.getByRole('button', { name: '16:9' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1:1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '9:16' })).toBeInTheDocument()
  })

  it('1:1 ratio button sets equal width and height', async () => {
    const user = userEvent.setup()
    useExportStore.setState({ isCropEditorOpen: true })
    renderWithToast(<CropEditor />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    await user.click(screen.getByRole('button', { name: '1:1' }))
    // The dimensions label should show equal percentages
    const label = screen.getByText(/\d+% × \d+%/)
    const match = label.textContent!.match(/(\d+)% × (\d+)%/)!
    const [w, h] = [Number(match[1]), Number(match[2])]
    expect(w).toBe(h)
  })

  it('16:9 ratio produces wider than tall crop', async () => {
    const user = userEvent.setup()
    useExportStore.setState({ isCropEditorOpen: true })
    renderWithToast(<CropEditor />)
    // Flush setTimeout(0) that syncs crop from store
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    await user.click(screen.getByRole('button', { name: '16:9' }))
    const label = screen.getByText(/\d+% × \d+%/)
    const match = label.textContent!.match(/(\d+)% × (\d+)%/)!
    const [w, h] = [Number(match[1]), Number(match[2])]
    // 16:9 — width must be greater than height
    expect(w).toBeGreaterThan(h)
  })

  it('confirm button saves crop settings and closes editor', async () => {
    useExportStore.setState({ isCropEditorOpen: true })
    renderWithToast(<CropEditor />)

    // Use fireEvent to bypass userEvent's pointer simulation issues with motion mocks
    const confirmBtn = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('Confirm Area'))!
    expect(confirmBtn).toBeInTheDocument()

    await act(async () => {
      confirmBtn.click()
      // Flush microtasks (the async handleConfirm)
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(useExportStore.getState().isCropEditorOpen).toBe(false)
    expect(useExportStore.getState().settings.crop.enabled).toBe(true)
  })

  it('cancel button closes editor', async () => {
    useExportStore.setState({ isCropEditorOpen: true })
    renderWithToast(<CropEditor />)

    const cancelBtn = screen.getAllByRole('button').find((b) => b.textContent?.includes('Cancel'))!
    await act(async () => {
      cancelBtn.click()
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(useExportStore.getState().isCropEditorOpen).toBe(false)
  })

  it('initializes crop from store when crop.enabled and width > 0', async () => {
    useExportStore.setState({
      isCropEditorOpen: true,
      settings: {
        format: 'mp4',
        codec: 'avc',
        resolution: '1080p',
        customWidth: 1920,
        customHeight: 1080,
        fps: 60,
        duration: 30,
        bitrate: 12,
        bitrateMode: 'variable',
        hardwareAcceleration: 'prefer-software',
        warmupFrames: 5,
        rotation: 0,
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
          verticalPlacement: 'bottom',
          horizontalPlacement: 'center',
          padding: 20,
        },
        crop: { enabled: true, x: 0.2, y: 0.3, width: 0.5, height: 0.4 },
      },
    })
    renderWithToast(<CropEditor />)
    // After timeout(0) the crop syncs — label should show 50% × 40%
    await waitFor(() => {
      expect(screen.getByText(/50% × 40%/)).toBeInTheDocument()
    })
  })
})
