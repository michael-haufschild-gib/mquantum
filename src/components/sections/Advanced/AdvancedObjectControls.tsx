import { Section } from '@/components/sections/Section';
import { useGeometryStore } from '@/stores/geometryStore';
import React, { useMemo } from 'react';
import { BlackHoleAdvanced } from './BlackHoleAdvanced';
import { FractalRenderQuality } from './FractalRenderQuality';
import { PolytopeAdvanced } from './PolytopeAdvanced';
import { SchroedingerAdvanced } from './SchroedingerAdvanced';
import { SharedAdvancedControls } from './SharedAdvancedControls';

// Object types that show the Advanced Rendering section
const ADVANCED_RENDERING_OBJECT_TYPES = [
  'mandelbulb',
  'quaternion-julia',
  'schroedinger',
  'blackhole',
  'hypercube',
  'simplex',
  'cross-polytope',
  'wythoff-polytope',
  'root-system',
  'clifford-torus',
  'nested-torus',
];

// Note: Quality preset toggles (fast/balanced/quality/ultra) have been removed
// - Schrödinger uses fixed sample counts (64 HQ, 32 fast) in shader
// - Black hole uses Max Steps and Step Size sliders in BlackHoleAdvanced

export const AdvancedObjectControls: React.FC = React.memo(() => {
  const objectType = useGeometryStore(state => state.objectType);

  const isVisible = useMemo(() =>
    ADVANCED_RENDERING_OBJECT_TYPES.includes(objectType),
    [objectType]
  );

  const isPolytope = useMemo(() =>
    ['hypercube', 'simplex', 'cross-polytope', 'wythoff-polytope'].includes(objectType),
    [objectType]
  );

  // Show for all supported object types (fractals + polytopes)
  if (!isVisible) {
    return null;
  }

  return (
    <Section title="Advanced Rendering" defaultOpen={true} data-testid="advanced-object-controls">
      {/* Global Settings (Shared) - for all objects */}
      <SharedAdvancedControls />

      {/* Object-Specific Settings */}
      {objectType === 'schroedinger' && <SchroedingerAdvanced />}
      {objectType === 'blackhole' && <BlackHoleAdvanced />}
      {(objectType === 'mandelbulb' || objectType === 'quaternion-julia') && <FractalRenderQuality />}
      {isPolytope && <PolytopeAdvanced />}
    </Section>
  );
});

AdvancedObjectControls.displayName = 'AdvancedObjectControls';
