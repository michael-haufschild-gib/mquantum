import { Icon } from '@/components/ui/Icon'
import { useExportStore } from '@/stores/exportStore'
import { useLayoutEffect, useRef, useState } from 'react'

/** Get export width in pixels based on resolution setting */
const getExportWidth = (resolution: string, customWidth: number): number => {
    switch (resolution) {
        case '720p': return 1280
        case '1080p': return 1920
        case '4k': return 3840
        case 'custom': return customWidth
        default: return 1920
    }
}

export const ExportPreview = () => {
    const { settings, canvasAspectRatio, previewImage } = useExportStore()
    const { crop, textOverlay, resolution, customWidth } = settings

    const cropBoxRef = useRef<HTMLDivElement>(null)
    const [previewScale, setPreviewScale] = useState(1 / 3)

    // Calculate text scale based on crop box size vs export size
    useLayoutEffect(() => {
        const updateScale = () => {
            if (cropBoxRef.current) {
                const cropBoxWidth = cropBoxRef.current.offsetWidth
                const exportWidth = getExportWidth(resolution, customWidth)
                setPreviewScale(cropBoxWidth / exportWidth)
            }
        }
        updateScale()
        const observer = new ResizeObserver(updateScale)
        if (cropBoxRef.current) observer.observe(cropBoxRef.current)
        return () => observer.disconnect()
    }, [resolution, customWidth, crop.enabled, crop.width, crop.height])

    return (
        <div className="relative w-full h-full bg-[var(--bg-app)]/50 flex items-center justify-center p-4">

            {/* Aspect Ratio Container (Represents the Full Canvas) */}
            <div
                className="relative shadow-2xl overflow-hidden"
                style={{
                    aspectRatio: canvasAspectRatio,
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto'
                }}
            >
                {previewImage ? (
                    <>
                        {/* Background Image (The Full Scene) */}
                        <img
                            src={previewImage}
                            className="w-full h-full object-cover"
                            alt="Scene Preview"
                        />

                        {/* Crop Box / Output Frame */}
                        <div
                            ref={cropBoxRef}
                            className={`absolute border-2 transition-[left,top,width,height,border-color,box-shadow] duration-300 ${crop.enabled ? 'border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]' : 'border-transparent'}`}
                            style={{
                                left: crop.enabled ? `${crop.x * 100}%` : '0%',
                                top: crop.enabled ? `${crop.y * 100}%` : '0%',
                                width: crop.enabled ? `${crop.width * 100}%` : '100%',
                                height: crop.enabled ? `${crop.height * 100}%` : '100%',
                            }}
                        >
                            {/* Text Overlay - Positioned relative to crop box */}
                            {textOverlay.enabled && (() => {
                                const { verticalPlacement, horizontalPlacement, padding } = textOverlay
                                const scaledPadding = padding * previewScale
                                const scaledFontSize = textOverlay.fontSize * previewScale
                                const scaledLetterSpacing = textOverlay.letterSpacing * previewScale
                                const scaledShadowBlur = textOverlay.shadowBlur * previewScale

                                const left = horizontalPlacement === 'left' ? `${scaledPadding}px`
                                    : horizontalPlacement === 'right' ? `calc(100% - ${scaledPadding}px)`
                                    : '50%'
                                const translateX = horizontalPlacement === 'left' ? '0%'
                                    : horizontalPlacement === 'right' ? '-100%'
                                    : '-50%'
                                const top = verticalPlacement === 'top' ? `${scaledPadding}px`
                                    : verticalPlacement === 'bottom' ? `calc(100% - ${scaledPadding}px)`
                                    : '50%'
                                const translateY = verticalPlacement === 'top' ? '0%'
                                    : verticalPlacement === 'bottom' ? '-100%'
                                    : '-50%'

                                return (
                                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                        <div
                                            className="absolute"
                                            style={{
                                                left,
                                                top,
                                                transform: `translate(${translateX}, ${translateY})`,
                                                color: textOverlay.color,
                                                fontFamily: 'Inter, sans-serif',
                                                fontSize: `${scaledFontSize}px`,
                                                fontWeight: textOverlay.fontWeight,
                                                letterSpacing: `${scaledLetterSpacing}px`,
                                                opacity: textOverlay.opacity,
                                                textShadow: `0px 0px ${scaledShadowBlur}px ${textOverlay.shadowColor}`,
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {textOverlay.text}
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-hover)] text-[var(--text-tertiary)] flex-col gap-2">
                        <Icon name="image" className="w-8 h-8 opacity-20" />
                        <span className="text-xs uppercase tracking-widest">Preview Unavailable</span>
                    </div>
                )}
            </div>

            {/* Status Overlays */}
            <div className="absolute top-4 left-4 flex gap-2">
                <div className="px-2 py-1 glass-panel rounded text-[10px] font-mono text-[var(--text-secondary)]">
                    PREVIEW
                </div>
                {crop.enabled && (
                    <div className="px-2 py-1 bg-accent/20 border border-accent/30 rounded text-[10px] font-mono text-accent">
                        CROP ON
                    </div>
                )}
            </div>
        </div>
    )
}
