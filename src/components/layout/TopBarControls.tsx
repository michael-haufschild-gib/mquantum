import { Button } from '@/components/ui/Button';
import { ToggleButton } from '@/components/ui/ToggleButton';
import { useToast } from '@/hooks/useToast';
import { soundManager } from '@/lib/audio/SoundManager';
import {
  canRenderEdges,
  canRenderFaces,
  isRaymarchingFractal as isRaymarchedFractal,
} from '@/lib/geometry/registry';
import { useAnimationStore } from '@/stores/animationStore';
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore';
import { useGeometryStore, type GeometryState } from '@/stores/geometryStore';
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore';
import { useUIStore, type UISlice } from '@/stores/uiStore';
import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

// Icons (internal to this component)
const Icons = {
  Perf: () => (
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 14h14v2h-16v-16h2zM4.5 13c-0.828 0-1.5-0.672-1.5-1.5s0.672-1.5 1.5-1.5c0.044 0 0.088 0.002 0.131 0.006l1.612-2.687c-0.154-0.235-0.243-0.517-0.243-0.819 0-0.828 0.672-1.5 1.5-1.5s1.5 0.672 1.5 1.5c0 0.302-0.090 0.583-0.243 0.819l1.612 2.687c0.043-0.004 0.087-0.006 0.131-0.006 0.033 0 0.066 0.001 0.099 0.004l2.662-4.658c-0.165-0.241-0.261-0.532-0.261-0.845 0-0.828 0.672-1.5 1.5-1.5s1.5 0.672 1.5 1.5c0 0.828-0.672 1.5-1.5 1.5-0.033 0-0.066-0.001-0.099-0.004l-2.662 4.658c0.165 0.241 0.261 0.532 0.261 0.845 0 0.828-0.672 1.5-1.5 1.5s-1.5-0.672-1.5-1.5c0-0.302 0.090-0.583 0.243-0.819l-1.612-2.687c-0.043 0.004-0.087 0.006-0.131 0.006s-0.088-0.002-0.131-0.006l-1.612 2.687c0.154 0.235 0.243 0.517 0.243 0.819 0 0.828-0.672 1.5-1.5 1.5z"></path>
    </svg>
  ),
  Fullscreen: () => (
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M16 0h-6.5l2.5 2.5-3 3 1.5 1.5 3-3 2.5 2.5z"></path>
      <path d="M16 16v-6.5l-2.5 2.5-3-3-1.5 1.5 3 3-2.5 2.5z"></path>
      <path d="M0 16h6.5l-2.5-2.5 3-3-1.5-1.5-3 3-2.5-2.5z"></path>
      <path d="M0 0v6.5l2.5-2.5 3 3 1.5-1.5-3-3 2.5-2.5z"></path>
    </svg>
  ),
  Cinematic: () => (
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M0 2v12h16v-12h-16zM3 13h-2v-2h2v2zM3 9h-2v-2h2v2zM3 5h-2v-2h2v2zM12 13h-8v-10h8v10zM15 13h-2v-2h2v2zM15 9h-2v-2h2v2zM15 5h-2v-2h2v2zM6 5v6l4-3z"></path>
    </svg>
  ),
  SoundOn: () => (
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9 13c0 1.105-0.895 2-2 2s-2-0.895-2-2 0.895-2 2-2 2 0.895 2 2zM7 1c-1.105 0-2 0.895-2 2s0.895 2 2 2 2-0.895 2-2-0.895-2-2-2zM12 4h-2c0 1.105-0.895 2-2 2v2c2.209 0 4-1.791 4-4zM12 4c0-2.209-1.791-4-4-4v2c1.105 0 2 0.895 2 2h2zM7 7c-1.105 0-2 0.895-2 2s0.895 2 2 2 2-0.895 2-2-0.895-2-2-2zM4 12c0-2.209-1.791-4-4-4v2c1.105 0 2 0.895 2 2h2zM4 12h-2c0 1.105-0.895 2-2 2v2c2.209 0 4-1.791 4-4z"></path>
      <path d="M12.5 8c0-2.485-2.015-4.5-4.5-4.5v9c2.485 0 4.5-2.015 4.5-4.5zM14.5 8c0 3.59-2.91 6.5-6.5 6.5v2c4.694 0 8.5-3.806 8.5-8.5s-3.806-8.5-8.5-8.5v2c3.59 0 6.5 2.91 6.5 6.5z"></path>
    </svg>
  ),
  SoundOff: () => (
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
       <path d="M10.812 9.406l4.594 4.594-1.406 1.406-4.594-4.594 1.406-1.406z"></path>
       <path d="M6 5v6l4-3z"></path>
       <path d="M1.406 2.812l1.406-1.406 11.188 11.188-1.406 1.406z"></path>
    </svg>
  ),
  Edges: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h18v18H3zM3 3l18 18M21 3L3 21" />
    </svg>
  ),
  Faces: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M3 3h18v18H3z" />
    </svg>
  )
};

