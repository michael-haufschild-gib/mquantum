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

// SVGR icon imports
import CinematicIcon from '@/assets/icons/film.svg?react';
import EdgesIcon from '@/assets/icons/edges.svg?react';
import FacesIcon from '@/assets/icons/faces.svg?react';
import FullscreenIcon from '@/assets/icons/enlarge.svg?react';
import PerfIcon from '@/assets/icons/perf.svg?react';
import SoundOffIcon from '@/assets/icons/volume-mute2.svg?react';
import SoundOnIcon from '@/assets/icons/volume-high.svg?react';

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

  // Helper for Icon Buttons - styled consistently with ToggleButton
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
          : 'bg-[var(--bg-hover)] text-text-secondary border-border-default hover:text-text-primary hover:bg-[var(--bg-active)]'
        }
        ${className}
      `}
    >
      <IconComponent />
    </Button>
  );

  return (
    <div className={`flex items-center gap-1 ${compact ? '' : ''}`}>
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
                {compact ? <EdgesIcon className="w-4 h-4" /> : 'Edges'}
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
                {compact ? <FacesIcon className="w-4 h-4" /> : 'Faces'}
            </ToggleButton>
        </div>
      </div>

      {!compact && (
        <>
          <div className="w-px h-4 bg-[var(--border-subtle)] mx-1" />

          {/* App Controls */}
          <IconButton
            icon={isSoundEnabled ? SoundOnIcon : SoundOffIcon}
            active={isSoundEnabled}
            onClick={toggleSound}
            label={isSoundEnabled ? "Mute Sound" : "Enable Sound"}
          />
          <IconButton
            icon={PerfIcon}
            active={showPerfMonitor}
            onClick={() => { setShowPerfMonitor(!showPerfMonitor); soundManager.playClick(); }}
            label="Performance Monitor"
          />
          <IconButton
            icon={FullscreenIcon}
            active={isFullscreen}
            onClick={toggleFullscreen}
            label="Fullscreen"
          />
          <IconButton
            icon={CinematicIcon}
            active={isCinematicMode}
            onClick={toggleCinematic}
            label="Cinematic Mode"
          />
        </>
      )}
    </div>
  );
};
