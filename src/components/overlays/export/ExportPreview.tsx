import { useExportStore } from '@/stores/exportStore'
import { Icon } from '@/components/ui/Icon'

export const ExportPreview = () => {
    // Use previewImage captured BEFORE modal opened (in EditorTopBar)
    // This avoids timing issues with frameloop="never" and render graph state
    const { settings, canvasAspectRatio, previewImage } = useExportStore()

    const { crop, textOverlay } = settings

    // Logic to constrain preview to aspect ratio within the container
    // We rely on CSS `aspect-ratio` and `max-w/max-h` centering.

    return (
        <div className="relative w-full h-full bg-[var(--bg-app)]/50 flex items-center justify-center p-4">
            
             {/* Aspect Ratio Container (Represents the Full Canvas) */}
             <div 
                className="relative shadow-2xl overflow-hidden"
                style={{
                    aspectRatio: canvasAspectRatio,
                    maxWidth: '100%',
                    maxHeight: '100%',
                    // Fallback width if aspect-ratio fails or content is small
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
                            style={{
                                // Dim the background if cropping is active to highlight the crop
                                opacity: crop.enabled ? 0.3 : 1
                            }}
                            alt="Scene Preview" 
                        />

                        {/* Crop Box / Output Frame */}
                        {/* If crop is disabled, this fills the container (0,0,100%,100%) */}
                        <div 
                            className={`absolute border-2 transition-all duration-300 ${crop.enabled ? 'border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]' : 'border-transparent'}`}
                            style={{
                                left: crop.enabled ? `${crop.x * 100}%` : '0%',
                                top: crop.enabled ? `${crop.y * 100}%` : '0%',
                                width: crop.enabled ? `${crop.width * 100}%` : '100%',
                                height: crop.enabled ? `${crop.height * 100}%` : '100%',
                            }}
                        >
                            {/* Inner Image (Normal Brightness) - strictly inside the crop box */}
                            {/* We simulate "seeing through" the crop window by using the same image, 
                                inversely scaled and positioned? 
                                No, simpler: Just let the background be dim, and this box be "empty" but with a border.
                                BUT if we want the "Output" to look clean (filters applied, full opacity), 
                                we might want to render the image AGAIN inside here?
                                
                                Actually, "shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]" on the Crop Box 
                                effectively masks the outside! This is a clever CSS trick.
                                So the background image can be full opacity, and the shadow darkens the outside.
                            */}
                            
                            {/* Text Overlay - Positioned RELATIVE TO THIS BOX (The Output) */}
                            {textOverlay.enabled && (
                                <div 
                                    className="absolute pointer-events-none w-full h-full overflow-hidden"
                                >
                                    <div 
                                        className="absolute"
                                        style={{
                                            left: `${textOverlay.positionX * 100}%`,
                                            top: `${textOverlay.positionY * 100}%`,
                                            transform: `translate(${textOverlay.textAlign === 'center' ? '-50%' : textOverlay.textAlign === 'right' ? '-100%' : '0%'}, -50%)`,
                                            color: textOverlay.color,
                                            fontFamily: 'Inter, sans-serif', // Using system font for preview safe-guard
                                            fontSize: `${textOverlay.fontSize / (crop.enabled ? 3 * crop.width : 3)}px`, // Approx scale
                                            fontWeight: textOverlay.fontWeight,
                                            textAlign: textOverlay.textAlign,
                                            letterSpacing: `${textOverlay.letterSpacing}px`,
                                            opacity: textOverlay.opacity,
                                            textShadow: `0px 0px ${textOverlay.shadowBlur}px ${textOverlay.shadowColor}`,
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {textOverlay.text}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-hover)] text-[var(--text-tertiary)] flex-col gap-2">
                         <Icon name="image" className="w-8 h-8 opacity-20" />
                        <span className="text-xs uppercase tracking-widest">Preview Unavailable</span>
                    </div>
                )}
             </div>
            
            {/* Status Overlays (Outside the aspect container) */}
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
