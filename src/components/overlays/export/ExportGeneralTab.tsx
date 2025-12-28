import { useEffect, useState } from 'react'
import { useExportStore, VideoCodec, ExportResolution } from '@/stores/exportStore'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { NumberInput } from '@/components/ui/NumberInput'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { AnimatePresence, m } from 'motion/react'
import { useLayoutStore } from '@/stores/layoutStore'

export const ExportGeneralTab = () => {
    const { settings, updateSettings, setCropEditorOpen, setModalOpen } = useExportStore()
    const setCinematicMode = useLayoutStore(s => s.setCinematicMode)
    const [supportedCodecs, setSupportedCodecs] = useState<Record<VideoCodec, boolean>>({
        avc: true, hevc: false, vp9: true, av1: false
    })

    // Codec check (duplicated logic, should be moved to a hook or store eventually, but fine here)
    useEffect(() => {
        if (typeof VideoEncoder === 'undefined') return
        const check = async (codec: string) => {
            try {
                return (await VideoEncoder.isConfigSupported({
                    codec, width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30
                })).supported
            } catch { return false }
        }
        Promise.all([
            check('avc1.42001E'), check('hvc1.1.6.L120.B0'), check('vp09.00.10.08'), check('av01.0.05M.08')
        ]).then(([avc, hevc, vp9, av1]) => setSupportedCodecs({ avc: !!avc, hevc: !!hevc, vp9: !!vp9, av1: !!av1 }))
    }, [])

    const handleOpenCrop = () => {
        setModalOpen(false)
        setCropEditorOpen(true)
        setCinematicMode(true)
    }

    const clampDimension = (val: number) => {
        let clamped = Math.max(128, Math.min(7680, Math.round(val) || 1920))
        return Math.floor(clamped / 2) * 2
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Format & Resolution Group */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                        <Icon name="cog" className="w-4 h-4 text-accent" />
                        Output Format
                    </h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Container</label>
                        <ToggleGroup
                            options={[
                                { value: 'mp4', label: 'MP4' },
                                { value: 'webm', label: 'WebM', disabled: !supportedCodecs.vp9 }
                            ]}
                            value={settings.format}
                            onChange={(val) => {
                                const fmt = val as 'mp4' | 'webm'
                                updateSettings({ format: fmt, codec: fmt === 'mp4' ? 'avc' : 'vp9' })
                            }}
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Resolution</label>
                        <ToggleGroup
                            options={[
                                { value: '720p', label: '720P' },
                                { value: '1080p', label: '1080P' },
                                { value: '4k', label: '4K' },
                                { value: 'custom', label: 'Custom' }
                            ]}
                            value={settings.resolution}
                            onChange={(val) => updateSettings({ resolution: val as ExportResolution })}
                        />
                    </div>
                </div>

                <AnimatePresence>
                    {settings.resolution === 'custom' && (
                        <m.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex gap-4 pt-2 overflow-hidden"
                        >
                            <div className="space-y-1.5 flex-1">
                                <label className="text-[10px] text-text-tertiary uppercase tracking-wide">Width</label>
                                <NumberInput
                                    value={settings.customWidth}
                                    onChange={(val) => updateSettings({ customWidth: clampDimension(val) })}
                                    min={128} max={7680} step={2}
                                />
                            </div>
                            <div className="space-y-1.5 flex-1">
                                <label className="text-[10px] text-text-tertiary uppercase tracking-wide">Height</label>
                                <NumberInput
                                    value={settings.customHeight}
                                    onChange={(val) => updateSettings({ customHeight: clampDimension(val) })}
                                    min={128} max={7680} step={2}
                                />
                            </div>
                        </m.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="h-px bg-[var(--border-subtle)]" />

            {/* Timing & Quality */}
            <div className="space-y-4">
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
                    <Icon name="info" className="w-4 h-4 text-accent" />
                    Timing & Smoothness
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Framerate</label>
                        <ToggleGroup
                            options={[
                                { value: '24', label: '24 FPS' },
                                { value: '30', label: '30 FPS' },
                                { value: '60', label: '60 FPS' }
                            ]}
                            value={settings.fps.toString()}
                            onChange={(val) => updateSettings({ fps: Number(val) })}
                        />
                    </div>
                    
                    <div className="space-y-1">
                         <Slider
                            label="Duration"
                            value={settings.duration}
                            onChange={(val) => updateSettings({ duration: val })}
                            min={1} max={120} step={1}
                            unit="s"
                            minLabel="1s"
                            maxLabel="120s"
                        />
                    </div>
                </div>
            </div>

            <div className="h-px bg-[var(--border-subtle)]" />

            {/* Crop Control - Visual Card Style */}
            <div 
                className={`
                    flex items-center justify-between p-4 rounded-xl border transition-colors cursor-pointer
                    ${settings.crop.enabled ? 'bg-accent/5 border-accent/50' : 'glass-panel hover:bg-[var(--bg-hover)]'}
                `}
                onClick={() => updateSettings({ crop: { ...settings.crop, enabled: !settings.crop.enabled } })}
            >
                <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${settings.crop.enabled ? 'bg-accent text-black' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'}`}>
                        <Icon name="crop" className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="text-sm font-bold text-text-primary">Crop Frame</div>
                        <div className="text-[10px] text-text-secondary uppercase tracking-wider">
                            {settings.crop.enabled ? 'Custom area active' : 'Exporting full frame'}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div onClick={(e) => e.stopPropagation()}>
                        <Switch 
                            checked={settings.crop.enabled} 
                            onCheckedChange={(c) => updateSettings({ crop: { ...settings.crop, enabled: c } })}
                        />
                    </div>
                    <Button 
                        size="sm" 
                        variant="secondary" 
                        disabled={!settings.crop.enabled}
                        onClick={(e) => {
                            e.stopPropagation()
                            handleOpenCrop()
                        }}
                    >
                        Edit Area
                    </Button>
                </div>
            </div>
        </div>
    )
}
