import React from 'react'

import { Tooltip } from '@/components/ui/Tooltip'
import { hsvToHex, isValidHex, parseColorToHsv, rgbToHsv } from '@/lib/colors/colorUtils'

import { CopyIcon, EyeDropperIcon } from './colorPickerIcons'
import { CHECKERBOARD_BG, HUE_GRADIENT, NOISE_BG } from './colorPickerUtils'
import { Popover } from './Popover'
import { useColorPickerState } from './useColorPickerState'

interface ColorPickerProps {
  value: string // Hex, Hex8, or RGB string
  onChange: (value: string) => void
  label?: string
  className?: string
  disabled?: boolean
  alpha?: number // External alpha control
  onChangeAlpha?: (alpha: number) => void // Handler for alpha changes
  disableAlpha?: boolean // If true, hide alpha controls and force alpha=1
  /** Tooltip text shown on hover over the label. */
  tooltip?: string
}

export const ColorPicker: React.FC<ColorPickerProps> = React.memo(
  ({
    value,
    onChange,
    label,
    className = '',
    disabled = false,
    alpha,
    onChangeAlpha,
    disableAlpha = false,
    tooltip,
  }) => {
    const {
      hsv,
      mode,
      setMode,
      history,
      isOpen,
      initialColor,
      hexInput,
      setHexInput,
      rgbInput,
      setRgbInput,
      svRef,
      setIsDraggingSV,
      palette,
      saturationBrightnessBackground,
      handleOpenChange,
      handleHsvChange,
      handleSvKeyDown,
      updateSV,
      handleEyedropper,
      handleCopy,
    } = useColorPickerState({ value, onChange, alpha, onChangeAlpha, disableAlpha })

    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {label && (
          <span className="text-xs font-medium text-text-secondary select-none">
            {tooltip ? (
              <Tooltip content={tooltip} position="top">
                <span>{label}</span>
              </Tooltip>
            ) : (
              label
            )}
          </span>
        )}

        <Popover
          open={isOpen}
          onOpenChange={handleOpenChange}
          offset={8}
          trigger={
            <button
              type="button"
              disabled={disabled}
              aria-label={label ? `${label} color picker` : 'Color picker'}
              className="flex items-center gap-2 group p-1 rounded-md appearance-none border-0 bg-transparent cursor-pointer hover:bg-[var(--bg-hover)] transition-colors focus:outline-none focus:ring-1 focus:ring-accent/60 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {/* Trigger Swatch */}
              <div className="relative w-8 h-5 rounded overflow-hidden shadow-sm ring-1 ring-border-default group-hover:ring-border-strong transition-[box-shadow]">
                <div
                  className="absolute inset-0 z-0"
                  style={{ backgroundImage: CHECKERBOARD_BG, opacity: 0.4 }}
                />
                <div className="absolute inset-0 z-10" style={{ backgroundColor: value }} />
              </div>
            </button>
          }
          content={
            <div className="w-[260px] p-3 flex flex-col gap-3 select-none text-text-primary">
              {/* 1. Header: Compare + Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-[var(--bg-hover)] rounded-full p-0.5 border border-border-subtle">
                  {/* Compare Swatch */}
                  <div
                    className="relative w-12 h-6 rounded-full overflow-hidden flex cursor-help"
                    title="Original vs New"
                  >
                    <div
                      className="absolute inset-0 -z-10"
                      style={{ backgroundImage: CHECKERBOARD_BG, opacity: 0.4 }}
                    />
                    <div className="w-1/2 h-full" style={{ backgroundColor: initialColor }} />
                    <div className="w-1/2 h-full" style={{ backgroundColor: value }} />
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* EyeDropper */}
                  {typeof window !== 'undefined' && 'EyeDropper' in window && (
                    <button
                      type="button"
                      onClick={handleEyedropper}
                      className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-text-tertiary hover:text-text-primary transition-colors"
                      aria-label="Pick color"
                      title="Pick color"
                    >
                      <EyeDropperIcon />
                    </button>
                  )}
                  {/* Copy */}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-text-tertiary hover:text-text-primary transition-colors"
                    aria-label="Copy to clipboard"
                    title="Copy to clipboard"
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>

              {/* 2. Main Saturation/Value Area */}
              <div
                ref={svRef}
                className="w-full h-[160px] rounded-lg relative cursor-crosshair overflow-hidden shadow-lg ring-1 ring-border-default group"
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  setIsDraggingSV(true)
                  updateSV(e.clientX, e.clientY)
                }}
                style={{ backgroundColor: saturationBrightnessBackground, touchAction: 'none' }}
                role="application"
                aria-label="Saturation and brightness"
                aria-roledescription="2D color area"
                aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, Brightness ${Math.round(hsv.v * 100)}%`}
                tabIndex={0}
                onKeyDown={handleSvKeyDown}
              >
                {/* Layers */}
                <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                <div
                  className="absolute inset-0 mix-blend-overlay opacity-30 pointer-events-none"
                  style={{ backgroundImage: NOISE_BG }}
                />

                {/* Cursor */}
                <div
                  className="absolute w-4 h-4 rounded-full shadow-lg border-2 border-text-primary pointer-events-none -translate-x-1/2 -translate-y-1/2 transform transition-transform duration-75 ease-out group-active:scale-75"
                  style={{
                    left: `${hsv.s * 100}%`,
                    top: `${(1 - hsv.v) * 100}%`,
                  }}
                />
              </div>

              {/* 3. Sliders (Hue + Alpha) */}
              <div className="space-y-3">
                {/* Hue */}
                <div className="h-3 rounded-full relative overflow-hidden ring-1 ring-border-default cursor-pointer group">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: HUE_GRADIENT,
                    }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={hsv.h}
                    onChange={(e) => handleHsvChange({ ...hsv, h: parseFloat(e.target.value) })}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                    aria-label="Hue"
                  />
                  <div
                    className="absolute top-0 bottom-0 w-2 h-full bg-white shadow-md rounded-full pointer-events-none -translate-x-1/2 transition-transform group-active:scale-110"
                    style={{ left: `${hsv.h * 100}%` }}
                  />
                </div>

                {/* Alpha (Hidden if disabled) */}
                {!disableAlpha && (
                  <div className="h-3 rounded-full relative overflow-hidden ring-1 ring-border-default cursor-pointer group">
                    <div
                      className="absolute inset-0 z-0"
                      style={{ backgroundImage: CHECKERBOARD_BG, opacity: 0.4 }}
                    />
                    <div
                      className="absolute inset-0 z-1"
                      style={{
                        background: `linear-gradient(to right, transparent, ${hsvToHex(hsv.h, hsv.s, hsv.v)})`,
                      }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={hsv.a}
                      onChange={(e) => handleHsvChange({ ...hsv, a: parseFloat(e.target.value) })}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
                      aria-label="Opacity"
                    />
                    <div
                      className="absolute top-0 bottom-0 w-2 h-full bg-white shadow-md rounded-full pointer-events-none -translate-x-1/2 z-30 transition-transform group-active:scale-110"
                      style={{ left: `${hsv.a * 100}%` }}
                    />
                  </div>
                )}
              </div>

              {/* 4. Inputs */}
              <div className="flex flex-col gap-2 bg-[var(--bg-hover)] p-2 rounded-lg border border-border-subtle">
                <div className="flex items-center gap-2 mb-1">
                  {/* Mode Tabs */}
                  <div className="flex bg-[var(--bg-active)] rounded p-0.5">
                    {(['HEX', 'RGB'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`px-2 py-0.5 text-xs font-bold rounded-sm transition-colors ${mode === m ? 'bg-[var(--bg-active)] text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === 'HEX' && (
                  <div className="flex gap-2">
                    <div className="flex-1 bg-[var(--bg-hover)] border border-border-default rounded px-2 py-1 flex items-center gap-2 group-focus-within:border-accent/50 transition-colors">
                      <span className="text-xs text-text-tertiary font-mono select-none">#</span>
                      <input
                        type="text"
                        value={hexInput.replace('#', '')}
                        onChange={(e) => {
                          const val = '#' + e.target.value
                          setHexInput(val)
                          if (isValidHex(val)) {
                            const parsed = parseColorToHsv(val)
                            const hexLength = val.trim().replace('#', '').length
                            const nextHsv =
                              hexLength === 3 || hexLength === 6 ? { ...parsed, a: hsv.a } : parsed
                            handleHsvChange(nextHsv)
                          }
                        }}
                        onBlur={() => !isValidHex(hexInput) && setHexInput(value)}
                        onFocus={(e) => e.target.select()}
                        className="w-full bg-transparent text-xs font-mono text-text-primary outline-none uppercase"
                        spellCheck={false}
                        aria-label="Hex color value"
                      />
                    </div>
                    {!disableAlpha && (
                      <div className="w-14 bg-[var(--bg-hover)] border border-border-default rounded px-1 py-1 flex items-center gap-1 group-focus-within:border-accent/50 transition-colors">
                        <span className="text-xs text-text-tertiary font-bold">%</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(hsv.a * 100)}
                          onChange={(e) =>
                            handleHsvChange({
                              ...hsv,
                              a: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) / 100,
                            })
                          }
                          className="w-full bg-transparent text-xs font-mono text-text-primary outline-none text-right [&::-webkit-inner-spin-button]:appearance-none"
                          aria-label="Opacity percentage"
                        />
                      </div>
                    )}
                  </div>
                )}

                {mode === 'RGB' && (
                  <div className="flex gap-1.5">
                    {(['r', 'g', 'b'] as const).map((c) => (
                      <div
                        key={c}
                        className="flex-1 bg-[var(--bg-hover)] border border-border-default rounded px-1 py-1 flex items-center gap-1"
                      >
                        <span className="text-xs text-text-tertiary uppercase font-bold">{c}</span>
                        <input
                          type="number"
                          min={0}
                          max={255}
                          value={rgbInput[c]}
                          aria-label={`${c === 'r' ? 'Red' : c === 'g' ? 'Green' : 'Blue'} channel`}
                          onChange={(e) => {
                            const val = Math.min(255, Math.max(0, parseInt(e.target.value) || 0))
                            const newRgb = { ...rgbInput, [c]: val }
                            setRgbInput(newRgb)
                            handleHsvChange(rgbToHsv(newRgb.r, newRgb.g, newRgb.b, hsv.a))
                          }}
                          className="w-full bg-transparent text-xs font-mono text-text-primary outline-none text-right [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 5. Palette & History */}
              <div className="space-y-2 pt-1">
                {/* Palette */}
                <div className="flex gap-1 justify-between">
                  {palette.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleHsvChange(parseColorToHsv(c))}
                      className="w-6 h-6 rounded-md border border-border-subtle hover:scale-110 hover:border-border-strong transition-transform shadow-sm"
                      style={{ backgroundColor: c }}
                      aria-label={`Use palette color ${c}`}
                      title={c}
                    />
                  ))}
                </div>

                {/* History */}
                {history.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap pt-2 border-t border-border-subtle">
                    {history.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleHsvChange(parseColorToHsv(c))}
                        className="w-5 h-5 rounded-full border border-border-default hover:scale-110 hover:border-border-strong transition-transform shadow-sm relative overflow-hidden"
                        aria-label={`Use recent color ${c}`}
                        title="History"
                      >
                        <div
                          className="absolute inset-0 -z-10"
                          style={{ backgroundImage: CHECKERBOARD_BG, opacity: 0.4 }}
                        />
                        <div className="absolute inset-0" style={{ backgroundColor: c }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          }
        />
      </div>
    )
  }
)

ColorPicker.displayName = 'ColorPicker'
