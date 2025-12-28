import React, { useState } from 'react';
import { BloomControls } from './BloomControls';
import { BokehControls } from './BokehControls';
import { CinematicControls } from './CinematicControls';
import { PaperControls } from './PaperControls';
// NOTE: GravityControls moved to Advanced Rendering section (AdvancedObjectControls)
import { Switch } from '@/components/ui/Switch';
import { Tabs } from '@/components/ui/Tabs';
import { usePostProcessingStore, type PostProcessingSlice } from '@/stores/postProcessingStore';
import { useShallow } from 'zustand/react/shallow';
import { MiscControls } from './MiscControls';
import { RefractionControls } from './RefractionControls';

export const PostProcessingControls: React.FC = () => {
  const [activeTab, setActiveTab] = useState('bloom');

  const postProcessingSelector = useShallow((state: PostProcessingSlice) => ({
    bloomEnabled: state.bloomEnabled,
    setBloomEnabled: state.setBloomEnabled,
    cinematicEnabled: state.cinematicEnabled,
    setCinematicEnabled: state.setCinematicEnabled,
    bokehEnabled: state.bokehEnabled,
    setBokehEnabled: state.setBokehEnabled,
    refractionEnabled: state.refractionEnabled,
    setRefractionEnabled: state.setRefractionEnabled,
    paperEnabled: state.paperEnabled,
    setPaperEnabled: state.setPaperEnabled,
  }));
  const {
    bloomEnabled, setBloomEnabled,
    cinematicEnabled, setCinematicEnabled,
    bokehEnabled, setBokehEnabled,
    refractionEnabled, setRefractionEnabled,
    paperEnabled, setPaperEnabled,
  } = usePostProcessingStore(postProcessingSelector);

  const tabs = [
    {
      id: 'bloom',
      label: 'Bloom',
      content: (
        <div className="space-y-4">
          <Switch
            checked={bloomEnabled}
            onCheckedChange={setBloomEnabled}
            label="Enable Bloom"
          />
          <div className={!bloomEnabled ? 'opacity-50 pointer-events-none' : ''}>
            <BloomControls />
          </div>
        </div>
      ),
    },
    {
      id: 'cinematic',
      label: 'Cinematic',
      content: (
        <div className="space-y-4">
          <Switch
            checked={cinematicEnabled}
            onCheckedChange={setCinematicEnabled}
            label="Enable Cinematic"
          />
          <div className={!cinematicEnabled ? 'opacity-50 pointer-events-none' : ''}>
            <CinematicControls />
          </div>
        </div>
      ),
    },
    {
      id: 'dof',
      label: 'DoF',
      content: (
        <div className="space-y-4">
          <Switch
            checked={bokehEnabled}
            onCheckedChange={setBokehEnabled}
            label="Enable Depth of Field"
          />
          <div className={!bokehEnabled ? 'opacity-50 pointer-events-none' : ''}>
            <BokehControls />
          </div>
        </div>
      ),
    },
    {
      id: 'refraction',
      label: 'Refraction',
      content: (
        <div className="space-y-4">
          <Switch
            checked={refractionEnabled}
            onCheckedChange={setRefractionEnabled}
            label="Enable Refraction"
          />
          <div className={!refractionEnabled ? 'opacity-50 pointer-events-none' : ''}>
            <RefractionControls />
          </div>
        </div>
      ),
    },
    {
      id: 'paper',
      label: 'Paper',
      content: (
        <div className="space-y-4">
          <Switch
            checked={paperEnabled}
            onCheckedChange={setPaperEnabled}
            label="Enable Paper Texture"
          />
          <div className={!paperEnabled ? 'opacity-50 pointer-events-none' : ''}>
            <PaperControls />
          </div>
        </div>
      ),
    },
    {
      id: 'fx',
      label: 'FX',
      content: (
        <div className="space-y-4">
          <MiscControls />
        </div>
      ),
    },
    // NOTE: Gravity tab removed - controls moved to Advanced Rendering section
  ];

  return (
    <Tabs
      value={activeTab}
      onChange={setActiveTab}
      tabs={tabs}
      variant="default"
      tabListClassName="mb-4"
    />
  );
};
