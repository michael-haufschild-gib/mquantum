import { Icon } from '@/components/ui/Icon';
import { Tab, Tabs } from '@/components/ui/Tabs';
import React, { useState } from 'react';

// Import existing sidebar sections
import { AdvancedObjectControls } from '@/components/sections/Advanced/AdvancedObjectControls';
import { DocumentationSection } from '@/components/sections/Documentation/DocumentationSection';
import { EdgesSection } from '@/components/sections/Edges/EdgesSection';
import { EnvironmentSection } from '@/components/sections/Environment/EnvironmentSection';
import { FacesSection } from '@/components/sections/Faces/FacesSection';
import { LightsSection } from '@/components/sections/Lights/LightsSection';
import { PerformanceSection } from '@/components/sections/Performance/PerformanceSection';
import { PostProcessingSection } from '@/components/sections/PostProcessing/PostProcessingSection';
import { ReflectionsSection } from '@/components/sections/Reflections/ReflectionsSection';
import { SettingsSection } from '@/components/sections/Settings/SettingsSection';
import { ShadowsSection } from '@/components/sections/Shadows/ShadowsSection';

export const EditorRightPanel: React.FC = () => {
  // Default to 'object' tab as per user feedback (primary creative focus)
  const [activeTab, setActiveTab] = useState('object');

  const tabs: Tab[] = [
    {
      id: 'object',
      label: (
        <div className="flex items-center gap-2">
            <Icon name="sphere" size={14} />
            <span>Object</span>
        </div>
      ),
      content: (
        <div>
          {/* The "Subject" - Materials, Lines, Shadows, Reflections */}
          <FacesSection defaultOpen={true} />
          <EdgesSection defaultOpen={false} />
          <ShadowsSection defaultOpen={false} />
          <ReflectionsSection defaultOpen={false} />
          <AdvancedObjectControls />
        </div>
      ),
    },
    {
      id: 'scene',
      label: (
        <div className="flex items-center gap-2">
            <Icon name="home" size={14} />
            <span>Scene</span>
        </div>
      ),
      content: (
        <div>
          {/* The "Stage" - Background, Lighting, Lens, FX */}
          <EnvironmentSection defaultOpen={true} />
          <LightsSection defaultOpen={false} />
          <PostProcessingSection defaultOpen={false} />
        </div>
      ),
    },
    {
      id: 'system',
      label: (
        <div className="flex items-center gap-2">
            <Icon name="cog" size={14} />
            <span>System</span>
        </div>
      ),
      content: (
        <div>
          {/* The "App" - Settings, Meta, Output */}
          <SettingsSection defaultOpen={true} />
          <PerformanceSection defaultOpen={false} />
          <DocumentationSection defaultOpen={false} />
        </div>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-panel-bg w-full shrink-0 overflow-hidden">
      {/* Header Section */}
      <div className="p-4 border-b border-panel-border bg-panel-bg/50 backdrop-blur-sm z-10 shrink-0 flex items-center gap-2">
        <Icon name="menu" className="text-text-secondary" />
        <h2 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Visuals</h2>
      </div>

      {/* Tabs & Content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <Tabs
          data-testid="right-panel-tabs"
          tabs={tabs}
          value={activeTab}
          onChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
          tabListClassName="px-3 pt-3 pb-0 bg-transparent"
          contentClassName="flex-1 overflow-y-auto p-0 scrollbar-thin scrollbar-thumb-panel-border hover:scrollbar-thumb-text-secondary/50"
          variant="default"
          fullWidth
        />
      </div>
    </div>
  );
};
