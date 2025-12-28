/**
 * Cosine Gradient Editor Component
 *
 * Advanced editor for cosine palette coefficients (a, b, c, d).
 * Shows collapsible advanced mode with individual RGB sliders.
 */

import { Button } from '@/components/ui/Button';
import { DEFAULT_COSINE_COEFFICIENTS } from '@/rendering/shaders/palette';
import { useAppearanceStore, type AppearanceSlice } from '@/stores/appearanceStore';
import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

export interface CosineGradientEditorProps {
  className?: string;
}

const COEFFICIENT_LABELS: Record<'a' | 'b' | 'c' | 'd', string> = {
  a: 'Offset (a)',
  b: 'Amplitude (b)',
  c: 'Frequency (c)',
  d: 'Phase (d)',
};

const COEFFICIENT_TOOLTIPS: Record<'a' | 'b' | 'c' | 'd', string> = {
  a: 'Base offset - shifts the entire palette brightness',
  b: 'Amplitude - controls the intensity range of colors',
  c: 'Frequency - how many color cycles appear',
  d: 'Phase - shifts which colors appear where',
};

const CHANNEL_LABELS = ['R', 'G', 'B'] as const;

export const CosineGradientEditor: React.FC<CosineGradientEditorProps> = ({
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const appearanceSelector = useShallow((state: AppearanceSlice) => ({
    cosineCoefficients: state.cosineCoefficients,
    setCosineCoefficient: state.setCosineCoefficient,
    setCosineCoefficients: state.setCosineCoefficients,
  }));
  const { cosineCoefficients, setCosineCoefficient, setCosineCoefficients } =
    useAppearanceStore(appearanceSelector);

  const handleReset = () => {
    setCosineCoefficients(DEFAULT_COSINE_COEFFICIENTS);
  };

  return (
    <div className={className}>
      {/* Toggle Button */}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full"
      >
        <span>Advanced Editor</span>
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </Button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 space-y-6">
          {/* Reset Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
          >
            Reset to Default
          </Button>

          {/* Coefficient Groups */}
          {(['a', 'b', 'c', 'd'] as const).map((key) => (
            <div key={key} className="space-y-2">
              <div
                className="text-sm font-medium text-text-secondary"
                title={COEFFICIENT_TOOLTIPS[key]}
              >
                {COEFFICIENT_LABELS[key]}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {CHANNEL_LABELS.map((channel, index) => (
                  <div key={channel} className="space-y-1">
                    <label className="block text-xs text-text-muted text-center">
                      {channel}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.01}
                      value={cosineCoefficients[key][index]}
                      onChange={(e) =>
                        setCosineCoefficient(key, index, parseFloat(e.target.value))
                      }
                      className="w-full h-2 bg-panel-border rounded-lg appearance-none cursor-pointer accent-accent"
                    />
                    <div className="text-xs text-text-muted text-center">
                      {(cosineCoefficients[key][index] ?? 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
