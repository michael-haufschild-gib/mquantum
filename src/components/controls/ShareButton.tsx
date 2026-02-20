/**
 * Share Button Component
 * Button for generating and copying a shareable URL
 */

import React, { useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/Button'
import { generateShareUrl } from '@/lib/url'
import { useGeometryStore } from '@/stores/geometryStore'
import { useTransformStore } from '@/stores/transformStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePBRStore } from '@/stores/pbrStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { InputModal } from '@/components/ui/InputModal'

/**
 * Props for {@link ShareButton}.
 */
export interface ShareButtonProps {
  /** Optional utility classes applied to the outer wrapper. */
  className?: string
}

/**
 * Renders the share action for copying a URL that captures scene-visible state.
 *
 * @param props - Component props
 * @param props.className - Optional utility classes for the wrapper
 * @returns Share button with clipboard fallback modal
 */
export const ShareButton: React.FC<ShareButtonProps> = ({ className = '' }) => {
  const [copied, setCopied] = useState(false)
  const [fallbackOpen, setFallbackOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Geometry store values
  const { dimension, objectType } = useGeometryStore(
    useShallow((s) => ({ dimension: s.dimension, objectType: s.objectType }))
  )
  const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)
  const uniformScale = useTransformStore((s) => s.uniformScale)

  // Visual settings (PRD Story 1 AC6, Story 7 AC7)
  const { shaderType, shaderSettings, edgeColor } = useAppearanceStore(
    useShallow((s) => ({
      shaderType: s.shaderType,
      shaderSettings: s.shaderSettings,
      edgeColor: s.edgeColor,
    }))
  )
  const {
    backgroundColor,
    skyboxSelection,
    skyboxIntensity,
    skyboxRotation,
    skyboxAnimationMode,
    skyboxAnimationSpeed,
    skyboxHighQuality,
  } = useEnvironmentStore(
    useShallow((s) => ({
      backgroundColor: s.backgroundColor,
      skyboxSelection: s.skyboxSelection,
      skyboxIntensity: s.skyboxIntensity,
      skyboxRotation: s.skyboxRotation,
      skyboxAnimationMode: s.skyboxAnimationMode,
      skyboxAnimationSpeed: s.skyboxAnimationSpeed,
      skyboxHighQuality: s.skyboxHighQuality,
    }))
  )
  const { toneMappingEnabled, toneMappingAlgorithm, exposure } = useLightingStore(
    useShallow((s) => ({
      toneMappingEnabled: s.toneMappingEnabled,
      toneMappingAlgorithm: s.toneMappingAlgorithm,
      exposure: s.exposure,
    }))
  )
  const specularColor = usePBRStore((s) => s.face.specularColor)
  const {
    bloomEnabled,
    bloomGain,
    bloomThreshold,
    bloomKnee,
    bloomRadius,
  } = usePostProcessingStore(
    useShallow((s) => ({
      bloomEnabled: s.bloomEnabled,
      bloomGain: s.bloomGain,
      bloomThreshold: s.bloomThreshold,
      bloomKnee: s.bloomKnee,
      bloomRadius: s.bloomRadius,
    }))
  )

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleShare = async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    const url = generateShareUrl({
      dimension,
      objectType,
      quantumMode,
      uniformScale,
      // Visual settings
      shaderType,
      shaderSettings,
      edgeColor,
      backgroundColor,
      skyboxSelection,
      skyboxIntensity,
      skyboxRotation,
      skyboxAnimationMode,
      skyboxAnimationSpeed,
      skyboxHighQuality,
      bloomEnabled,
      bloomGain,
      bloomThreshold,
      bloomKnee,
      bloomRadius,
      toneMappingEnabled,
      toneMappingAlgorithm,
      exposure,
      specularColor,
    })

    try {
      // Modern Clipboard API (supported by all modern browsers)
      await navigator.clipboard.writeText(url)
      setCopied(true)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      // Clipboard API failed (e.g., no permission, insecure context)
      // Log error and provide user feedback
      console.warn('Clipboard API failed:', error)
      // Since Clipboard API has 95%+ support, provide manual copy fallback
      setShareUrl(url)
      setFallbackOpen(true)
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <Button variant="secondary" size="sm" onClick={handleShare} className="w-full">
        {copied ? 'Copied!' : 'Share URL'}
      </Button>

      {copied && <p className="text-xs text-accent">Link copied to clipboard</p>}

      <InputModal
        isOpen={fallbackOpen}
        onClose={() => setFallbackOpen(false)}
        onConfirm={() => {}}
        title="Share Link"
        message="Copy this URL to share your scene:"
        initialValue={shareUrl}
        readOnly
        confirmText="Close"
        cancelText="Close"
      />
    </div>
  )
}
