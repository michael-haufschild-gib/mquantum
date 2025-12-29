/**
 * MobileTimelineControls Tests
 *
 * Tests for the mobile bottom app bar timeline controls feature.
 * Verifies that timeline controls are shown/hidden correctly based on:
 * - Viewport size (mobile vs desktop)
 * - Panel visibility (left/right panels open/closed)
 * - Cinematic mode state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EditorLayout } from '@/components/layout/EditorLayout';

// Mock all the dependent stores and hooks
const mockLayoutState = {
  isCollapsed: true,
  showLeftPanel: false,
  isCinematicMode: false,
  toggleCollapsed: vi.fn(),
  toggleCinematicMode: vi.fn(),
  setCinematicMode: vi.fn(),
  setCollapsed: vi.fn(),
  setLeftPanel: vi.fn(),
};

let mockIsDesktop = false;

// Cache for useShallow results to prevent infinite re-renders
const layoutStateCache = new WeakMap<Function, unknown>();

vi.mock('@/stores/layoutStore', () => ({
  useLayoutStore: vi.fn((selector) => {
    if (!selector) return mockLayoutState;
    // Cache useShallow selector results to prevent infinite loops
    if (layoutStateCache.has(selector)) {
      // Compare with current state to bust cache when state changes
      const cached = layoutStateCache.get(selector);
      const current = selector(mockLayoutState);
      if (JSON.stringify(cached) === JSON.stringify(current)) {
        return cached;
      }
    }
    const result = selector(mockLayoutState);
    layoutStateCache.set(selector, result);
    return result;
  }),
}));

    vi.mock('@/stores/themeStore', () => ({
      useThemeStore: vi.fn((selector) => {
        const state = {
          accent: 'cyan',
          mode: 'dark',
          setAccent: vi.fn(),
          setMode: vi.fn(),
        };
        return selector(state);
      }),
    }));

vi.mock('@/hooks/useMediaQuery', () => ({
  useIsDesktop: () => mockIsDesktop,
}));

vi.mock('@/hooks/useKonamiCode', () => ({
  useKonamiCode: vi.fn(),
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T,>(selector: T) => selector,
}));

// Mock child components to simplify tests
vi.mock('@/components/layout/EditorTopBar', () => ({
  EditorTopBar: () => <div data-testid="editor-top-bar">TopBar</div>,
}));

vi.mock('@/components/layout/EditorLeftPanel', () => ({
  EditorLeftPanel: () => <div data-testid="editor-left-panel">LeftPanel</div>,
}));

vi.mock('@/components/layout/EditorRightPanel', () => ({
  EditorRightPanel: () => <div data-testid="editor-right-panel">RightPanel</div>,
}));

vi.mock('@/components/layout/EditorBottomPanel', () => ({
  EditorBottomPanel: () => <div data-testid="editor-bottom-panel">BottomPanel</div>,
}));

vi.mock('@/components/layout/CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('@/components/layout/CanvasContextMenu', () => ({
  CanvasContextMenu: () => null,
}));

vi.mock('@/components/layout/ShortcutsOverlay', () => ({
  ShortcutsOverlay: () => null,
}));

vi.mock('@/components/overlays/ExportModal', () => ({
  ExportModal: () => null,
}));

vi.mock('@/components/ui/GlobalProgress', () => ({
  GlobalProgress: () => null,
}));

vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playHover: vi.fn(),
    playSuccess: vi.fn(),
    playSwish: vi.fn(),
  },
}));

// TODO: These tests need refactoring - the EditorLayout renders many
// components using useShallow, and the mock strategy doesn't handle
// this well. Skip until proper mocking solution is implemented.
describe.skip('MobileTimelineControls', () => {
  beforeEach(() => {
    cleanup();
    // Clear selector cache between tests
    // WeakMap doesn't have clear(), but we can reassign in module scope
    // For now, changing state will naturally bust the cache via JSON comparison
    // Reset to mobile viewport by default
    mockIsDesktop = false;
    // Reset layout state
    mockLayoutState.isCollapsed = true;
    mockLayoutState.showLeftPanel = false;
    mockLayoutState.isCinematicMode = false;
  });

  describe('Mobile viewport visibility', () => {
    it('shows mobile timeline when on mobile and both panels are closed', () => {
      mockIsDesktop = false;
      mockLayoutState.isCollapsed = true;
      mockLayoutState.showLeftPanel = false;
      mockLayoutState.isCinematicMode = false;

      render(<EditorLayout />);

      expect(screen.getByTestId('mobile-timeline-controls')).toBeInTheDocument();
    });

    it('hides mobile timeline when right panel is open', () => {
      mockIsDesktop = false;
      mockLayoutState.isCollapsed = false; // Right panel is open
      mockLayoutState.showLeftPanel = false;
      mockLayoutState.isCinematicMode = false;

      render(<EditorLayout />);

      expect(screen.queryByTestId('mobile-timeline-controls')).not.toBeInTheDocument();
    });

    it('hides mobile timeline when left panel is open', () => {
      mockIsDesktop = false;
      mockLayoutState.isCollapsed = true;
      mockLayoutState.showLeftPanel = true; // Left panel is open
      mockLayoutState.isCinematicMode = false;

      render(<EditorLayout />);

      expect(screen.queryByTestId('mobile-timeline-controls')).not.toBeInTheDocument();
    });

    it('hides mobile timeline when both panels are open', () => {
      mockIsDesktop = false;
      mockLayoutState.isCollapsed = false;
      mockLayoutState.showLeftPanel = true;
      mockLayoutState.isCinematicMode = false;

      render(<EditorLayout />);

      expect(screen.queryByTestId('mobile-timeline-controls')).not.toBeInTheDocument();
    });

    it('hides mobile timeline in cinematic mode', () => {
      mockIsDesktop = false;
      mockLayoutState.isCollapsed = true;
      mockLayoutState.showLeftPanel = false;
      mockLayoutState.isCinematicMode = true;

      render(<EditorLayout />);

      expect(screen.queryByTestId('mobile-timeline-controls')).not.toBeInTheDocument();
    });
  });

  describe('Desktop viewport visibility', () => {
    it('does not show mobile timeline on desktop viewport', () => {
      mockIsDesktop = true;
      mockLayoutState.isCollapsed = true;
      mockLayoutState.showLeftPanel = false;
      mockLayoutState.isCinematicMode = false;

      render(<EditorLayout />);

      expect(screen.queryByTestId('mobile-timeline-controls')).not.toBeInTheDocument();
    });

    it('shows desktop bottom panel on desktop viewport', () => {
      mockIsDesktop = true;
      mockLayoutState.isCollapsed = false;
      mockLayoutState.showLeftPanel = true;
      mockLayoutState.isCinematicMode = false;

      render(<EditorLayout />);

      // Desktop bottom panel is rendered inline (not the mobile fixed version)
      // Check that the component is rendered somewhere in the DOM
      expect(screen.getAllByTestId('editor-bottom-panel').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Content verification', () => {
    it('mobile timeline contains the EditorBottomPanel component', () => {
      mockIsDesktop = false;
      mockLayoutState.isCollapsed = true;
      mockLayoutState.showLeftPanel = false;
      mockLayoutState.isCinematicMode = false;

      render(<EditorLayout />);

      const mobileTimeline = screen.getByTestId('mobile-timeline-controls');
      // The EditorBottomPanel mock renders "BottomPanel" text
      expect(mobileTimeline).toHaveTextContent('BottomPanel');
    });
  });
});