interface TopBarControlsProps {
  compact?: boolean;
}

export const TopBarControls: React.FC<TopBarControlsProps> = ({ compact = false }) => {
  const { addToast } = useToast();

  // Visual Store
  const appearanceSelector = useShallow((state: AppearanceSlice) => ({
    edgesVisible: state.edgesVisible,
    facesVisible: state.facesVisible,
    setEdgesVisible: state.setEdgesVisible,
    setFacesVisible: state.setFacesVisible,
  }));
  const {
    edgesVisible,
    facesVisible,
    setEdgesVisible,
    setFacesVisible,
  } = useAppearanceStore(appearanceSelector);

  const uiSelector = useShallow((state: UISlice) => ({
    showPerfMonitor: state.showPerfMonitor,
    setShowPerfMonitor: state.setShowPerfMonitor
  }));
  const {
    showPerfMonitor,
    setShowPerfMonitor
  } = useUIStore(uiSelector);

  // Geometry Store
  const geometrySelector = useShallow((state: GeometryState) => ({
    objectType: state.objectType,
    dimension: state.dimension,
  }));
  const { objectType, dimension } = useGeometryStore(geometrySelector);

  // Logic for Cinematic Mode
  const layoutSelector = useShallow((state: LayoutStore) => ({
    isCinematicMode: state.isCinematicMode,
    toggleCinematicMode: state.toggleCinematicMode,
  }));
  const { isCinematicMode, toggleCinematicMode } = useLayoutStore(layoutSelector);

  // Local State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(soundManager.isEnabled);

  // Effects
  useEffect(() => {
      const handleFullscreenChange = () => {
          setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Sync sound state on mount/updates
  useEffect(() => {
     setIsSoundEnabled(soundManager.isEnabled);
  }, []);

  const toggleSound = () => {
      const newState = !isSoundEnabled;
      soundManager.toggle(newState);
      setIsSoundEnabled(newState);
      if (newState) {
          soundManager.playClick();
          addToast('Sound Enabled', 'info');
      } else {
          addToast('Sound Muted', 'info');
      }
  };

  // Logic for Render Modes (Edges/Faces)
  const previousFacesState = useRef(false);
  const previousEdgesState = useRef(false);

  const facesSupported = canRenderFaces(objectType);
  const edgesSupported = canRenderEdges(objectType);
  const isRaymarched = isRaymarchedFractal(objectType, dimension);

  const handleEdgeToggle = (visible: boolean) => {
    soundManager.playClick();
    if (visible && isRaymarched) {
      setEdgesVisible(true);
      setFacesVisible(true);
    } else {
      setEdgesVisible(visible);
    }
  };

  const handleFaceToggle = (visible: boolean) => {
    soundManager.playClick();
    if (!visible && isRaymarched && edgesVisible) {
      return;
    }
    setFacesVisible(visible);
  };

  // Consolidated visibility effect - handles all visibility rules in one place
  useEffect(() => {
    let nextFaces = facesVisible;
    let nextEdges = edgesVisible;

    // Rule 1: If faces not supported, disable (track for restore)
    if (!facesSupported && facesVisible) {
      previousFacesState.current = true;
      nextFaces = false;
    } else if (facesSupported && previousFacesState.current && !facesVisible) {
      nextFaces = true;
      previousFacesState.current = false;
    }

    // Rule 2: If edges not supported, disable (track for restore)
    if (!edgesSupported && edgesVisible) {
      previousEdgesState.current = true;
      nextEdges = false;
    } else if (edgesSupported && previousEdgesState.current && !edgesVisible) {
      nextEdges = true;
      previousEdgesState.current = false;
    }

    // Rule 3: Raymarched objects need faces when edges are on
    if (isRaymarched && nextEdges && !nextFaces) {
      nextFaces = true;
    }

    // Rule 4: At least one mode must be active
    if (!nextEdges && !nextFaces) {
      nextEdges = true;
    }

    // Apply changes only if needed (prevents unnecessary re-renders)
    if (nextFaces !== facesVisible) setFacesVisible(nextFaces);
    if (nextEdges !== edgesVisible) setEdgesVisible(nextEdges);
  }, [facesSupported, edgesSupported, isRaymarched, facesVisible, edgesVisible, setFacesVisible, setEdgesVisible]);

  const toggleCinematic = () => {
    soundManager.playClick();
    if (isCinematicMode) {
        toggleCinematicMode();
    } else {
        toggleCinematicMode();
        useAnimationStore.getState().play();
        addToast('Cinematic Mode Enabled', 'info');
    }
  };

  const toggleFullscreen = () => {
    soundManager.playClick();
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
  };

  // Helper for Icon Buttons
  const IconButton = ({
    icon: IconComponent,
    active,
    onClick,
    label,
    className = ""
  }: {
    icon: React.FC,
    active: boolean,
    onClick: () => void,
    label: string,
    className?: string
  }) => (
    <Button
      variant={active ? 'primary' : 'ghost'}
      size="icon"
      onClick={onClick}
      ariaLabel={label}
      data-testid={`control-${label.toLowerCase().replace(/\s+/g, '-')}`}
      className={`
        p-1.5 transition-all duration-300 border
        ${active
          ? 'bg-accent/20 text-accent border-accent/50 shadow-[0_0_10px_color-mix(in_oklch,var(--color-accent)_20%,transparent)]'
          : 'bg-transparent text-text-secondary border-transparent hover:text-text-primary hover:bg-white/5'
        }
        ${className}
      `}
    >
      <IconComponent />
    </Button>
  );

  return (
    <div className={`flex items-center gap-1 ${compact ? '' : 'bg-black/20 p-1 rounded-lg '}`}>
      {/* Render Mode Toggles */}
      <div className={`flex gap-1 ${compact ? '' : 'mr-2'}`}>
        <div title={!edgesSupported ? 'Edges not available' : undefined}>
            <ToggleButton
                pressed={edgesVisible}
                onToggle={handleEdgeToggle}
                ariaLabel="Toggle edges"
                disabled={!edgesSupported}
                className="!text-xs !py-1 !px-2 cursor-pointer"
            >
                {compact ? <Icons.Edges /> : 'Edges'}
            </ToggleButton>
        </div>
        <div title={!facesSupported ? 'Faces not available' : undefined}>
            <ToggleButton
                pressed={facesVisible}
                onToggle={handleFaceToggle}
                ariaLabel="Toggle faces"
                disabled={!facesSupported}
                className="!text-xs !py-1 !px-2 cursor-pointer"
            >
                {compact ? <Icons.Faces /> : 'Faces'}
            </ToggleButton>
        </div>
      </div>

      {!compact && (
        <>
          <div className="w-px h-4 bg-white/10 mx-1" />

          {/* App Controls */}
          <IconButton
            icon={isSoundEnabled ? Icons.SoundOn : Icons.SoundOff}
            active={isSoundEnabled}
            onClick={toggleSound}
            label={isSoundEnabled ? "Mute Sound" : "Enable Sound"}
          />
          <IconButton
            icon={Icons.Perf}
            active={showPerfMonitor}
            onClick={() => { setShowPerfMonitor(!showPerfMonitor); soundManager.playClick(); }}
            label="Performance Monitor"
          />
          <IconButton
            icon={Icons.Fullscreen}
            active={isFullscreen}
            onClick={toggleFullscreen}
            label="Fullscreen"
          />
          <IconButton
            icon={Icons.Cinematic}
            active={isCinematicMode}
            onClick={toggleCinematic}
            label="Cinematic Mode"
          />
        </>
      )}
    </div>
  );
};
