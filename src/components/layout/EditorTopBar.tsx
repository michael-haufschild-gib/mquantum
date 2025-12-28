import { TopBarControls } from '@/components/layout/TopBarControls';
import { SceneManager } from '@/components/presets/SceneManager';
import { StyleManager } from '@/components/presets/StyleManager';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { InputModal } from '@/components/ui/InputModal';
import { Modal } from '@/components/ui/Modal';
import { BREAKPOINTS, useMediaQuery } from '@/hooks/useMediaQuery';
import { useToast } from '@/hooks/useToast';
import { soundManager } from '@/lib/audio/SoundManager';
import { exportSceneToPNG, generateTimestampFilename } from '@/lib/export';
import { getModifierSymbols } from '@/lib/platform';
import { PRESETS } from '@/lib/presets';
import { generateShareUrl } from '@/lib/url';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useExportStore } from '@/stores/exportStore';
import { useGeometryStore } from '@/stores/geometryStore';
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore';
import { usePostProcessingStore } from '@/stores/postProcessingStore';
import { usePresetManagerStore, type PresetManagerState, type SavedScene, type SavedStyle } from '@/stores/presetManagerStore';
import { THEME_PRESETS, useThemeStore } from '@/stores/themeStore';
import { useTransformStore } from '@/stores/transformStore';
import { useUIStore } from '@/stores/uiStore';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

/** Props for EditorTopBar component */
interface EditorTopBarProps {
  /** Whether the right panel (Inspector) is visible */
  showRightPanel: boolean;
  /** Callback to toggle the right panel visibility */
  toggleRightPanel: () => void;
}

/**
 * Top bar component for the editor layout.
 * Provides main navigation menus (File, View, Scenes, Styles), global controls,
 * and panel toggle buttons. Responsive design with mobile-friendly unified menu.
 * @param root0 - Component props
 * @param root0.showRightPanel - Whether the right panel is visible
 * @param root0.toggleRightPanel - Callback to toggle right panel visibility
 * @returns The editor top bar component
 */
