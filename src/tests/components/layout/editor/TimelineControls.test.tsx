import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TimelineControls } from '@/components/layout/TimelineControls';

vi.mock('@/stores/geometryStore', () => ({
  useGeometryStore: vi.fn((selector) => {
    const state = {
      dimension: 4,
      objectType: 'hypercube',
    };
    return selector ? selector(state) : state;
  }),
}));

const mockRandomizePlanes = vi.fn();

vi.mock('@/stores/animationStore', () => ({
  useAnimationStore: vi.fn((selector) => {
    const state = {
      isPlaying: false,
      speed: 1,
      direction: 1,
      animatingPlanes: new Set(['XY']),
      toggle: vi.fn(),
      setSpeed: vi.fn(),
      toggleDirection: vi.fn(),
      togglePlane: vi.fn(),
      stopAll: vi.fn(),
      animateAll: vi.fn(),
      randomizePlanes: mockRandomizePlanes,
      resetToFirstPlane: vi.fn(),
      clearAllPlanes: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
  MIN_SPEED: 0.1,
  MAX_SPEED: 5,
}));

vi.mock('@/stores/uiStore', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      animationBias: 0,
      setAnimationBias: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/stores/defaults/visualDefaults', () => ({
  MIN_ANIMATION_BIAS: 0,
  MAX_ANIMATION_BIAS: 1,
}));

vi.mock('@/stores/extendedObjectStore', () => ({
  useExtendedObjectStore: vi.fn((selector) => {
    const state = {
        mandelbulb: {
            powerAnimationEnabled: false,
            sliceAnimationEnabled: false,
            phaseShiftEnabled: false,
            alternatePowerEnabled: false,
        },
        // NOTE: quaternionJulia has no animations - shape morphing via 4D+ rotation
        quaternionJulia: {},
        polytope: {
            truncationEnabled: false,
            facetOffsetEnabled: false,
            dualMorphEnabled: false,
            explodeEnabled: false,
        },
        schroedinger: {
            curlEnabled: false,
            sliceAnimationEnabled: false,
            spreadAnimationEnabled: false,
        },
        blackhole: {
            swirlAnimationEnabled: false,
            pulseEnabled: false,
        },
        setMandelbulbPowerAnimationEnabled: vi.fn(),
        setMandelbulbPowerMin: vi.fn(),
        setMandelbulbPowerMax: vi.fn(),
        setMandelbulbPowerSpeed: vi.fn(),
        setMandelbulbSliceAnimationEnabled: vi.fn(),
        setMandelbulbSliceSpeed: vi.fn(),
        setMandelbulbSliceAmplitude: vi.fn(),
        setMandelbulbJuliaModeEnabled: vi.fn(),
        setMandelbulbJuliaOrbitSpeed: vi.fn(),
        setMandelbulbJuliaOrbitRadius: vi.fn(),
        setMandelbulbPhaseShiftEnabled: vi.fn(),
        setMandelbulbPhaseSpeed: vi.fn(),
        setMandelbulbPhaseAmplitude: vi.fn(),
        // Quaternion Julia setters
        setQuaternionJuliaConstantAnimationEnabled: vi.fn(),
        setQuaternionJuliaPowerAnimationEnabled: vi.fn(),
        setQuaternionJuliaOriginDriftEnabled: vi.fn(),
        setQuaternionJuliaDimensionMixEnabled: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T,>(selector: T) => selector,
}));

// Mock the sound manager
vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playHover: vi.fn(),
    playSwish: vi.fn(),
  },
}));

describe('TimelineControls', () => {
  it('toggles Rotate drawer when button is clicked', async () => {
    render(<TimelineControls />);

    // Check initial state - button text is "Rotate"
    const rotButton = screen.getByText(/Rotate/i);
    expect(rotButton).toBeInTheDocument();

    // Plane buttons should NOT be visible yet
    expect(screen.queryByText('XY', { selector: 'button' })).not.toBeInTheDocument();

    // Click Rotate button
    fireEvent.click(rotButton);

    // Now drawer should be open, and "XY" button visible
    expect(screen.getByText('XY')).toBeInTheDocument();

    // Click Rotate again to close
    fireEvent.click(rotButton);
    await waitFor(() => {
      expect(screen.queryByText('XY', { selector: 'button' })).not.toBeInTheDocument();
    });
  });

  it('does not show Stop All button in main bar, but shows Deselect All in drawer', () => {
    render(<TimelineControls />);

    // Stop All button should be removed from main bar
    expect(screen.queryByTitle("Stop All")).not.toBeInTheDocument();

    // Open drawer
    const rotButton = screen.getByText(/Rotate/i);
    fireEvent.click(rotButton);

    // Deselect All button (functionally the stop button) should be in drawer
    expect(screen.getByText("Deselect All")).toBeInTheDocument();
  });

  it('shows randomize button in rotation drawer', () => {
    render(<TimelineControls />);

    // Open rotation drawer
    const rotButton = screen.getByText(/Rotate/i);
    fireEvent.click(rotButton);

    // Check for dice/randomize button
    const randomizeButton = screen.getByRole('button', { name: /randomize rotation planes/i });
    expect(randomizeButton).toBeInTheDocument();
  });

  it('calls randomizePlanes when dice button is clicked', () => {
    render(<TimelineControls />);

    // Open rotation drawer
    const rotButton = screen.getByText(/Rotate/i);
    fireEvent.click(rotButton);

    // Click randomize button
    const randomizeButton = screen.getByRole('button', { name: /randomize rotation planes/i });
    fireEvent.click(randomizeButton);

    // Verify randomizePlanes was called with the current dimension (4)
    expect(mockRandomizePlanes).toHaveBeenCalledWith(4);
  });

  it('closes rotation drawer when close button is clicked', async () => {
    render(<TimelineControls />);

    // Open rotation drawer
    const rotButton = screen.getByText(/Rotate/i);
    fireEvent.click(rotButton);

    // Drawer should be open
    expect(screen.getByText('XY')).toBeInTheDocument();

    // Click close button (floating close button uses "Close drawer" aria label)
    const closeButton = screen.getByRole('button', { name: /close drawer/i });
    fireEvent.click(closeButton);

    // Drawer should be closed
    await waitFor(() => {
      expect(screen.queryByText('XY', { selector: 'button' })).not.toBeInTheDocument();
    });
  });
});
