/**
 * Share Button Component
 * Button for generating and copying a shareable URL with object type params.
 */

import React, { useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '@/components/ui/Button'
import { generateShareUrl } from '@/lib/url'
import { useGeometryStore } from '@/stores/geometryStore'
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
 * Renders the share action for copying a URL that captures object type state.
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

  const { dimension, objectType } = useGeometryStore(
    useShallow((s) => ({ dimension: s.dimension, objectType: s.objectType }))
  )
  const quantumMode = useExtendedObjectStore((s) => s.schroedinger.quantumMode)

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

    const url = generateShareUrl({ dimension, objectType, quantumMode })

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      timeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.warn('Clipboard API failed:', error)
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
