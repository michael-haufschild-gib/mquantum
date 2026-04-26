import React from 'react'

import { PerformanceSection } from '@/components/sections/Performance/PerformanceSection'
import { SettingsSection } from '@/components/sections/Settings/SettingsSection'

/** System tab — application settings and performance tuning. */
const SystemTabContent: React.FC = () => (
  <div>
    <SettingsSection defaultOpen={true} />
    <PerformanceSection defaultOpen={false} />
  </div>
)
SystemTabContent.displayName = 'SystemTabContent'

export default SystemTabContent
