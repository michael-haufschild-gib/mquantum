import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { buildSceneStamp } from '@/lib/export/sceneStamp'
import {
  getQuantumTypeName,
  getQuantumTypeValidation,
  resolveQuantumTypeKey,
} from '@/lib/geometry/registry'
import { useExportStore } from '@/stores/runtime/exportStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

export const ExportTextTab = () => {
  const { settings, updateSettings } = useExportStore(
    useShallow((s) => ({ settings: s.settings, updateSettings: s.updateSettings }))
  )
  const { objectType, dimension } = useGeometryStore(
    useShallow((s) => ({ objectType: s.objectType, dimension: s.dimension }))
  )
  const { quantumMode, representation } = useExtendedObjectStore(
    useShallow((s) => ({
      quantumMode: s.schroedinger.quantumMode,
      representation: s.schroedinger.representation,
    }))
  )
  const { textOverlay } = settings

  const update = (partial: Partial<typeof textOverlay>) =>
    updateSettings({ textOverlay: { ...textOverlay, ...partial } })

  const sceneStamp = useMemo(() => {
    const key = resolveQuantumTypeKey(objectType, quantumMode)
    return buildSceneStamp({
      modeName: key ? getQuantumTypeName(key) : objectType,
      dimension,
      representation: objectType === 'schroedinger' ? representation : undefined,
      validation: key ? getQuantumTypeValidation(key) : undefined,
    })
  }, [dimension, objectType, quantumMode, representation])

  const insertSceneStamp = () =>
    update({
      enabled: true,
      text: sceneStamp,
      fontSize: 18,
      fontWeight: 600,
      opacity: 0.9,
      verticalPlacement: 'bottom',
      horizontalPlacement: 'left',
      padding: 24,
    })

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* Enable Toggle Card */}
      <div
        className={`
                flex items-center justify-between p-4 rounded-xl border transition-colors
                ${textOverlay.enabled ? 'bg-accent/5 border-accent/50' : 'bg-[var(--bg-hover)] border-border-default'}
            `}
      >
        <div className="flex flex-col">
          <span className="font-bold text-sm text-text-primary">Enable Overlay</span>
          <span className="text-2xs text-text-tertiary uppercase tracking-wider">
            Add watermarks or titles
          </span>
        </div>
        <Switch
          checked={textOverlay.enabled}
          onCheckedChange={(c) => update({ enabled: c })}
          ariaLabel="Enable text overlay"
          tooltip="Burn a text watermark or title into the exported video frames."
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-[var(--bg-hover)]/50 p-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Scene Stamp
          </div>
          <div className="mt-1 truncate font-mono text-2xs text-text-tertiary">{sceneStamp}</div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={insertSceneStamp}
          tooltip="Use current mode, dimension, representation, and validation evidence as overlay text."
          data-testid="insert-scene-stamp"
          className="shrink-0"
        >
          <Icon name="copy" className="h-3.5 w-3.5" />
          Insert
        </Button>
      </div>

      {textOverlay.enabled && (
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-2xs text-text-tertiary uppercase font-medium tracking-wider">
              Text Content
            </label>
            <Input
              value={textOverlay.text}
              onChange={(e) => update({ text: e.target.value })}
              placeholder="Enter text..."
              tooltip="Text burned into each exported frame"
              className="text-lg font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-2xs text-text-tertiary uppercase font-medium tracking-wider">
                Font Size
              </label>
              <NumberInput
                value={textOverlay.fontSize}
                onChange={(val) => update({ fontSize: val })}
                min={10}
                max={300}
                tooltip="Font size of the overlay text in pixels."
              />
            </div>
            <div className="space-y-2">
              <label className="text-2xs text-text-tertiary uppercase font-medium tracking-wider">
                Weight
              </label>
              <Select
                value={textOverlay.fontWeight.toString()}
                onChange={(val) => update({ fontWeight: parseInt(val) })}
                options={[
                  { value: '300', label: 'Light' },
                  { value: '400', label: 'Regular' },
                  { value: '600', label: 'Semi-Bold' },
                  { value: '700', label: 'Bold' },
                  { value: '900', label: 'Black' },
                ]}
                tooltip="Font weight of the overlay text."
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-2xs text-text-tertiary uppercase font-medium tracking-wider">
              Opacity
            </label>
            <Slider
              label="Opacity"
              tooltip="Transparency of the text overlay. 0 = invisible, 1 = fully opaque."
              value={textOverlay.opacity}
              onChange={(val) => update({ opacity: val })}
              min={0}
              max={1}
              step={0.1}
            />
          </div>

          <div className="space-y-4 pt-4 border-t border-border-subtle">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-2xs text-text-tertiary uppercase font-medium tracking-wider">
                  Text Color
                </label>
                <ColorPicker
                  value={textOverlay.color}
                  onChange={(c) => update({ color: c })}
                  tooltip="Fill color of the overlay text."
                />
              </div>
              <div className="space-y-2">
                <label className="text-2xs text-text-tertiary uppercase font-medium tracking-wider">
                  Shadow Color
                </label>
                <ColorPicker
                  value={textOverlay.shadowColor}
                  onChange={(c) => update({ shadowColor: c })}
                  tooltip="Color of the drop shadow behind the overlay text."
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border-subtle">
            <label className="text-2xs text-text-tertiary uppercase font-medium tracking-wider">
              Placement
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-2xs text-text-tertiary uppercase tracking-wider">
                  Vertical
                </label>
                <ToggleGroup
                  options={[
                    { value: 'top', label: 'Top' },
                    { value: 'center', label: 'Center' },
                    { value: 'bottom', label: 'Bottom' },
                  ]}
                  value={textOverlay.verticalPlacement}
                  onChange={(val) =>
                    update({ verticalPlacement: val as 'top' | 'center' | 'bottom' })
                  }
                  tooltip="Vertical anchor position of the text overlay on the frame."
                />
              </div>
              <div className="space-y-2">
                <label className="text-2xs text-text-tertiary uppercase tracking-wider">
                  Horizontal
                </label>
                <ToggleGroup
                  options={[
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                  ]}
                  value={textOverlay.horizontalPlacement}
                  onChange={(val) =>
                    update({ horizontalPlacement: val as 'left' | 'center' | 'right' })
                  }
                  tooltip="Horizontal anchor position of the text overlay on the frame."
                />
              </div>
            </div>
            <Slider
              label="Padding"
              tooltip="Distance in pixels between the text and the frame edge."
              value={textOverlay.padding}
              onChange={(val) => update({ padding: val })}
              min={0}
              max={100}
              step={1}
            />
          </div>
        </div>
      )}
    </div>
  )
}
