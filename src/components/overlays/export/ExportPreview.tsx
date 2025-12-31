import { useExportStore } from '@/stores/exportStore'
import { Icon } from '@/components/ui/Icon'
import { useRef, useState, useLayoutEffect } from 'react'

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

    const containerRef = useRef<HTMLDivElement>(null)
    const outputRef = useRef<HTMLDivElement>(null)
    const [previewScale, setPreviewScale] = useState(1 / 3)
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

    useLayoutEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                setContainerSize({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                })
            }
            if (outputRef.current) {
                const previewWidth = outputRef.current.offsetWidth
                const exportWidth = getExportWidth(resolution, customWidth)
                setPreviewScale(previewWidth / exportWidth)
            }
        }
        updateSize()
        const observer = new ResizeObserver(updateSize)
        if (containerRef.current) observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [resolution, customWidth, crop.enabled, crop.width, crop.height])

    // Calculate the OUTPUT aspect ratio (what will be exported)
    // When crop is enabled, this is the cropped area's aspect ratio
    const outputAspectRatio = crop.enabled
        ? canvasAspectRatio * (crop.width / crop.height)
        : canvasAspectRatio

    // Calculate dimensions to fill container while maintaining output aspect ratio
    const getOutputDimensions = () => {
        if (containerSize.width === 0 || containerSize.height === 0) {
            return { width: '100%', height: '100%' }
        }
        const containerRatio = containerSize.width / containerSize.height
        if (containerRatio > outputAspectRatio) {
            return { width: 'auto', height: '100%' }
        } else {
            return { width: '100%', height: 'auto' }
        }
    }

    const dimensions = getOutputDimensions()

    // When crop is enabled, we need to scale and position the image
    // so the crop area fills the container exactly
    const getImageTransform = () => {
        if (!crop.enabled) {
            return { scale: 1, translateX: 0, translateY: 0 }
        }
        // Scale: the image needs to be enlarged so crop area = 100%
        const scaleX = 1 / crop.width
        const scaleY = 1 / crop.height
        // Use the larger scale to ensure coverage (they should be equal for proper aspect ratio)
        const scale = Math.max(scaleX, scaleY)
        // Translate: offset so crop area is centered at origin
        // crop.x and crop.y are in 0-1 range relative to canvas
        const translateX = -crop.x * scale * 100
        const translateY = -crop.y * scale * 100
        return { scale, translateX, translateY }
    }

    const imageTransform = getImageTransform()

    return (
        <div ref={containerRef} className="relative w-full h-full bg-[var(--bg-app)]/50 flex items-center justify-center overflow-hidden">

             {/* Output Frame Container - uses OUTPUT aspect ratio */}
             <div
                ref={outputRef}
                className="relative shadow-2xl overflow-hidden"
                style={{
                    aspectRatio: outputAspectRatio,
                    width: dimensions.width,
                    height: dimensions.height,
                }}
             >
                {previewImage ? (
                    <>
                        {/* Background Image - scaled and positioned to show crop area */}
                        <img
                            src={previewImage}
                            className="absolute origin-top-left"
                            style={{
                                width: `${imageTransform.scale * 100}%`,
                                height: `${imageTransform.scale * 100}%`,
                                transform: `translate(${imageTransform.translateX}%, ${imageTransform.translateY}%)`,
                            }}
                            alt="Scene Preview"
                        />

                        {/* Text Overlay - Positioned relative to output frame */}
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
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-hover)] text-[var(--text-tertiary)] flex-col gap-2">
                         <Icon name="image" className="w-8 h-8 opacity-20" />
                        <span className="text-xs uppercase tracking-widest">Preview Unavailable</span>
                    </div>
                )}
             </div>

        </div>
    )
}
