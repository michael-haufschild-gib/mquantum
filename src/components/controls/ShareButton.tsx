/**
 * Share Button Component
 * Button for generating and copying a shareable URL
 */

import React, { useState, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/Button';
import { generateShareUrl } from '@/lib/url';
import { useGeometryStore } from '@/stores/geometryStore';
import { useTransformStore } from '@/stores/transformStore';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { usePostProcessingStore } from '@/stores/postProcessingStore';
import { InputModal } from '@/components/ui/InputModal';

export interface ShareButtonProps {
  className?: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ className = '' }) => {
  const [copied, setCopied] = useState(false);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Geometry store values
  const { dimension, objectType } = useGeometryStore(
    useShallow((s) => ({ dimension: s.dimension, objectType: s.objectType }))
  );
  const uniformScale = useTransformStore((s) => s.uniformScale);

  // Visual settings (PRD Story 1 AC6, Story 7 AC7)
  const { shaderType, shaderSettings, edgeColor, backgroundColor } = useAppearanceStore(
    useShallow((s) => ({
      shaderType: s.shaderType,
      shaderSettings: s.shaderSettings,
      edgeColor: s.edgeColor,
      backgroundColor: s.backgroundColor,
    }))
  );
  const { bloomEnabled, bloomIntensity } = usePostProcessingStore(
    useShallow((s) => ({ bloomEnabled: s.bloomEnabled, bloomIntensity: s.bloomIntensity }))
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleShare = async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const url = generateShareUrl({
      dimension,
      objectType,
      uniformScale,
      // Visual settings
      shaderType,
      shaderSettings,
      edgeColor,
      backgroundColor,
      bloomEnabled,
      bloomIntensity,
    });

    try {
      // Modern Clipboard API (supported by all modern browsers)
      await navigator.clipboard.writeText(url);
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Clipboard API failed (e.g., no permission, insecure context)
      // Log error and provide user feedback
      console.warn('Clipboard API failed:', error);
      // Since Clipboard API has 95%+ support, provide manual copy fallback
      setShareUrl(url);
      setFallbackOpen(true);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleShare}
        className="w-full"
      >
        {copied ? 'Copied!' : 'Share URL'}
      </Button>

      {copied && (
        <p className="text-xs text-accent">Link copied to clipboard</p>
      )}

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
  );
};
