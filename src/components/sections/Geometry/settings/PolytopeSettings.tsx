import { Section } from '@/components/sections/Section';
import { Slider } from '@/components/ui/Slider';
import { getConfigStoreKey, getTypeName } from '@/lib/geometry/registry';
import { useExtendedObjectStore } from '@/stores/extendedObjectStore';
import { useGeometryStore } from '@/stores/geometryStore';

/**
 * Polytope settings controls.
 *
 * Provides scale control for standard polytopes (hypercube, simplex, cross-polytope).
 * This brings polytopes into alignment with extended objects by providing
 * a unified configuration interface.
 * @returns The polytope settings UI component
 */
export function PolytopeSettings() {
  const objectType = useGeometryStore((state) => state.objectType);
  const config = useExtendedObjectStore((state) => state.polytope);
  const setScale = useExtendedObjectStore((state) => state.setPolytopeScale);

  // Get display name from registry (data-driven)
  const typeName = getTypeName(objectType);

  // Get type-specific default scale

  // Simplex needs a larger range due to its default of 4.0
  // This is a specific UI constraint, not a category-level property
  const maxScale = getConfigStoreKey(objectType) === 'polytope' && objectType === 'simplex' ? 8.0 : 5.0;

  return (
    <div data-testid="polytope-settings">
      <Section title="Settings" defaultOpen={true}>
        {/* Scale slider with type-specific range */}
        <Slider
          label={`${typeName} Scale`}
          min={0.5}
          max={maxScale}
          step={0.1}
          value={config.scale}
          onChange={setScale}
          showValue
          data-testid="polytope-scale"
        />
        <p className="text-xs text-text-secondary">
          Vertices in [-scale, scale] per axis.
        </p>
      </Section>
    </div>
  );
}
