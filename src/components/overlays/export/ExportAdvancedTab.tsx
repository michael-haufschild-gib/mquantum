import { useEffect, useState } from 'react'
import { useExportStore, VideoCodec, ExportMode } from '@/stores/exportStore'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { Slider } from '@/components/ui/Slider'

export const ExportAdvancedTab = () => {
    const { settings, updateSettings, exportMode, exportModeOverride, setExportModeOverride } = useExportStore()
    const [supportedCodecs, setSupportedCodecs] = useState<Record<VideoCodec, boolean>>({
        avc: true, hevc: false, vp9: true, av1: false
    })

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

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            {/* Bitrate */}
            <div className="space-y-4">
                <Slider
                    label="TARGET BITRATE"
                    value={settings.bitrate}
                    onChange={(val) => updateSettings({ bitrate: val })}
                    min={2} max={100} step={1}
                    unit=" Mbps"
                    tooltip="Higher = Better Quality, Larger File"
                />
                 <div className="flex justify-end -mt-2">
                     <span className="text-[10px] text-text-tertiary">Higher = Better Quality, Larger File</span>
                </div>
            </div>

            <div className="h-px bg-[var(--bg-hover)]" />

            {/* Codec */}
            <div className="space-y-3">
                <label className="text-xs font-bold text-text-secondary uppercase tracking-widest pl-1">Video Codec</label>
                <ToggleGroup
                    options={[
                        { value: 'avc', label: 'H.264 (AVC)', disabled: settings.format !== 'mp4' },
                        { value: 'hevc', label: 'H.265 (HEVC)', disabled: settings.format !== 'mp4' || !supportedCodecs.hevc },
                        { value: 'vp9', label: 'VP9', disabled: settings.format !== 'webm' },
                        { value: 'av1', label: 'AV1', disabled: !supportedCodecs.av1 }
                    ].filter(opt => !opt.disabled || opt.value === settings.codec)} // Hide invalid options? Or just disable. Filtering invalid is cleaner for UI.
                    value={settings.codec}
                    onChange={(val) => updateSettings({ codec: val as VideoCodec })}
                />
            </div>

            {/* Hardware Accel */}
            <div className="space-y-3">
                <label className="text-xs font-bold text-text-secondary uppercase tracking-widest pl-1">Encoding Hardware</label>
                 <ToggleGroup
                    options={[
                        { value: 'prefer-software', label: 'Software (Quality)' },
                        { value: 'prefer-hardware', label: 'Hardware (Speed)' },
                    ]}
                    value={settings.hardwareAcceleration}
                    onChange={(val) => updateSettings({ hardwareAcceleration: val as 'prefer-hardware' | 'prefer-software' })}
                />
            </div>

             {/* Bitrate Mode */}
             <div className="space-y-3">
                <label className="text-xs font-bold text-text-secondary uppercase tracking-widest pl-1">Bitrate Mode</label>
                <ToggleGroup
                    options={[
                        { value: 'constant', label: 'Constant (CBR)' },
                        { value: 'variable', label: 'Variable (VBR)' },
                    ]}
                    value={settings.bitrateMode}
                    onChange={(val) => updateSettings({ bitrateMode: val as 'constant' | 'variable' })}
                />
            </div>

            <div className="h-px bg-[var(--bg-hover)]" />

            {/* Export Mode */}
            <div className="space-y-3">
                 <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-text-secondary uppercase tracking-widest pl-1">Processing Mode</label>
                    <span className={`text-[10px] px-2 py-0.5 rounded ${exportModeOverride ? 'bg-accent/20 text-accent border border-accent/30' : 'bg-[var(--bg-hover)] text-text-tertiary'}`}>
                        {exportModeOverride ? 'Manual Override' : 'Auto-Selected'}
                    </span>
                </div>
                <ToggleGroup
                    options={[
                        { value: 'in-memory', label: 'In-Memory' },
                        { value: 'stream', label: 'Stream to Disk' },
                        { value: 'segmented', label: 'Segmented' }
                    ]}
                    value={exportModeOverride || exportMode}
                    onChange={(val) => setExportModeOverride(val as ExportMode)}
                />
                <p className="text-[10px] text-text-tertiary p-2 bg-[var(--bg-hover)] rounded border border-border-subtle">
                    {exportMode === 'in-memory' && "Best for short clips. Keeps video in RAM before download."}
                    {exportMode === 'stream' && "Best for long recordings. Writes directly to disk (Chrome/Edge only)."}
                    {exportMode === 'segmented' && "Fallback for large files. Downloads multiple parts to join later."}
                </p>
            </div>
        </div>
    )
}
