import { useExportStore } from '@/stores/exportStore'
import { Switch } from '@/components/ui/Switch'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { ColorPicker } from '@/components/ui/ColorPicker'

export const ExportTextTab = () => {
    const { settings, updateSettings } = useExportStore()
    const { textOverlay } = settings

    const update = (partial: Partial<typeof textOverlay>) => 
        updateSettings({ textOverlay: { ...textOverlay, ...partial } })

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Enable Toggle Card */}
            <div className={`
                flex items-center justify-between p-4 rounded-xl border transition-colors
                ${textOverlay.enabled ? 'bg-accent/5 border-accent/50' : 'bg-[var(--bg-hover)] border-border-default'}
            `}>
                 <div className="flex flex-col">
                    <span className="font-bold text-sm text-text-primary">Enable Overlay</span>
                    <span className="text-[10px] text-text-tertiary uppercase tracking-wide">Add watermarks or titles</span>
                </div>
                <Switch checked={textOverlay.enabled} onCheckedChange={(c) => update({ enabled: c })} />
            </div>

            {textOverlay.enabled && (
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Text Content</label>
                        <Input 
                            value={textOverlay.text}
                            onChange={(e) => update({ text: e.target.value })}
                            placeholder="Enter text..."
                            className="text-lg font-bold"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Font Size</label>
                            <NumberInput
                                value={textOverlay.fontSize}
                                onChange={(val) => update({ fontSize: val })}
                                min={10} max={300}
                            />
                        </div>
                        <div className="space-y-2">
                             <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Weight</label>
                             <Select
                                value={textOverlay.fontWeight.toString()}
                                onChange={(val) => update({ fontWeight: parseInt(val) })}
                                options={[
                                    { value: '300', label: 'Light' },
                                    { value: '400', label: 'Regular' },
                                    { value: '600', label: 'Semi-Bold' },
                                    { value: '700', label: 'Bold' },
                                    { value: '900', label: 'Black' }
                                ]}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Alignment</label>
                            <ToggleGroup
                                options={[
                                    { value: 'left', label: 'Left' },
                                    { value: 'center', label: 'Center' },
                                    { value: 'right', label: 'Right' }
                                ]}
                                value={textOverlay.textAlign}
                                onChange={(val) => update({ textAlign: val as 'left' | 'center' | 'right' })}
                            />
                        </div>
                         <div className="space-y-2">
                             <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Opacity</label>
                             <Slider
                                label="Opacity"
                                value={textOverlay.opacity}
                                onChange={(val) => update({ opacity: val })}
                                min={0} max={1} step={0.1}
                             />
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-border-subtle">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Text Color</label>
                                <ColorPicker 
                                    value={textOverlay.color}
                                    onChange={(c) => update({ color: c })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Shadow Color</label>
                                <ColorPicker 
                                    value={textOverlay.shadowColor}
                                    onChange={(c) => update({ shadowColor: c })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6 pt-4 border-t border-border-subtle">
                        <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Position</label>
                        <Slider 
                            label="Horizontal (X)"
                            value={textOverlay.positionX}
                            onChange={(val) => update({ positionX: val })}
                            min={0} max={1} step={0.01}
                        />
                        <Slider 
                            label="Vertical (Y)"
                            value={textOverlay.positionY}
                            onChange={(val) => update({ positionY: val })}
                            min={0} max={1} step={0.01}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
