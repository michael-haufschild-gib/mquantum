/**
 * ShaderCompilationOverlay - User feedback overlay during shader compilation.
 *
 * Displays a non-intrusive overlay when shaders are being compiled,
 * letting users know the app is working rather than frozen.
 *
 * Design:
 * - Semi-transparent backdrop with blur (doesn't fully block view)
 * - Glass-panel card with spinner and message
 * - Smooth entrance/exit animations
 * - Centered on screen for visibility
 * - Minimum display time to avoid jarring flashes
 *
 * @module components/overlays/ShaderCompilationOverlay
 */

import { Z_INDEX } from '@/constants/zIndex';
import { usePerformanceStore } from '@/stores/performanceStore';
import { AnimatePresence, m } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LoadingSpinner } from '../ui/LoadingSpinner';

/** Animation duration for overlay fade in (seconds) */
const OVERLAY_FADE_IN_DURATION = 0.15;

/** Animation duration for overlay fade out (seconds) - slower for smooth exit */
const OVERLAY_FADE_OUT_DURATION = 0.4;

/** Animation duration for card entrance (seconds) */
const CARD_ENTER_DURATION = 0.2;

/** Animation duration for card exit (seconds) - slower for smooth exit */
const CARD_EXIT_DURATION = 0.35;

/** Minimum time the overlay stays visible (ms) - prevents jarring flashes */
const MIN_DISPLAY_TIME_MS = 600;

/** Custom ease curve for snappy card entrance */
const CARD_ENTER_EASE = [0.16, 1, 0.3, 1] as const;

/** Custom ease curve for smooth card exit */
const CARD_EXIT_EASE = [0.4, 0, 0.2, 1] as const;

/**
 * Shader compilation overlay component.
 *
 * Automatically shows/hides based on performanceStore.isShaderCompiling state.
 * Enforces a minimum display time to prevent jarring flashes for fast compilations.
 * Should be mounted once at the app root level.
 * @returns The shader compilation overlay component
 */
export const ShaderCompilationOverlay: React.FC = () => {
  const { isCompiling, message } = usePerformanceStore(
    useShallow((s) => ({
      isCompiling: s.isShaderCompiling,
      message: s.shaderCompilationMessage,
    }))
  );

  // Track when overlay started showing for minimum display time
  const showStartTimeRef = useRef<number>(0);
  const [isVisible, setIsVisible] = useState(false);
  const [displayMessage, setDisplayMessage] = useState('');

  // Handle visibility with minimum display time
  useEffect(() => {
    if (isCompiling) {
      // Show immediately when compilation starts
      showStartTimeRef.current = Date.now();
      setIsVisible(true);
      setDisplayMessage(message);
      return;
    }

    if (isVisible) {
      // When compilation ends, ensure minimum display time
      const elapsed = Date.now() - showStartTimeRef.current;
      const remaining = Math.max(0, MIN_DISPLAY_TIME_MS - elapsed);

      const timer = setTimeout(() => {
        setIsVisible(false);
      }, remaining);

      return () => clearTimeout(timer);
    }

    return;
  }, [isCompiling, isVisible, message]);

  // Update message while visible (in case shader name changes)
  useEffect(() => {
    if (isCompiling && message) {
      setDisplayMessage(message);
    }
  }, [isCompiling, message]);

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          key="shader-compilation-overlay"
          className="fixed inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: Z_INDEX.SHADER_COMPILATION_OVERLAY }}
          role="status"
          aria-live="polite"
          aria-label="Shader compilation in progress"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: isCompiling ? OVERLAY_FADE_IN_DURATION : OVERLAY_FADE_OUT_DURATION,
          }}
        >
          {/* Subtle backdrop - doesn't fully block the view */}
          <m.div
            className="absolute inset-0 bg-[var(--bg-active)] backdrop-blur-[2px]"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: isCompiling ? OVERLAY_FADE_IN_DURATION : OVERLAY_FADE_OUT_DURATION,
            }}
          />

          {/* Content card - centered */}
          <m.div
            className="relative z-10 px-6 py-4 rounded-xl glass-panel flex items-center gap-4 shadow-lg"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{
              duration: isCompiling ? CARD_ENTER_DURATION : CARD_EXIT_DURATION,
              ease: isCompiling ? CARD_ENTER_EASE : CARD_EXIT_EASE,
            }}
          >
            {/* GPU/Shader icon (decorative) */}
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <svg
                className="w-5 h-5 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                {/* GPU/chip icon */}
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"
                />
              </svg>
            </div>

            {/* Message and spinner */}
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text-primary">
                {displayMessage || 'Compiling shader...'}
              </span>
              <span className="text-xs text-text-secondary">
                This may take a moment
              </span>
            </div>

            {/* Spinner */}
            <LoadingSpinner size={20} color="var(--color-accent)" />
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  );
};
