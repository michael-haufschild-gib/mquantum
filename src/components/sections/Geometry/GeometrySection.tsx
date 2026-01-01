/**
 * Geometry Section Component
 * Section wrapper for object geometry controls
 */

import { Section } from '@/components/sections/Section';
import { ControlGroup } from '@/components/ui/ControlGroup';
import React from 'react';
import { DimensionSelector } from './DimensionSelector';
import { ObjectSettingsSection } from './ObjectSettingsSection';
import { ObjectTypeSelector } from './ObjectTypeSelector';

export interface GeometrySectionProps {
  defaultOpen?: boolean;
}

export const GeometrySection: React.FC<GeometrySectionProps> = React.memo(({
  defaultOpen = true,
}) => {
  return (
    <Section title="Geometry" defaultOpen={defaultOpen} data-testid="geometry-section">
      <div className="space-y-1">
        <ControlGroup title="Dimensions" collapsible defaultOpen>
            <DimensionSelector />
        </ControlGroup>

        <ControlGroup title="Object Type" collapsible defaultOpen>
            <ObjectTypeSelector />
        </ControlGroup>

        <ObjectSettingsSection />
      </div>
    </Section>
  );
});

GeometrySection.displayName = 'GeometrySection';
