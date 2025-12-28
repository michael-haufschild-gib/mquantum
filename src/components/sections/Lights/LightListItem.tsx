/**
 * Light List Item Component
 *
 * Displays a single light entry in the light list with:
 * - Light name and type icon
 * - Enable/disable toggle
 * - Selection highlight
 * - Delete button (can be disabled for ambient light)
 */

import AmbientIcon from '@/assets/icons/light-ambient.svg?react';
import DirectionalIcon from '@/assets/icons/light-directional.svg?react';
import PointIcon from '@/assets/icons/light-point.svg?react';
import SpotIcon from '@/assets/icons/light-spot.svg?react';
import LightToggleOffIcon from '@/assets/icons/light-toggle-off.svg?react';
import LightToggleOnIcon from '@/assets/icons/light-toggle-on.svg?react';
import TrashIcon from '@/assets/icons/trash.svg?react';
import type { LightSource, LightType } from '@/rendering/lights/types';
import React, { memo } from 'react';

/** Special ID for the virtual ambient light entry */
export const AMBIENT_LIGHT_ID = '__ambient__';

export interface LightListItemProps {
  light: LightSource;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onRemove: () => void;
  /** If true, delete button is visible but disabled (for ambient light) */
  isDeleteDisabled?: boolean;
}

/**
 * Get icon component for light type
 * @param type - Type of light source
 * @returns JSX element for the light icon
 */
const getLightIcon = (type: LightSource['type'] | 'ambient'): React.ReactNode => {
  const iconClass = "w-4 h-4";
  switch (type) {
    case 'point':
      return <PointIcon className={iconClass} />;
    case 'directional':
      return <DirectionalIcon className={iconClass} />;
    case 'spot':
      return <SpotIcon className={iconClass} />;
    case 'ambient':
      return <AmbientIcon className={iconClass} />;
  }
};

export const LightListItem: React.FC<LightListItemProps> = memo(function LightListItem({
  light,
  isSelected,
  onSelect,
  onToggle,
  onRemove,
  isDeleteDisabled = false,
}) {
  // Determine the icon type - use 'ambient' for ambient light entries
  const iconType: LightType | 'ambient' = light.id === AMBIENT_LIGHT_ID ? 'ambient' : light.type;

  return (
    <div
      className={`
        flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors
        ${isSelected
          ? 'bg-accent/20 border border-accent/50'
          : 'bg-panel-border/50 border border-transparent hover:bg-panel-border'
        }
      `}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      aria-pressed={isSelected}
    >
      {/* Light type icon with color */}
      <span
        className={`flex-shrink-0 ${light.enabled ? '' : 'opacity-40'}`}
        style={{ color: light.color }}
      >
        {getLightIcon(iconType)}
      </span>

      {/* Light name */}
      <span
        className={`flex-1 text-sm truncate ${
          light.enabled ? 'text-text-primary' : 'text-text-secondary'
        }`}
      >
        {light.name}
      </span>

      {/* Enable/disable toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`
          p-1 rounded transition-colors
          ${light.enabled
            ? 'text-accent hover:text-accent/80'
            : 'text-text-tertiary hover:text-text-secondary'
          }
        `}
        aria-label={light.enabled ? 'Disable light' : 'Enable light'}
        title={light.enabled ? 'Disable light' : 'Enable light'}
      >
        {light.enabled ? (
          <LightToggleOnIcon className="w-4 h-4" />
        ) : (
          <LightToggleOffIcon className="w-4 h-4" />
        )}
      </button>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (!isDeleteDisabled) {
            onRemove();
          }
        }}
        className={`p-1 rounded transition-colors ${
          isDeleteDisabled
            ? 'text-text-tertiary/30 cursor-not-allowed'
            : 'text-text-tertiary hover:text-error'
        }`}
        aria-label={isDeleteDisabled ? 'Cannot remove ambient light' : 'Remove light'}
        title={isDeleteDisabled ? 'Ambient light cannot be removed' : 'Remove light (Delete key)'}
        disabled={isDeleteDisabled}
      >
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  );
});