export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  showRightPanel,
  toggleRightPanel,
}) => {
  const { addToast } = useToast();

  const { toggleShortcuts, showLeftPanel, toggleLeftPanel, toggleCinematicMode } = useLayoutStore(
    useShallow((state: LayoutStore) => ({
      toggleShortcuts: state.toggleShortcuts,
      showLeftPanel: state.showLeftPanel,
      toggleLeftPanel: state.toggleLeftPanel,
      toggleCinematicMode: state.toggleCinematicMode,
    }))
  );

  // New Preset Manager Store
  const {
    savedStyles,
    saveStyle,
    loadStyle,
    savedScenes,
    saveScene,
    loadScene
  } = usePresetManagerStore(
    useShallow((state: PresetManagerState) => ({
      savedStyles: state.savedStyles,
      saveStyle: state.saveStyle,
      loadStyle: state.loadStyle,
      savedScenes: state.savedScenes,
      saveScene: state.saveScene,
      loadScene: state.loadScene,
    }))
  );

  // Theme store - consolidated subscription
  const { accent, setAccent, mode, setMode, setPreset } = useThemeStore(
    useShallow((state) => ({
      accent: state.accent,
      setAccent: state.setAccent,
      mode: state.mode,
      setMode: state.setMode,
      setPreset: state.setPreset,
    }))
  );

  const [isStyleManagerOpen, setIsStyleManagerOpen] = useState(false);
  const [isSceneManagerOpen, setIsSceneManagerOpen] = useState(false);

  // Modal states for inputs
  const [saveStyleOpen, setSaveStyleOpen] = useState(false);
  const [saveSceneOpen, setSaveSceneOpen] = useState(false);
  const [shareUrlOpen, setShareUrlOpen] = useState(false);
  const [currentShareUrl, setCurrentShareUrl] = useState('');

  // Store access for Share URL generation - consolidated subscriptions
  const { dimension, objectType } = useGeometryStore(
    useShallow((state) => ({
      dimension: state.dimension,
      objectType: state.objectType,
    }))
  );

  const uniformScale = useTransformStore((state) => state.uniformScale);

  const { shaderType, shaderSettings, edgeColor, backgroundColor } = useAppearanceStore(
    useShallow((state) => ({
      shaderType: state.shaderType,
      shaderSettings: state.shaderSettings,
      edgeColor: state.edgeColor,
      backgroundColor: state.backgroundColor,
    }))
  );

  const { bloomEnabled, bloomIntensity } = usePostProcessingStore(
    useShallow((state) => ({
      bloomEnabled: state.bloomEnabled,
      bloomIntensity: state.bloomIntensity,
    }))
  );

  const { showPerfMonitor, setShowPerfMonitor } = useUIStore(
    useShallow((state) => ({
      showPerfMonitor: state.showPerfMonitor,
      setShowPerfMonitor: state.setShowPerfMonitor,
    }))
  );

  const isDesktop = useMediaQuery(BREAKPOINTS.sm);

  // Refs for measuring sections to determine center positioning
  const topBarRef = useRef<HTMLDivElement>(null);
  const leftSectionRef = useRef<HTMLDivElement>(null);
  const centerSectionRef = useRef<HTMLDivElement>(null);

  // Update CSS variables for center positioning - CSS handles the max() calculation
  // This avoids React re-renders; only updates CSS custom properties
  useLayoutEffect(() => {
    const updateCSSVariables = () => {
      if (!topBarRef.current || !leftSectionRef.current || !centerSectionRef.current) return;

      const leftWidth = leftSectionRef.current.offsetWidth;
      const centerWidth = centerSectionRef.current.offsetWidth;
      const gap = 16;

      // Set CSS variables on the topbar element
      topBarRef.current.style.setProperty('--left-edge', `${leftWidth + gap}px`);
      topBarRef.current.style.setProperty('--center-half-width', `${centerWidth / 2}px`);
    };

    updateCSSVariables();

    // ResizeObserver is more efficient than resize event for element-level changes
    const resizeObserver = new ResizeObserver(updateCSSVariables);
    if (topBarRef.current) resizeObserver.observe(topBarRef.current);
    if (leftSectionRef.current) resizeObserver.observe(leftSectionRef.current);
    if (centerSectionRef.current) resizeObserver.observe(centerSectionRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Sync sound state for menu toggle
  const [isSoundEnabled, setIsSoundEnabled] = useState(soundManager.isEnabled);
  useEffect(() => {
     setIsSoundEnabled(soundManager.isEnabled);
  }, []);

  const handleExport = useCallback(async () => {
    soundManager.playSuccess();
    // Small delay to ensure UI updates if needed
    await new Promise((resolve) => setTimeout(resolve, 50));
    const filename = generateTimestampFilename('ndimensional');
    exportSceneToPNG({ filename });
  }, []);

  const handleShare = useCallback(async () => {
    const url = generateShareUrl({
      dimension,
      objectType,
      uniformScale,
      shaderType,
      shaderSettings,
      edgeColor,
      backgroundColor,
      bloomEnabled,
      bloomIntensity,
    });

    try {
      await navigator.clipboard.writeText(url);
      soundManager.playSuccess();
      addToast('Share URL copied to clipboard!', 'success');
    } catch (error) {
      console.warn('Clipboard API failed:', error);
      setCurrentShareUrl(url);
      setShareUrlOpen(true);
    }
  }, [dimension, objectType, uniformScale, shaderType, shaderSettings, edgeColor, backgroundColor, bloomEnabled, bloomIntensity, addToast]);

  const handleApplyPreset = useCallback((preset: typeof PRESETS[0]) => {
    preset.apply();
    soundManager.playClick();
    addToast(`Loaded example: ${preset.label}`, 'info');
  }, [addToast]);

  const setExportModalOpen = useExportStore((state) => state.setModalOpen);

  // --- Utility Actions for Mobile Menu ---
  const toggleSound = useCallback(() => {
    const newState = !isSoundEnabled;
    soundManager.toggle(newState);
    setIsSoundEnabled(newState);
    if (newState) {
        soundManager.playClick();
        addToast('Sound Enabled', 'info');
    } else {
        addToast('Sound Muted', 'info');
    }
  }, [isSoundEnabled, addToast]);

  const toggleFullscreen = useCallback(() => {
    soundManager.playClick();
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
  }, []);

  // --- Memoized Submenu Definitions ---

  const accentItems = useMemo(() => [
      { label: (accent === 'cyan' ? '✓ ' : '  ') + 'Cyan', onClick: () => setAccent('cyan') },
      { label: (accent === 'blue' ? '✓ ' : '  ') + 'Blue', onClick: () => setAccent('blue') },
      { label: (accent === 'green' ? '✓ ' : '  ') + 'Green', onClick: () => setAccent('green') },
      { label: (accent === 'magenta' ? '✓ ' : '  ') + 'Magenta', onClick: () => setAccent('magenta') },
      { label: (accent === 'orange' ? '✓ ' : '  ') + 'Orange', onClick: () => setAccent('orange') },
      { label: (accent === 'violet' ? '✓ ' : '  ') + 'Violet', onClick: () => setAccent('violet') },
      { label: (accent === 'red' ? '✓ ' : '  ') + 'Red', onClick: () => setAccent('red') },
  ], [accent, setAccent]);

  const modeItems = useMemo(() => [
      { label: (mode === 'light' ? '✓ ' : '  ') + 'Light', onClick: () => setMode('light') },
      { label: (mode === 'dark' ? '✓ ' : '  ') + 'Dark', onClick: () => setMode('dark') },
      { label: (mode === 'system' ? '✓ ' : '  ') + 'System', onClick: () => setMode('system') },
  ], [mode, setMode]);

  const presetItems = useMemo(() => [
    ...THEME_PRESETS.map(p => ({
      label: p.label,
      onClick: () => {
        setPreset(p.id);
        soundManager.playClick();
      }
    })),
    { label: '---' },
    { label: 'Advanced', items: [
      { label: 'Mode', items: modeItems },
      { label: 'Accent', items: accentItems },
    ]}
  ], [setPreset, modeItems, accentItems]);

  const savedSceneItems = useMemo(() => savedScenes.map((s: SavedScene) => ({
      label: s.name,
      onClick: () => {
          loadScene(s.id);
          soundManager.playClick();
          addToast(`Loaded scene: ${s.name}`, 'info');
      }
  })), [savedScenes, loadScene, addToast]);

  const exampleSceneItems = useMemo(() => PRESETS.map(p => ({
      label: p.label,
      onClick: () => handleApplyPreset(p)
  })), [handleApplyPreset]);

  const sceneSubmenuItems = useMemo(() => [
      { label: 'Actions' },
      { label: '+ Save Current Scene...', onClick: () => setSaveSceneOpen(true) },
      { label: 'Manage Scenes...', onClick: () => { setIsSceneManagerOpen(true); soundManager.playClick(); } },
      { label: '---' },
      { label: 'Saved Scenes' },
      ...(savedScenes.length === 0 ? [{ label: '(None)', disabled: true }] : savedSceneItems),
      { label: '---' },
      { label: 'Examples' },
      ...exampleSceneItems
  ], [savedScenes, savedSceneItems, exampleSceneItems]);

  const savedStyleItems = useMemo(() => savedStyles.map((s: SavedStyle) => ({
      label: s.name,
      onClick: () => {
          loadStyle(s.id);
          soundManager.playClick();
          addToast(`Applied style: ${s.name}`, 'info');
      }
  })), [savedStyles, loadStyle, addToast]);

  const styleSubmenuItems = useMemo(() => [
    { label: 'Actions' },
    { label: '+ Save Current Style...', onClick: () => setSaveStyleOpen(true) },
    { label: 'Manage Styles...', onClick: () => { setIsStyleManagerOpen(true); soundManager.playClick(); } },
    { label: '---' },
    { label: 'Saved Styles' },
    ...(savedStyles.length === 0 ? [{ label: '(None)', disabled: true }] : savedStyleItems)
  ], [savedStyles, savedStyleItems]);

  // --- Memoized Menu Handlers ---
  const handleExportVideo = useCallback(() => {
    setExportModalOpen(true);
    soundManager.playClick();
  }, [setExportModalOpen]);

  const handleToggleLeftPanel = useCallback(() => {
    toggleLeftPanel();
    soundManager.playClick();
  }, [toggleLeftPanel]);

  const handleToggleRightPanel = useCallback(() => {
    toggleRightPanel();
    soundManager.playClick();
  }, [toggleRightPanel]);

  const handleTogglePerfMonitor = useCallback(() => {
    setShowPerfMonitor(!showPerfMonitor);
  }, [setShowPerfMonitor, showPerfMonitor]);

  // --- Memoized Menu Definitions ---

  const fileItems = useMemo(() => {
    const m = getModifierSymbols();
    return [
      { label: 'Export Image (PNG)', onClick: handleExport, shortcut: `${m.ctrl}S`, 'data-testid': 'menu-export' },
      { label: 'Export Video (MP4)', onClick: handleExportVideo, shortcut: `${m.ctrl}${m.shift}E`, 'data-testid': 'menu-export-video' },
      { label: 'Copy Share Link', onClick: handleShare, 'data-testid': 'menu-share' },
    ];
  }, [handleExport, handleExportVideo, handleShare]);

  const viewItems = useMemo(() => [
    { label: showLeftPanel ? 'Hide Explorer' : 'Show Explorer', onClick: handleToggleLeftPanel },
    { label: showRightPanel ? 'Hide Inspector' : 'Show Inspector', onClick: handleToggleRightPanel },
    { label: 'Cinematic Mode', onClick: toggleCinematicMode, shortcut: 'C' },
    { label: 'Keyboard Shortcuts', onClick: toggleShortcuts, shortcut: '?' },
    { label: '---' },
    { label: 'Theme', items: presetItems },
  ], [showLeftPanel, showRightPanel, handleToggleLeftPanel, handleToggleRightPanel, toggleCinematicMode, toggleShortcuts, presetItems]);

  // --- Mobile Unified Menu ---
  const mobileMenuItems = useMemo(() => [
    { label: 'FILE', items: fileItems },
    { label: 'VIEW', items: viewItems },
    { label: 'SCENES', items: sceneSubmenuItems },
    { label: 'STYLES', items: styleSubmenuItems },
    { label: '---' },
    { label: 'TOOLS' },
    { label: isSoundEnabled ? 'Mute Sound' : 'Enable Sound', onClick: toggleSound },
    { label: showPerfMonitor ? 'Hide Performance' : 'Show Performance', onClick: handleTogglePerfMonitor },
    { label: 'Toggle Fullscreen', onClick: toggleFullscreen },
  ], [fileItems, viewItems, sceneSubmenuItems, styleSubmenuItems, isSoundEnabled, toggleSound, showPerfMonitor, handleTogglePerfMonitor, toggleFullscreen]);

  // --- Style Menu ---

  const onConfirmSaveStyle = (name: string) => {
    const trimmedName = name.trim();
    if (trimmedName) {
      saveStyle(trimmedName);
      addToast(`Style "${trimmedName}" saved!`, 'success');
      soundManager.playSuccess();
    }
  };

  // --- Scene Menu ---

  const onConfirmSaveScene = (name: string) => {
    const trimmedName = name.trim();
    if (trimmedName) {
      saveScene(trimmedName);
      addToast(`Scene "${trimmedName}" saved!`, 'success');
      soundManager.playSuccess();
    }
  };

  return (
    <>
      <div ref={topBarRef} className="glass-panel h-12 flex items-center px-4 z-40 shrink-0 select-none relative mb-2 rounded-xl mx-2 mt-2" data-testid="top-bar">
        {/* Left: Branding & Menu */}
        <div ref={leftSectionRef} className="flex items-center gap-4 shrink-0">
          {/* Left Panel Toggle */}
          <Button
              variant={showLeftPanel ? 'primary' : 'ghost'}
              size="icon"
              onClick={toggleLeftPanel}
              ariaLabel="Toggle Explorer"
              data-testid="toggle-left-panel"
              className={`p-1.5 ${
                showLeftPanel ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-[var(--bg-hover)]'
              }`}
          >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
          </Button>



          {/* Desktop Menus (Hidden on Mobile) */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-text-secondary">
            <DropdownMenu
              trigger={<Button variant="ghost" size="sm" data-testid="menu-file" className="px-2 py-1 font-medium tracking-wide">FILE</Button>}
              items={fileItems}
            />
            <DropdownMenu
              trigger={<Button variant="ghost" size="sm" data-testid="menu-view" className="px-2 py-1 font-medium tracking-wide">VIEW</Button>}
              items={viewItems}
            />
            <DropdownMenu
              trigger={<Button variant="ghost" size="sm" data-testid="menu-scenes" className="px-2 py-1 font-medium tracking-wide">SCENES</Button>}
              items={sceneSubmenuItems}
            />
            <DropdownMenu
              trigger={<Button variant="ghost" size="sm" data-testid="menu-styles" className="px-2 py-1 font-medium tracking-wide">STYLES</Button>}
              items={styleSubmenuItems}
            />
          </div>

          {/* Mobile Unified Menu (Visible only on Mobile) */}
          <div className="flex sm:hidden">
            <DropdownMenu
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  ariaLabel="Menu"
                  className="p-1.5"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                  </svg>
                </Button>
              }
              items={mobileMenuItems}
            />
          </div>
        </div>

        {/* Center: Global Controls - dynamically positioned via CSS max() */}
        {/* Viewport-centered when space allows, shifts right to avoid overlap when needed */}
        {/* CSS max() picks the larger of: left-edge (avoid overlap) or viewport-center */}
        <div
          ref={centerSectionRef}
          className="absolute flex items-center"
          style={{ left: 'max(var(--left-edge, 0px), calc(50% - var(--center-half-width, 0px)))' }}
        >
          <TopBarControls compact={!isDesktop} />
        </div>

        {/* Right: Panel Toggle - always at far right */}
        <div className="flex items-center shrink-0 ml-auto">
          <Button
              variant={showRightPanel ? 'primary' : 'ghost'}
              size="icon"
              onClick={toggleRightPanel}
              ariaLabel="Toggle Inspector"
              data-testid="toggle-right-panel"
              className={`p-1.5 ${
                showRightPanel ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text-primary hover:bg-[var(--bg-hover)]'
              }`}
          >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
          </Button>
        </div>
      </div>

      <Modal
        isOpen={isStyleManagerOpen}
        onClose={() => setIsStyleManagerOpen(false)}
        title="Manage Styles"
      >
        <StyleManager onClose={() => setIsStyleManagerOpen(false)} />
      </Modal>

      <Modal
        isOpen={isSceneManagerOpen}
        onClose={() => setIsSceneManagerOpen(false)}
        title="Manage Scenes"
      >
        <SceneManager onClose={() => setIsSceneManagerOpen(false)} />
      </Modal>

      <InputModal
        isOpen={saveStyleOpen}
        onClose={() => setSaveStyleOpen(false)}
        onConfirm={onConfirmSaveStyle}
        title="Save Style"
        placeholder="Enter style name..."
        confirmText="Save"
      />

      <InputModal
        isOpen={saveSceneOpen}
        onClose={() => setSaveSceneOpen(false)}
        onConfirm={onConfirmSaveScene}
        title="Save Scene"
        placeholder="Enter scene name..."
        confirmText="Save"
      />

      <InputModal
        isOpen={shareUrlOpen}
        onClose={() => setShareUrlOpen(false)}
        onConfirm={() => {}} // No-op, just copy
        title="Share Link"
        message="Copy this URL to share your scene:"
        initialValue={currentShareUrl}
        readOnly
        confirmText="Close"
        cancelText="Close"
      />
    </>
  );
};
