/**
 * Skybox Palette Editor Component
 *
 * Cosine gradient controls for procedural skybox colors (when sync is disabled).
 * Includes preview, preset selector, and advanced coefficient editor.
 * Always uses cosine algorithm - no algorithm selector exposed.
 */

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
  COSINE_PRESET_OPTIONS,
  DEFAULT_COSINE_COEFFICIENTS,
  getCosinePaletteColorTS,
} from '@/rendering/shaders/palette';
import type { CosineCoefficients } from '@/rendering/shaders/palette/types';
import { useEnvironmentStore, type EnvironmentStore } from '@/stores/environmentStore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

// ============================================================================
// Color Preview Canvas
// ============================================================================

interface SkyboxColorPreviewProps {
  coefficients: CosineCoefficients;
  width?: number;
  height?: number;
}

const SkyboxColorPreview: React.FC<SkyboxColorPreviewProps> = ({
  coefficients,
  width = 200,
  height = 24,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw gradient preview using cosine palette (no distribution applied)
    for (let x = 0; x < canvas.width; x++) {
      const t = x / canvas.width;
      const color = getCosinePaletteColorTS(
        t,
        coefficients.a,
        coefficients.b,
        coefficients.c,
        coefficients.d,
        1.0, // power
        1.0, // cycles
        0.0  // offset
      );

      const r8 = Math.round(Math.max(0, Math.min(1, color.r)) * 255);
      const g8 = Math.round(Math.max(0, Math.min(1, color.g)) * 255);
      const b8 = Math.round(Math.max(0, Math.min(1, color.b)) * 255);

      ctx.fillStyle = `rgb(${r8}, ${g8}, ${b8})`;
      ctx.fillRect(x, 0, 1, canvas.height);
    }
  }, [coefficients]);

  return (
    <div>
      <label className="block text-sm font-medium text-text-secondary mb-2">
        Preview
      </label>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full rounded border border-panel-border [image-rendering:pixelated]"
      />
    </div>
  );
};

// ============================================================================
// Preset Selector
// ============================================================================

interface SkyboxPresetSelectorProps {
  coefficients: CosineCoefficients;
  onSelect: (coefficients: CosineCoefficients) => void;
}

const SkyboxPresetSelector: React.FC<SkyboxPresetSelectorProps> = ({
  coefficients,
  onSelect,
}) => {
  // Find current preset by matching coefficients
  const currentPreset = useMemo(() => {
    for (const preset of COSINE_PRESET_OPTIONS) {
      const c = preset.coefficients;
      if (
        JSON.stringify(c.a) === JSON.stringify(coefficients.a) &&
        JSON.stringify(c.b) === JSON.stringify(coefficients.b) &&
        JSON.stringify(c.c) === JSON.stringify(coefficients.c) &&
        JSON.stringify(c.d) === JSON.stringify(coefficients.d)
      ) {
        return preset.value;
      }
    }
    return 'custom';
  }, [coefficients]);

  const options = [
    ...COSINE_PRESET_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
    })),
    { value: 'custom', label: 'Custom' },
  ];

  const handleChange = (value: string) => {
    if (value === 'custom') return;

    const preset = COSINE_PRESET_OPTIONS.find((p) => p.value === value);
    if (preset) {
      onSelect(preset.coefficients);
    }
  };

  return (
    <Select
      label="Palette Preset"
      options={options}
      value={currentPreset}
      onChange={handleChange}
    />
  );
};

// ============================================================================
// Advanced Coefficient Editor
// ============================================================================

interface SkyboxCoefficientEditorProps {
  coefficients: CosineCoefficients;
  onChange: (key: 'a' | 'b' | 'c' | 'd', index: number, value: number) => void;
  onReset: () => void;
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

const SkyboxCoefficientEditor: React.FC<SkyboxCoefficientEditorProps> = ({
  coefficients,
  onChange,
  onReset,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div>
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
            onClick={onReset}
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
                      value={coefficients[key][index]}
                      onChange={(e) =>
                        onChange(key, index, parseFloat(e.target.value))
                      }
                      title={`${COEFFICIENT_LABELS[key]} ${channel}`}
                      className="w-full h-2 bg-panel-border rounded-lg appearance-none cursor-pointer accent-accent"
                    />
                    <div className="text-xs text-text-muted text-center">
                      {(coefficients[key][index] ?? 0).toFixed(2)}
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

// ============================================================================
// Main Component
// ============================================================================

export const SkyboxPaletteEditor: React.FC = () => {
  const environmentSelector = useShallow((state: EnvironmentStore) => ({
    proceduralSettings: state.proceduralSettings,
    setProceduralSettings: state.setProceduralSettings,
  }));
  const { proceduralSettings, setProceduralSettings } = useEnvironmentStore(environmentSelector);

  const { cosineCoefficients } = proceduralSettings;

  // Update a single coefficient value
  const handleCoefficientChange = (
    key: 'a' | 'b' | 'c' | 'd',
    index: number,
    value: number
  ) => {
    const newCoefficients = { ...cosineCoefficients };
    const arr = [...newCoefficients[key]] as [number, number, number];
    arr[index] = Math.max(0, Math.min(2, value));
    newCoefficients[key] = arr;
    setProceduralSettings({ cosineCoefficients: newCoefficients });
  };

  // Select a preset
  const handlePresetSelect = (coefficients: CosineCoefficients) => {
    setProceduralSettings({ cosineCoefficients: coefficients });
  };

  // Reset coefficients to default
  const handleResetCoefficients = () => {
    setProceduralSettings({
      cosineCoefficients: { ...DEFAULT_COSINE_COEFFICIENTS },
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
      {/* Preview */}
      <SkyboxColorPreview coefficients={cosineCoefficients} />

      {/* Preset Selector */}
      <SkyboxPresetSelector
        coefficients={cosineCoefficients}
        onSelect={handlePresetSelect}
      />

      {/* Advanced Coefficient Editor */}
      <SkyboxCoefficientEditor
        coefficients={cosineCoefficients}
        onChange={handleCoefficientChange}
        onReset={handleResetCoefficients}
      />
    </div>
  );
};
